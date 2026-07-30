#!/usr/bin/env python3
"""Score every digitisation of the baseline sweep against real ground truth.

One .set file exists, harish003.set, so one sweep has known exact points and a
digitising method can be graded rather than merely compared with another guess.

WHICH sweep it is, is not fully settled. Scoring all four hand traces against it:
baseline RMS 0.79 dB and skin RMS 0.82 dB both match closely, while stretch
(1.39) and bend (1.84) clearly do not. Baseline and skin are genuinely similar
curves, so RMS cannot separate them. Two other pieces of evidence favour SKIN:
its printed marker is -10.18 against the .set's -10.28 (baseline's is -11.13,
0.85 dB away), and it was photographed at 13:23 against the .set at 13:25.

It was earlier assumed to be the baseline. Treat the grade below as "the hand
method scores ~0.8 dB RMS against a real sweep", which holds either way, rather
than as a validation of one specific condition.

Result (1.9-3.3 GHz):
    hand-traced   mean +0.09 dB   RMS 0.79 dB   worst 1.95 dB
    automatic     mean -2.07 dB   RMS 2.09 dB   worst 2.60 dB

The hand trace is essentially unbiased; the automatic pipeline reads about 2 dB
too deep everywhere. Sweeping a frequency offset over the hand trace only moves
its RMS from 0.84 to 0.81 dB at -16 MHz, so its residual is tracing scatter, not
a mis-set axis -- there is nothing systematic left to correct.

Where the hand trace IS weakest is the sharp dip: it puts the minimum at
2.5893 GHz / -11.10 dB against a true 2.6400 GHz / -10.28 dB. That is the hardest
part of the curve to follow by eye, and it is worth knowing before quoting a
resonance off a hand trace.
"""

from __future__ import annotations

import csv
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "deliverables", "presentation")
TRUTH = "measured_S11.csv"          # extracted from harish003.set
LO, HI = 1.9, 3.3


def load(name):
    with open(os.path.join(D, name), encoding="utf-8") as fh:
        rows = list(csv.reader(fh))[1:]
    a = np.array([[float(x), float(y)] for x, y in rows])
    return a[np.argsort(a[:, 0])]


def main():
    truth = load(TRUTH)
    cands = sys.argv[1:] or ["manual_baseline.csv", "rect_baseline.csv",
                             "digitised_baseline.csv"]
    g = np.linspace(LO, HI, 400)
    t = np.interp(g, truth[:, 0], truth[:, 1])

    m = truth[(truth[:, 0] > 2.3) & (truth[:, 0] < 2.9)]
    k = int(np.argmin(m[:, 1]))
    print(f"ground truth ({TRUTH}): dip {m[k,1]:.2f} dB @ {m[k,0]:.4f} GHz\n")
    print(f"{'method':<26} {'mean':>7} {'RMS':>7} {'worst':>7}   "
          f"{'dip dB':>8} {'dip GHz':>9}")
    print("-" * 72)
    for name in cands:
        if not os.path.exists(os.path.join(D, name)):
            print(f"{name:<26}  (missing)")
            continue
        a = load(name)
        d = np.interp(g, a[:, 0], a[:, 1]) - t
        w = a[(a[:, 0] > 2.3) & (a[:, 0] < 2.9)]
        kk = int(np.argmin(w[:, 1]))
        print(f"{name:<26} {d.mean():+7.2f} {np.sqrt((d**2).mean()):7.2f} "
              f"{np.abs(d).max():7.2f}   {w[kk,1]:8.2f} {w[kk,0]:9.4f}")
    print("\nAll figures in dB over "
          f"{LO}-{HI} GHz, against the .set file's own 201 points.")


if __name__ == "__main__":
    main()
