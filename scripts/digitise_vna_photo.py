#!/usr/bin/env python3
"""Digitise an S11 trace from a PHOTOGRAPH of a Rohde & Schwarz ZVH screen.

These are phone photos taken at an angle, with glare -- not screenshots. Finding
the plot box outline directly is unreliable because glare wipes out the outer
gridlines. So the mapping is built from two things that ARE robust:

  SCALE   the graticule is 10x10 evenly spaced divisions. The SPACING is
          recoverable from whatever interior gridlines survive the glare, even if
          the outermost ones do not, because spacing is periodic.
             x: one division = (f_stop - f_start)/10
             y: one division = 2 dB
  ORIGIN  the instrument draws a cyan marker line at a known frequency, and
          prints that marker's exact dB reading on screen. That fixes the offset
          of both axes at a point whose true value is known exactly.

So: scale from the grid, origin from the marker. No dependence on locating the
plot boundary at all.

The 2 dB/division and the marker convention were verified against the clean
640x480 screenshot inside harish003.set, whose exact trace is known from the
binary: that layout reproduces the known trace to better than 0.15 dB.

ACCURACY. This is a photograph of a 201-point trace on a low-resolution LCD.
Expect roughly +/-0.5 dB and +/-25 MHz, dominated by trace thickness and residual
perspective. Good enough to compare conditions against each other; NOT good
enough to quote as absolute measured performance. The .set files are the source
of truth where they exist.

Usage:
  digitise_vna_photo.py <photo> <f_start_GHz> <f_stop_GHz> <marker_GHz>
                        <marker_dB> <out_csv> [--debug]
"""

from __future__ import annotations

import csv
import os
import sys

import cv2
import numpy as np

DB_PER_DIV = 2.0
N_DIV = 10


def straighten(bgr):
    """Rough perspective correction: map the screen quad to a canonical frame."""
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    g = cv2.GaussianBlur(g, (5, 5), 0)
    _, th = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    th = cv2.morphologyEx(th, cv2.MORPH_CLOSE,
                          cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9)))
    cnts, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best, bestarea = None, 0
    for c in cnts:
        area = cv2.contourArea(c)
        if area < 0.05 * bgr.shape[0] * bgr.shape[1]:
            continue
        peri = cv2.arcLength(c, True)
        for eps in (0.02, 0.03, 0.015, 0.04, 0.05):
            ap = cv2.approxPolyDP(c, eps * peri, True)
            if len(ap) == 4 and area > bestarea:
                best, bestarea = ap.reshape(4, 2).astype(np.float32), area
                break
    if best is None:
        c = max(cnts, key=cv2.contourArea)
        best = cv2.boxPoints(cv2.minAreaRect(c)).astype(np.float32)
    s, d = best.sum(1), np.diff(best, axis=1).ravel()
    quad = np.array([best[np.argmin(s)], best[np.argmin(d)],
                     best[np.argmax(s)], best[np.argmax(d)]], dtype=np.float32)
    dst = np.array([[0, 0], [1023, 0], [1023, 767], [0, 767]], dtype=np.float32)
    return cv2.warpPerspective(bgr, cv2.getPerspectiveTransform(quad, dst),
                               (1024, 768))


def grid_pitch(rect):
    """Recover the graticule pitch in px, per axis, from surviving gridlines."""
    g = cv2.cvtColor(rect, cv2.COLOR_BGR2GRAY).astype(float)
    h, w = g.shape
    sub = g[int(0.25 * h):int(0.80 * h), int(0.05 * w):int(0.99 * w)]
    light = sub > (sub.mean() + 0.8 * sub.std())

    def pitch(profile, lo, hi):
        """Periodic pitch by autocorrelation -- robust to gridlines lost to glare.

        Peak-grouping fails here: on an angled, glare-hit photo some gridlines
        simply are not there, so nearest-neighbour spacings mix 1x and 2x the true
        pitch. Autocorrelation uses the whole profile at once and does not care
        which individual lines survived.
        """
        p = profile.astype(float)
        p = p - p.mean()
        if p.std() == 0:
            return None
        ac = np.correlate(p, p, mode="full")[len(p) - 1:]
        ac /= ac[0]
        lo, hi = int(lo), min(int(hi), len(ac) - 2)
        if hi <= lo + 2:
            return None
        seg = ac[lo:hi]
        k = int(np.argmax(seg)) + lo
        # parabolic refinement around the peak
        if 0 < k < len(ac) - 1:
            y0, y1, y2 = ac[k - 1], ac[k], ac[k + 1]
            den = (y0 - 2 * y1 + y2)
            if den != 0:
                k = k + 0.5 * (y0 - y2) / den
        return float(k)

    # the rectified frame is 1024x768 and the graticule is 10x10 over most of it,
    # so the pitch must lie near 1024/10 and 768/10 -- search a generous window
    return (pitch(light.sum(0), 60, 140), pitch(light.sum(1), 30, 80))


def marker_x(rect):
    """The cyan vertical marker line: the strongest cyan column."""
    hsv = cv2.cvtColor(rect, cv2.COLOR_BGR2HSV)
    H, S, V = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    cy = ((H > 82) & (H < 100) & (S > 90) & (V > 120)).astype(float)
    h = cy.shape[0]
    cy[:int(0.25 * h), :] = 0
    cy[int(0.85 * h):, :] = 0
    col = cy.sum(0)
    if col.max() < 10:
        return None
    return float(np.argmax(col))


def trace_columns(rect):
    """Yellow-trace mask that survives an overexposed photo.

    An HSV saturation threshold does not work here: the LCD is blown out in the
    photos and the trace comes through at S ~ 35, below any threshold that would
    still reject the white gridlines. Use a ratio test instead --

        yellow  =  R and G both clearly above B, AND R ~= G

    -- which is scale-free, so it does not care how washed out the image is. The
    second condition is what rejects the red M1 marker bar, where R >> G.
    """
    b = rect[:, :, 0].astype(int)
    g = rect[:, :, 1].astype(int)
    r = rect[:, :, 2].astype(int)
    mean_rg = (r + g) / 2.0
    m = ((g - b) > 18) & ((r - b) > 18) & \
        (np.abs(r - g) < 0.35 * np.maximum(mean_rg, 1)) & (mean_rg > 60)
    h, w = m.shape
    m[:int(0.20 * h), :] = False
    m[int(0.86 * h):, :] = False
    out = {}
    for x in range(w):
        ys = np.nonzero(m[:, x])[0]
        if len(ys) == 0 or len(ys) > 90:
            continue
        out[x] = float(np.median(ys))
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    debug = "--debug" in sys.argv
    if len(args) < 6:
        print(__doc__)
        return 2
    src, f0, f1, mf, mdb, outcsv = (args[0], float(args[1]), float(args[2]),
                                    float(args[3]), float(args[4]), args[5])

    bgr = cv2.imread(src)
    if bgr is None:
        raise SystemExit(f"cannot read {src}")
    rect = straighten(bgr)
    if debug:
        cv2.imwrite(outcsv.replace(".csv", "_rect.png"), rect)

    px, py = grid_pitch(rect)
    mx = marker_x(rect)
    if px is None or py is None or mx is None:
        raise SystemExit(f"calibration failed (px={px}, py={py}, marker_x={mx})")

    ghz_per_px = (f1 - f0) / (N_DIV * px)
    db_per_px = DB_PER_DIV / py

    tr = trace_columns(rect)
    if len(tr) < 150:
        raise SystemExit(f"only {len(tr)} trace columns -- inspect with --debug")
    xs = np.array(sorted(tr), dtype=float)
    ys = np.array([tr[int(x)] for x in xs])

    freqs = mf + (xs - mx) * ghz_per_px
    k = int(np.argmin(np.abs(freqs - mf)))
    dbs = mdb - (ys - ys[k]) * db_per_px

    keep = (freqs >= f0) & (freqs <= f1)
    freqs, dbs = freqs[keep], dbs[keep]

    print(f"{os.path.basename(src)}")
    print(f"  grid pitch  x {px:.2f} px/div  y {py:.2f} px/div"
          f"   marker line at x={mx:.0f}")
    print(f"  scales      {ghz_per_px*1000:.3f} MHz/px, {db_per_px:.4f} dB/px")
    print(f"  span        {freqs[0]:.3f}-{freqs[-1]:.3f} GHz, {len(freqs)} columns")
    kmin = int(np.argmin(dbs))
    print(f"  minimum     {dbs[kmin]:.2f} dB at {freqs[kmin]:.4f} GHz")
    print(f"  anchored at {mf} GHz = {mdb} dB (instrument readout)")

    with open(outcsv, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["freq_GHz", "S11_dB_digitised"])
        w.writerows([[round(f, 5), round(v, 3)] for f, v in zip(freqs, dbs)])
    print(f"  -> {outcsv}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
