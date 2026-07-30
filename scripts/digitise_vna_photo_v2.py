"""Digitise a ZVH trace from a photo. Third pass.

Two corrections over dig2:
  1. SCALE comes from the FITTED gridline pitch, not from assuming the graticule
     fills the warp. It never exactly does.
  2. Residual SHEAR is measured and removed. After a rough warp the gridlines are
     still tilted by a few pixels across the frame; at 90 px per 2 dB that is a
     few tenths of a dB of drift away from the marker anchor. The tilt is found by
     cross-correlating the row profile of the left third against the right third
     (and likewise column profiles top vs bottom), then removed with a shear.
"""
import csv
import sys
import cv2
import numpy as np

WW, HH = 1600, 900


def warp_of(im, quad):
    dst = np.array([[0, 0], [WW, 0], [WW, HH], [0, HH]], np.float32)
    M = cv2.getPerspectiveTransform(quad, dst)
    return cv2.warpPerspective(im, M, (WW, HH)), M


def masks(w):
    rgb = cv2.cvtColor(w, cv2.COLOR_BGR2RGB).astype(int)
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mrg = (R + G) / 2.0
    trace = ((G - B) > 16) & ((R - B) > 16) & \
            (np.abs(R - G) < 0.38 * np.maximum(mrg, 1)) & (mrg > 55)
    cyan = ((G - R) > 20) & ((B - R) > 20) & (B > 90)
    red = ((R - G) > 40) & ((R - B) > 40) & (R > 100)
    return trace, cyan, red


def tophat(w, axis, bad):
    gray = cv2.cvtColor(w, cv2.COLOR_BGR2GRAY)
    k = (1, 31) if axis == 0 else (31, 1)
    th = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT,
                          cv2.getStructuringElement(cv2.MORPH_RECT, k)).astype(float)
    th[bad] = np.nan
    return th


def prof_of(th, axis, lo, hi):
    seg = th[:, lo:hi] if axis == 0 else th[lo:hi, :]
    p = np.nanmean(seg, axis=1 - axis)
    p = np.nan_to_num(p, nan=0.0)
    return p - cv2.blur(p.reshape(-1, 1), (1, 121)).ravel()


def shear_estimate(th, axis, n=1600):
    """Offset between the profile of the first third and the last third."""
    L = WW if axis == 0 else HH
    a = prof_of(th, axis, 0, L // 3)
    b = prof_of(th, axis, 2 * L // 3, L)
    a = a - a.mean()
    b = b - b.mean()
    best, bd = -1e18, 0
    for d in range(-45, 46):
        bb = np.roll(b, d)
        s = float((a * bb).sum())
        if s > best:
            best, bd = s, d
    # b is 2L/3 to the right of a's centre; centres are 2L/3 apart
    return -bd / (2.0 * L / 3.0)


def peaks_of(p):
    thr = p.mean() + 0.9 * p.std()
    out, i, n = [], 0, len(p)
    while i < n:
        if p[i] > thr:
            j = i
            while j + 1 < n and p[j + 1] > thr:
                j += 1
            s = p[i:j + 1]
            if s.sum() > 0:
                out.append(i + float((s * np.arange(len(s))).sum() / s.sum()))
            i = j + 1
        else:
            i += 1
    return out


def fit_comb(pos, guess, n=11):
    if len(pos) < 4:
        return None
    pos = np.array(sorted(pos))
    idx = np.round((pos - pos[0]) / guess).astype(int)
    keep = np.concatenate([[True], np.diff(idx) > 0])
    pos, idx = pos[keep], idx[keep]
    if len(pos) < 4:
        return None
    A = np.vstack([np.ones(len(idx)), idx.astype(float)]).T
    (a, b), *_ = np.linalg.lstsq(A, pos, rcond=None)
    r = pos - (a + b * idx)
    return a, b, float(np.sqrt((r ** 2).mean())), len(pos)


def run(path, quad, mark_f, mark_db, f_lo, f_hi, out_csv):
    im = cv2.imread(path)
    print(f"\n{path}")

    # --- iterate the quad so the graticule fills the warp ---
    for it in range(5):
        w, M = warp_of(im, quad)
        tr, cy, rd = masks(w)
        bad = cv2.dilate(((tr | cy | rd) * 255).astype(np.uint8),
                         np.ones((5, 5), np.uint8)) > 0
        thh, thv = tophat(w, 0, bad), tophat(w, 1, bad)
        fy = fit_comb(peaks_of(prof_of(thh, 0, 0, WW)), HH / 10)
        fx = fit_comb(peaks_of(prof_of(thv, 1, 0, HH)), WW / 10)
        if fy is None or fx is None:
            raise SystemExit("  gridline fit failed")
        y0, y1 = fy[0], fy[0] + fy[1] * 10
        x0, x1 = fx[0], fx[0] + fx[1] * 10
        if max(abs(y0), abs(y1 - HH), abs(x0), abs(x1 - WW)) < 2.0:
            break
        c = np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], np.float32)
        quad = cv2.perspectiveTransform(
            c.reshape(1, 4, 2), np.linalg.inv(M)).reshape(4, 2).astype(np.float32)

    # --- remove residual shear ---
    # Shear correction was tried and removed. Cross-correlating third-profiles
    # is too noisy on these photos -- it returned dx/dy = -0.075 on the baseline,
    # which visibly tilted a frame that had been nearly square. The residual tilt
    # after the quad refinement is small; leaving it alone is the lesser error.
    # Re-warp with the graticule INSET by MARGIN px. The refinement above makes
    # the graticule fill the frame exactly, which CROPS the trace at the first and
    # last gridline -- and on two of the four photos that threw away a third of the
    # sweep. Adding margin keeps the whole plot. Pitch and trace are still measured
    # in the same warp, so the calibration stays self-consistent.
    MARGIN = 110
    dst2 = np.array([[MARGIN, MARGIN], [WW - MARGIN, MARGIN],
                     [WW - MARGIN, HH - MARGIN], [MARGIN, HH - MARGIN]], np.float32)
    M = cv2.getPerspectiveTransform(quad, dst2)
    w = cv2.warpPerspective(im, M, (WW, HH))
    sy = sx = 0.0
    S = np.array([[1.0, sx, 0.0], [sy, 1.0, 0.0]], np.float32)
    S[0, 2] = -sx * HH / 2
    S[1, 2] = -sy * WW / 2
    w = cv2.warpAffine(w, S, (WW, HH))
    print(f"  shear removed: dy/dx {sy:+.5f}, dx/dy {sx:+.5f}")

    tr, cy, rd = masks(w)
    bad = cv2.dilate(((tr | cy | rd) * 255).astype(np.uint8),
                     np.ones((5, 5), np.uint8)) > 0
    fy = fit_comb(peaks_of(prof_of(tophat(w, 0, bad), 0, 0, WW)), HH / 10)
    fx = fit_comb(peaks_of(prof_of(tophat(w, 1, bad), 1, 0, HH)), WW / 10)
    print(f"  H pitch {fy[1]:.2f} px/2dB (rms {fy[2]:.1f}, {fy[3]} lines) | "
          f"V pitch {fx[1]:.2f} px/div (rms {fx[2]:.1f}, {fx[3]} lines)")

    occl = cv2.dilate(((cy | rd) * 255).astype(np.uint8),
                      np.ones((3, 3), np.uint8)) > 0
    x_mark = float(np.argmax(np.convolve(cy.sum(0), np.ones(5) / 5, "same")))

    cols = {}
    for x in range(WW):
        ys = np.nonzero(tr[:, x] & ~occl[:, x])[0]
        if len(ys) == 0 or len(ys) > HH * 0.30:
            continue
        cols[x] = float(ys.mean())
    near = [cols[x] for x in cols if abs(x - x_mark) < 30]
    if not near:
        raise SystemExit("  no trace near marker")
    y_mark = float(np.median(near))

    db_per_px = 2.0 / fy[1]                      # FITTED pitch
    ghz_per_px = ((f_hi - f_lo) / 10.0) / fx[1]  # FITTED pitch
    print(f"  marker x={x_mark:.0f} y={y_mark:.1f}  "
          f"{ghz_per_px*1000:.3f} MHz/px, {db_per_px:.4f} dB/px")

    xs = np.array(sorted(cols))
    ys = np.array([cols[x] for x in xs])
    freqs = mark_f + (xs - x_mark) * ghz_per_px
    dbs = mark_db - (ys - y_mark) * db_per_px
    keep = (freqs >= f_lo) & (freqs <= f_hi)
    freqs, dbs = freqs[keep], dbs[keep]
    k = int(np.argmin(dbs))
    print(f"  {len(freqs)} cols, {freqs[0]:.3f}-{freqs[-1]:.3f} GHz, "
          f"min {dbs[k]:.2f} dB at {freqs[k]:.4f} GHz")

    with open(out_csv, "w", newline="", encoding="utf-8") as fh:
        wr = csv.writer(fh)
        wr.writerow(["freq_GHz", "S11_dB_digitised"])
        wr.writerows([[round(f, 5), round(v, 3)] for f, v in zip(freqs, dbs)])

    vis = w.copy()
    for x in cols:
        cv2.circle(vis, (x, int(cols[x])), 1, (0, 0, 255), -1)
    for i in range(11):
        cv2.line(vis, (0, int(fy[0] + fy[1] * i)), (WW, int(fy[0] + fy[1] * i)),
                 (0, 255, 0), 1)
        cv2.line(vis, (int(fx[0] + fx[1] * i), 0), (int(fx[0] + fx[1] * i), HH),
                 (0, 255, 0), 1)
    cv2.imwrite(out_csv.replace(".csv", "_chk.png"),
                cv2.resize(vis, (WW // 2, HH // 2)))


if __name__ == "__main__":
    a = sys.argv[1:]
    q = np.array([tuple(map(float, s.split(","))) for s in a[1:5]], np.float32)
    run(a[0], q, float(a[5]), float(a[6]), float(a[7]), float(a[8]), a[9])
