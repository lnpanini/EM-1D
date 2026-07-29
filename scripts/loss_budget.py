#!/usr/bin/env python3
"""Where does the power actually go? -- the loss budget at 2.44 GHz.

Answers "radiation efficiency is only 5.2 %, so what eats the other 95 %?" with
measured numbers rather than a guess. CST stores per-material loss under
1D Results\\Power, and unlike the farfield it IS reachable from the Python API.

Everything is normalised to POWER ACCEPTED (what actually enters the antenna
after mismatch), because that is the split the efficiency figure refers to.

Usage:  loss_budget.py [project.cst] [run_id]
"""

from __future__ import annotations

import os
import sys

sys.path.append(r"C:\Program Files (x86)\CST Studio Suite 2024\AMD64\python_cst_libraries")
import cst.results as cr  # noqa: E402

ROOT = r"C:\Users\Bryan\Documents\GitHub\EM-1D"
PROJ = sys.argv[1] if len(sys.argv) > 1 else "zwfinal-fab.cst"
RID = int(sys.argv[2]) if len(sys.argv) > 2 else 0
F0 = 2.44
EXC = "1D Results\\Power\\Excitation [1]\\"

ITEMS = [
    ("Power Stimulated", "stimulated (source)"),
    ("Power Accepted", "accepted (after mismatch)"),
    ("Power Radiated", "RADIATED"),
    ("Loss in Dielectrics", "loss in dielectrics (total)"),
    ("Loss in Metals", "loss in metals (total)"),
    ("Loss per Material\\Metal loss in EGaIn", "  EGaIn conductor"),
    ("Loss per Material\\Volume loss in Substrate Material", "  Ecoflex substrate"),
    ("Loss per Material\\Volume loss in Skin", "  tissue: skin"),
    ("Loss per Material\\Volume loss in Fat", "  tissue: fat"),
    ("Loss per Material\\Volume loss in Muscle", "  tissue: muscle"),
]

mod = cr.ProjectFile(os.path.join(ROOT, "work", PROJ),
                     allow_interactive=True).get_3d()


def at_f0(path):
    try:
        it = mod.get_result_item(EXC + path, RID)
        xs = [float(x) for x in it.get_xdata()]
        ys = [abs(complex(y)) for y in it.get_ydata()]
        if not xs:
            return None
        k = min(range(len(xs)), key=lambda i: abs(xs[i] - F0))
        return ys[k]
    except Exception:
        return None


vals = {label: at_f0(p) for p, label in ITEMS}
acc = vals.get("accepted (after mismatch)")

print(f"{PROJ}  run {RID}   @ {F0} GHz")
print("=" * 66)
print(f"{'quantity':<34} {'watts':>10} {'% accepted':>12}")
print("-" * 66)
for _, label in ITEMS:
    v = vals[label]
    if v is None:
        print(f"{label:<34} {'--':>10} {'--':>12}")
        continue
    pct = f"{100*v/acc:10.2f} %" if acc else "         --"
    print(f"{label:<34} {v:10.5f} {pct:>12}")

tissue = sum(v for k, v in vals.items()
             if k.startswith("  tissue") and v is not None)
egain = vals.get("  EGaIn conductor") or 0.0
subs = vals.get("  Ecoflex substrate") or 0.0
if acc:
    print("-" * 66)
    print(f"{'TISSUE ABSORPTION (skin+fat+muscle)':<34} {tissue:10.5f} "
          f"{100*tissue/acc:10.2f} %")
    print()
    print("Of the non-radiated power, the split between the two loss mechanisms")
    print("the deck asks about:")
    tot2 = egain + subs
    if tot2:
        print(f"  EGaIn conductor loss   {egain:9.5f} W  "
              f"({100*egain/tot2:5.1f} % of the two)")
        print(f"  Ecoflex dielectric     {subs:9.5f} W  "
              f"({100*subs/tot2:5.1f} % of the two)")
        print(f"  -> {'EGaIn conductivity' if egain > subs else 'Ecoflex tan d'} "
              f"dominates, by {max(egain, subs)/max(min(egain, subs), 1e-12):.1f}x")
    print()
    print(f"But BOTH are dwarfed by tissue: {100*tissue/acc:.1f} % of accepted power")
    print(f"is absorbed by the body, vs {100*(egain+subs)/acc:.1f} % lost in the")
    print("antenna's own materials.")
