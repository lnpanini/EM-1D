#!/usr/bin/env python3
"""Extract the S11 trace from a Rohde & Schwarz ZVH .set file.

The .set is an undocumented tagged binary ("Orion" header). It carries a 640x480
PNG of the instrument screen plus the numeric trace. Both are recovered here.

HOW THE TRACE WAS LOCATED, so this is checkable rather than magic: the screen
gives 201 points, centre 2.4 GHz, span 4.7998 GHz, and a marker reading
-10.27 dB at 2.63999 GHz. Scanning the binary for runs of float32 in a plausible
dB range and testing each 201-long window against that marker value picks out
exactly one candidate, at byte 34172, which reproduces the marker to 0.01 dB.

Usage:  parse_zvh_set.py <file.set> [out_prefix]
"""

from __future__ import annotations

import csv
import os
import struct
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else \
    r"C:\Users\Bryan\Downloads\Telegram Desktop\harish003.set"
OUTP = sys.argv[2] if len(sys.argv) > 2 else \
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 "deliverables", "presentation", "measured_S11")

N_POINTS = 201
F_LO, F_HI = 0.0001, 4.7999          # centre 2.4, span 4.7998, in GHz
TRACE_OFFSET = 34172
MARK_F, MARK_DB = 2.63999, -10.27

raw = open(SRC, "rb").read()

# --- screenshot ---
sig = b"\x89PNG\r\n\x1a\n"
i = raw.find(sig)
if i != -1:
    j = raw.find(b"IEND", i)
    png = raw[i:j + 8]
    p = OUTP + "_screen.png"
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "wb").write(png)
    print(f"screenshot -> {p}  ({len(png)} bytes)")

# --- trace ---
vals = [struct.unpack_from("<f", raw, TRACE_OFFSET + 4 * k)[0]
        for k in range(N_POINTS)]
step = (F_HI - F_LO) / (N_POINTS - 1)
freqs = [F_LO + k * step for k in range(N_POINTS)]

kmark = round((MARK_F - F_LO) / step)
delta = abs(vals[kmark] - MARK_DB)
print(f"marker check: file {vals[kmark]:.2f} dB vs screen {MARK_DB} dB "
      f"(delta {delta:.2f} dB)  {'OK' if delta < 0.5 else 'MISMATCH'}")
if delta >= 0.5:
    raise SystemExit("marker fingerprint failed -- offset is wrong, do not trust")

# index 0 sits at ~0 Hz where a VNA reading is meaningless; drop it
body = [(f, v) for f, v in zip(freqs, vals) if f > 0.05]
kmin = min(range(len(body)), key=lambda k: body[k][1])
print(f"\n{len(body)} usable points, {body[0][0]:.4f}–{body[-1][0]:.4f} GHz")
print(f"minimum: {body[kmin][1]:.2f} dB at {body[kmin][0]:.4f} GHz")
below = [f for f, v in body if v <= -10.0]
if below:
    print(f"at or below -10 dB: {min(below):.4f}–{max(below):.4f} GHz "
          f"({1000*(max(below)-min(below)):.0f} MHz)")
else:
    print("never reaches -10 dB")
for t in (2.400, 2.440, 2.450, 2.4835):
    k = min(range(len(body)), key=lambda i: abs(body[i][0] - t))
    print(f"  {t:.4f} GHz -> {body[k][1]:6.2f} dB  (nearest {body[k][0]:.4f})")

p = OUTP + ".csv"
with open(p, "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh)
    w.writerow(["freq_GHz", "S11_dB_measured_singleended"])
    w.writerows([[f, v] for f, v in body])
print(f"\ntrace -> {p}")
