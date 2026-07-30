#!/usr/bin/env python3
"""Digitise a ZVH S11 trace from a PERSPECTIVE-CORRECTED screen image.

This supersedes the two photo digitisers for these four conditions. Those failed
because the photos were shot at an angle: two independent pipelines disagreed by
up to 176 MHz on dip position, which is more than the effect being measured. Once
the perspective is removed the problem becomes easy, because the graticule is
axis-aligned and its gridlines can be found exactly.

CALIBRATION -- both axes are SCALE from the graticule, ORIGIN from the marker.
  y  gridline pitch = 2 dB; origin = the marker's printed dB value.
  x  gridline pitch = span/10; origin = the marker's printed frequency.

Identifying WHICH gridline is 0.0 dB was tried and abandoned. It is not robust:
the plot band, the header bar and the graticule all read as navy, and small
errors in isolating them moved the 0 dB reference by one to three divisions,
differently on each image. Pitch, by contrast, is recovered consistently
(~27 px per 2 dB on all four). So take only the pitch from the graticule and let
the instrument's own printed marker value fix the offset -- it is exact and it
needs no interpretation.

Usage:
  digitise_vna_rectified.py <img> <marker_GHz> <marker_dB> <span_GHz> <out.csv>
"""

from __future__ import annotations

import csv
import sys

import cv2
import numpy as np

DB_PER_DIV = 2.0


def gridlines(mask_bad, gray, axis, n_min=6):
    """Positions of graticule lines along `axis` (0 = rows)."""
    k = (1, 15) if axis == 0 else (15, 1)
    g8 = np.where(np.isnan(gray), np.nanmedian(gray), gray).astype(np.uint8)
    th = cv2.morphologyEx(g8, cv2.MORPH_TOPHAT,
                          cv2.getStructuringElement(cv2.MORPH_RECT, k)).astype(float)
    th[mask_bad] = np.nan
    prof = np.nan_to_num(np.nanmean(th, axis=1 - axis))
    thr = prof.mean() + 1.0 * prof.std()
    pos, i, n = [], 0, len(prof)
    while i < n:
        if prof[i] > thr:
            j = i
            while j + 1 < n and prof[j + 1] > thr:
                j += 1
            s = prof[i:j + 1]
            if s.sum() > 0:
                pos.append(i + float((s * np.arange(len(s))).sum() / s.sum()))
            i = j + 1
        else:
            i += 1
    pos = [p for p in pos if 2 < p < n - 2]
    if len(pos) < n_min:
        return None, None
    d = np.diff(pos)
    pitch = float(np.median(d))
    # keep the longest run consistent with that pitch
    best, cur = [], [pos[0]]
    for p in pos[1:]:
        if abs(p - cur[-1] - pitch) < 0.45 * pitch:
            cur.append(p)
        else:
            best, cur = (cur if len(cur) > len(best) else best), [p]
    best = cur if len(cur) > len(best) else best
    if len(best) < n_min:
        return None, None
    idx = np.round((np.array(best) - best[0]) / pitch).astype(float)
    A = np.vstack([np.ones(len(idx)), idx]).T
    (a, b), *_ = np.linalg.lstsq(A, np.array(best), rcond=None)
    return a, b


def run(path, mark_f, mark_db, span, out_csv, label=""):
    im = cv2.imread(path)
    if im is None:
        raise SystemExit(f"cannot read {path}")
    H, W = im.shape[:2]
    rgb = cv2.cvtColor(im, cv2.COLOR_BGR2RGB).astype(int)
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    trace = ((G - B) > 10) & ((R - B) > 10) & (np.abs(R - G) < 45) & \
            (((R + G) / 2) > 55)
    cyan = ((G - R) > 20) & ((B - R) > 20) & (B > 90)
    red = ((R - G) > 45) & ((R - B) > 45) & (R > 100)

    bad = cv2.dilate(((trace | cyan | red) * 255).astype(np.uint8),
                     np.ones((3, 3), np.uint8)) > 0
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(float)
    gray[bad] = np.nan

    # FIRST isolate the plot area. The header carries its own horizontal rules at
    # a similar spacing to the graticule, and letting them into the line fit put
    # the 0 dB reference a full division high on the one image that could be
    # checked. The plot is the tall band of dark navy fill.
    navy = (B > R + 12) & (B > G + 6) & (R < 140)
    # CLOSE the row mask before taking the longest run. Two traps here, both hit:
    # the gridlines chop the fill into strips so a raw "longest run" returns the
    # gap between two gridlines; and the dark blue header bar is also navy, so a
    # raw "first to last" swallows the header and puts the 0 dB reference about
    # 2.5 divisions high. Closing bridges the gridlines but not the gap between
    # header and plot, so the longest run is the plot.
    rowfrac = navy.mean(axis=1) > 0.45
    closed = cv2.morphologyEx(rowfrac.astype(np.uint8).reshape(-1, 1),
                              cv2.MORPH_CLOSE, np.ones((15, 1), np.uint8)).ravel() > 0
    runs, s = [], None
    for i, ok in enumerate(closed):
        if ok and s is None:
            s = i
        elif not ok and s is not None:
            runs.append((s, i))
            s = None
    if s is not None:
        runs.append((s, len(closed)))
    if not runs:
        raise SystemExit("could not find the plot band")
    ytop, ybot = max(runs, key=lambda r: r[1] - r[0])
    if ybot - ytop < 40:
        raise SystemExit("plot band implausibly short")
    colfrac = navy[ytop:ybot].mean(axis=0)
    xin = np.nonzero(colfrac > 0.35)[0]
    xlo, xhi = (int(xin.min()), int(xin.max())) if len(xin) else (0, W - 1)
    band = np.zeros_like(trace)
    band[ytop:ybot, xlo:xhi + 1] = True
    trace &= band

    # run the line fit on the CROP, then put the offsets back, so the profile is
    # not diluted by everything outside the plot
    sub_bad = bad[ytop:ybot, xlo:xhi + 1]
    sub_gray = gray[ytop:ybot, xlo:xhi + 1]
    y0, ypitch = gridlines(sub_bad, sub_gray, 0)
    x0, xpitch = gridlines(sub_bad, sub_gray, 1)
    if y0 is None or x0 is None:
        raise SystemExit("gridline detection failed")
    y0 += ytop
    x0 += xlo

    colcy = (cyan & band).sum(axis=0)
    xm = float(np.argmax(np.convolve(colcy, np.ones(3) / 3, "same")))
    cy_cols = np.nonzero(colcy > 0.5 * colcy.max())[0]

    # Trace by YELLOWNESS PEAK, not by a binary mask. On the flat parts of the
    # sweep the trace washes out towards white and fails any fixed yellow
    # threshold, which is why the mask version tracked only the steep sections.
    # Taking the most-yellow pixel in each column tracks it continuously.
    yellowness = ((R + G) / 2.0 - B).astype(float)
    # The orange M1 bar and badge are strongly "yellow" by this measure and sit
    # inside the plot band, right under the marker. Left in, the tracker locked
    # onto the bar instead of the trace and reported the anchor value as the
    # minimum. Exclude them, and the cyan marker line, explicitly.
    veto = cv2.dilate(((red | cyan) * 255).astype(np.uint8),
                      np.ones((3, 3), np.uint8)) > 0
    yellowness[veto] = -1e6
    yellowness[~band] = -1e6
    yellowness = cv2.blur(yellowness, (1, 3))
    cols = {}
    for x in range(xlo, xhi + 1):
        col = yellowness[:, x]
        j = int(np.argmax(col))
        if col[j] < 8:
            continue
        lo2, hi2 = max(ytop, j - 4), min(ybot, j + 5)
        seg = np.clip(col[lo2:hi2] - col[lo2:hi2].min(), 0, None)
        if seg.sum() <= 0:
            continue
        cols[x] = lo2 + float((seg * np.arange(len(seg))).sum() / seg.sum())
    # bridge the marker line: drop its columns, interpolate across
    for x in cy_cols:
        cols.pop(int(x), None)

    # Trace y AT the marker, from the columns either side of the occluding cyan
    # line.
    #
    # KNOWN RESIDUAL, stated rather than papered over. Read back, the anchored
    # curves give -14.71 / -14.90 / -10.26 / -11.42 dB against printed
    # -13.70 / -14.06 / -10.18 / -11.13. The error is ~1 dB where the marker sits
    # on a steep V (stretch, bend) and <0.3 dB where the trace is flat there
    # (skin, baseline), so it scales with local slope: it is the cost of bridging
    # the columns the marker line covers.
    #
    # A local quadratic fit across the gap was tried instead of the median and
    # came out marginally WORSE (-14.71 vs -14.62 on stretch), so this is not a
    # fitting artifact and a cleverer interpolator will not remove it. The real
    # fix is the instrument's own marker tick, which it draws at the trace
    # position inside the occluded band -- detecting that is the next step if
    # this residual ever matters.
    near = [cols[x] for x in cols if 0 < abs(x - xm) <= 14]
    if not near:
        raise SystemExit("no trace either side of the marker line")
    y_mark = float(np.median(near))

    db = lambda y: mark_db - (y - y_mark) / ypitch * DB_PER_DIV   # noqa: E731
    ghz = lambda x: mark_f + (x - xm) * (span / 10.0) / xpitch   # noqa: E731

    xs = np.array(sorted(cols))
    ys = np.array([cols[x] for x in xs])
    f = np.array([ghz(x) for x in xs])
    v = np.array([db(y) for y in ys])
    keep = (f >= 0.0) & (f <= span)
    f, v = f[keep], v[keep]

    at_mark = float(np.interp(mark_f, f, v))
    k = int(np.argmin(v))
    print(f"{path}  {label}")
    print(f"  y: marker row {y_mark:.1f} = {mark_db} dB, "
          f"{ypitch:.2f} px per 2 dB")
    print(f"  x: marker col {xm:.1f}, {xpitch:.2f} px per {span/10:.5f} GHz")
    print(f"  {len(f)} columns, {f[0]:.3f}-{f[-1]:.3f} GHz")
    print(f"  value at marker {at_mark:+.2f} dB")
    print(f"  minimum {v[k]:.2f} dB at {f[k]:.4f} GHz")

    with open(out_csv, "w", newline="", encoding="utf-8") as fh:
        wr = csv.writer(fh)
        wr.writerow(["freq_GHz", "S11_dB_digitised"])
        wr.writerows([[round(a, 5), round(b, 3)] for a, b in zip(f, v)])

    vis = im.copy()
    for x in cols:
        cv2.circle(vis, (x, int(cols[x])), 1, (0, 0, 255), -1)
    for i in range(-6, 8):
        yy = int(y_mark + ypitch * i)
        if 0 <= yy < H:
            cv2.line(vis, (0, yy), (W, yy), (0, 255, 0), 1)
    cv2.imwrite(out_csv.replace(".csv", "_chk.png"),
                cv2.resize(vis, (W * 2, H * 2), interpolation=cv2.INTER_NEAREST))
    return at_mark


if __name__ == "__main__":
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    lbl = ""
    if "--label" in sys.argv:
        lbl = sys.argv[sys.argv.index("--label") + 1]
    run(a[0], float(a[1]), float(a[2]), float(a[3]), a[4], lbl)
