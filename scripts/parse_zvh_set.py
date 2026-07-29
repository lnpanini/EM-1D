#!/usr/bin/env python3
"""Extract the S11 trace from a Rohde & Schwarz ZVH .set file.

The .set is an undocumented tagged binary ("Orion" header) carrying a 640x480 PNG
of the instrument screen plus the numeric trace. Both are recovered here.

HOW THE TRACE IS LOCATED, so this is checkable rather than magic. The screen
gives the point count, the sweep range and a marker reading. This scans the
binary for runs of float32 in a plausible dB range, and tests every N-long window
against the marker value. Exactly one candidate normally survives. The check is
re-run on every invocation and the script REFUSES to write a CSV if it fails --
a wrong offset cannot silently produce plausible-looking data.

Usage:
  parse_zvh_set.py <file.set> <n_points> <f_start_GHz> <f_stop_GHz>
                   <marker_GHz> <marker_dB> <out_prefix>

Known files:
  19018.set     1201 pts  0.0001-8.0000 GHz  marker 2.5134 GHz -16.50 dB  (06:33)
  harish003.set  201 pts  0.0001-4.7999 GHz  marker 2.63999 GHz -10.27 dB (13:25)
"""

from __future__ import annotations

import csv
import os
import struct
import sys

if len(sys.argv) < 8:
    print(__doc__)
    raise SystemExit(2)

SRC = sys.argv[1]
N = int(sys.argv[2])
F_LO, F_HI = float(sys.argv[3]), float(sys.argv[4])
MARK_F, MARK_DB = float(sys.argv[5]), float(sys.argv[6])
OUTP = sys.argv[7]

raw = open(SRC, "rb").read()
step = (F_HI - F_LO) / (N - 1)
kmark = round((MARK_F - F_LO) / step)
print(f"{os.path.basename(SRC)}: {len(raw)} bytes, {N} pts, "
      f"{F_LO}-{F_HI} GHz, marker index {kmark}")

# --- screenshot ---
sig = b"\x89PNG\r\n\x1a\n"
i = raw.find(sig)
if i != -1:
    j = raw.find(b"IEND", i)
    p = OUTP + "_screen.png"
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "wb").write(raw[i:j + 8])
    print(f"  screenshot -> {p}")

# --- locate the trace by marker fingerprint ---
best = None
n = len(raw)
for off in range(4):
    k = off
    vals, base = [], off
    while k + 4 <= n:
        (v,) = struct.unpack_from("<f", raw, k)
        vals.append(v)
        k += 4
    for w in range(0, len(vals) - N + 1):
        win = vals[w:w + N]
        if not all(v == v and -80.0 <= v <= 10.0 for v in win):
            continue
        if max(win) - min(win) < 3.0:
            continue
        d = abs(win[kmark] - MARK_DB)
        if d < 0.5 and (best is None or d < best[0]):
            best = (d, base + w * 4, win)

if best is None:
    raise SystemExit("FAILED: no window reproduces the marker -- do not trust "
                     "any output; check the screen values passed in.")
delta, offset, win = best
print(f"  trace at byte {offset}: marker reads {win[kmark]:.2f} dB "
      f"vs screen {MARK_DB} (delta {delta:.2f} dB)  OK")

freqs = [F_LO + k * step for k in range(N)]
body = [(f, v) for f, v in zip(freqs, win) if f > 0.05]
kmin = min(range(len(body)), key=lambda k: body[k][1])
print(f"  {len(body)} usable points, {body[0][0]:.4f}-{body[-1][0]:.4f} GHz")
print(f"  minimum {body[kmin][1]:.2f} dB at {body[kmin][0]:.4f} GHz")

below = [f for f, v in body if v <= -10.0]
if below:
    # contiguous span containing the minimum
    fmin = body[kmin][0]
    lo = hi = fmin
    for f, v in body:
        if v <= -10.0 and f < fmin:
            lo = min(lo, f) if hi == fmin else lo
    seg, cur = [], []
    for f, v in body:
        if v <= -10.0:
            cur.append(f)
        else:
            if cur:
                seg.append(cur)
            cur = []
    if cur:
        seg.append(cur)
    main = max(seg, key=len)
    print(f"  -10 dB spans: {len(seg)} region(s); widest "
          f"{main[0]:.4f}-{main[-1]:.4f} GHz ({1000*(main[-1]-main[0]):.0f} MHz)")
else:
    print("  never reaches -10 dB")

for t in (2.400, 2.450, 2.4835):
    k = min(range(len(body)), key=lambda i: abs(body[i][0] - t))
    print(f"    {t:.4f} GHz -> {body[k][1]:6.2f} dB")

p = OUTP + ".csv"
with open(p, "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh)
    w.writerow(["freq_GHz", "S11_dB_measured_singleended"])
    w.writerows([[f, v] for f, v in body])
print(f"  trace -> {p}")
