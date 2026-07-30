"""S11 strain family, re-plotted with the UNSTRAINED resonance sitting at 2.44 GHz.

The strain-sweep models (zwstrain85.cst / zwflatB.cst, serp_R 8.5, sub_h 6.508)
resonate at 2.174 GHz (z-wave) and 2.620 GHz (flat), not at 2.44 -- they are the
strain legs, not the tuned-and-fed design point. Plotted raw, the whole family
sits off the BLE band and the reader cannot see how far strain pushes the
antenna out of band.

This rescales the frequency axis by a constant, f -> f * (2.44 / f0_at_0%), i.e.
exactly what re-tuning serp_R would do to first order for a resonant structure.

WHY THAT IS SAFE: the transform is MULTIPLICATIVE, so every fractional drift
df/f is preserved unchanged. The -7.82 % at 20 % strain is the same number
before and after. It moves the family onto the band; it does not flatter it.
Verified at runtime -- drifts are recomputed after rescaling and asserted
against the raw ones.

Reads the CSVs written by scripts/make_presentation_figs.py, so it needs no CST
session. Emits strain-family-tuned-{dark,light}.png into deliverables/.
"""
import argparse
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "deliverables", "presentation", "results")

F_TARGET = 2.44
BLE_LO, BLE_HI = 2.400, 2.4835

# Sequential ramp, fully opaque -- an alpha ramp would read as translucent on a
# dark slide, which is the whole reason these figures were regenerated.
RAMP_DARK = ["#7CFC98", "#C8E86B", "#F5C518", "#FF9F43", "#FF6B6B"]
RAMP_LIGHT = ["#1a8a4a", "#7a9410", "#b8860b", "#d4691a", "#c62828"]

DARK = dict(bg="#16212e", fg="#e8eef5", band="#5DA9E9", ramp=RAMP_DARK)
LIGHT = dict(bg="#ffffff", fg="#1d2b3a", band="#2b6cb0", ramp=RAMP_LIGHT)

SOURCES = {"zwave": ("S11_strain_zwave.csv", "z-wave"),
           "flat": ("S11_strain_flat.csv", "flat control")}

# --- deck style, copied verbatim from scripts/make_presentation_figs.py -----
# 9x5, one hue with an alpha ramp, so the "match" mode is a drop-in for the
# existing F22 slide rather than a differently-styled neighbour.
DECK_FG = "#E8EDF5"
DECK_ZC, DECK_FC = "#2ECC71", "#FF6B6B"
DECK_BAND = "#5DA9E9"


def read_family(path):
    with open(path) as fh:
        head = fh.readline().strip().split(",")
        cols = [[] for _ in head]
        for line in fh:
            for i, v in enumerate(line.strip().split(",")):
                cols[i].append(float(v))
    strains = [int(h.split("_")[-1].replace("pct", "")) for h in head[1:]]
    return cols[0], strains, cols[1:]


def f0_of(freq, s11):
    return freq[min(range(len(s11)), key=lambda i: s11[i])]


def draw_match(which, out, dpi, bg, reverse_ramp=False, size=(9.0, 5.0)):
    """The deck's own F22 style and 9x5 aspect, only the x axis rescaled.

    bg=None reproduces the original transparent background; otherwise the
    canvas is made opaque in that colour.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fname, nice = SOURCES[which]
    freq, strains, curves = read_family(os.path.join(RES, fname))
    f0 = f0_of(freq, curves[0])
    scale = F_TARGET / f0
    fx = [f * scale for f in freq]

    raw = [100 * (f0_of(freq, c) / f0 - 1) for c in curves]
    tuned = [100 * (f0_of(fx, c) / F_TARGET - 1) for c in curves]
    for r, t in zip(raw, tuned):
        assert abs(r - t) < 1e-9, f"rescale changed the drift: {r} vs {t}"

    face = "none" if bg is None else bg
    light_canvas = bg == LIGHT["bg"]
    fg = LIGHT["fg"] if light_canvas else DECK_FG
    plt.rcParams.update({
        "figure.facecolor": face, "axes.facecolor": face,
        "savefig.facecolor": face, "savefig.transparent": bg is None,
        "text.color": fg, "axes.labelcolor": fg,
        "axes.edgecolor": fg, "xtick.color": fg,
        "ytick.color": fg, "grid.color": "#7F8FA6",
        "font.size": 12, "axes.titlesize": 13, "legend.framealpha": 0.0,
    })

    # The deck greens are tuned for a dark canvas; on white they wash out,
    # so the light variant darkens the hue but keeps the same alpha ramp.
    if light_canvas:
        col = "#128f4a" if which == "zwave" else "#c62828"
    else:
        col = DECK_ZC if which == "zwave" else DECK_FC
    fig, ax = plt.subplots(figsize=size)
    ax.axvspan(BLE_LO, BLE_HI, color=DECK_BAND, alpha=0.22, zorder=0)
    # The deck ramps alpha UP with strain. Once the family is anchored to
    # 2.44 GHz the 0 % curve is the reference the reader must find first, and
    # at alpha 0.35 it is the faintest line on the plot -- hence the option to
    # run the ramp the other way.
    n = len(curves) - 1
    for j, (c, s) in enumerate(zip(curves, strains)):
        k = (n - j) if reverse_ramp else j
        ax.plot(fx, c, color=col, lw=2, alpha=0.35 + 0.65 * k / n,
                label=f"{s} % strain")
    ax.set_xlabel("Frequency (GHz)"), ax.set_ylabel(r"$S_{11}$ (dB)")
    ax.set_title(f"{nice}: reflection vs uniaxial strain, tuned to 2.44 GHz  "
                 "(serp_R 8.5, sub_h 6.508)")
    ax.set_xlim(fx[0], fx[-1])
    ax.grid(alpha=0.25)
    # A 5-row legend eats most of the height once the figure is flattened, so
    # it wraps into columns as the aspect gets wider.
    ncol = 1 if size[0] / size[1] < 2.1 else 2
    ax.legend(loc="lower right", fontsize=10, ncol=ncol)
    fig.tight_layout()
    fig.savefig(out, dpi=dpi, facecolor=face, transparent=bg is None)
    plt.close(fig)
    print(f"wrote {out}")
    print(f"   f0(0 %) {f0:.4f} GHz -> x{scale:.4f} -> {F_TARGET:.2f} GHz")
    for s, d in zip(strains, tuned):
        print(f"   {s:3d} %  {d:+6.2f} %")


def draw(pal, which, out, dpi):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fname, nice = SOURCES[which]
    freq, strains, curves = read_family(os.path.join(RES, fname))

    f0 = f0_of(freq, curves[0])
    scale = F_TARGET / f0
    fx = [f * scale for f in freq]

    # drift is invariant under a multiplicative rescale -- prove it, don't assume
    raw = [100 * (f0_of(freq, c) / f0 - 1) for c in curves]
    tuned = [100 * (f0_of(fx, c) / F_TARGET - 1) for c in curves]
    for r, t in zip(raw, tuned):
        assert abs(r - t) < 1e-9, f"rescale changed the drift: {r} vs {t}"

    bg, fg, band = pal["bg"], pal["fg"], pal["band"]
    plt.rcParams.update({
        "figure.facecolor": bg, "axes.facecolor": bg, "savefig.facecolor": bg,
        "savefig.transparent": False,
        "text.color": fg, "axes.labelcolor": fg, "axes.edgecolor": fg,
        "xtick.color": fg, "ytick.color": fg,
        "axes.labelsize": 15, "xtick.labelsize": 13, "ytick.labelsize": 13,
    })

    fig, ax = plt.subplots(figsize=(12.0, 6.6))
    ax.axvspan(BLE_LO, BLE_HI, color=band, alpha=0.28, zorder=0, lw=0)
    ax.text((BLE_LO + BLE_HI) / 2, 1.2, "BLE", color=band, fontsize=13,
            weight="bold", ha="center", va="bottom")

    for c, s, col, d in zip(curves, strains, pal["ramp"], tuned):
        lab = f"{s} % strain" if s == 0 else f"{s} % strain   ({d:+.2f} %)"
        ax.plot(fx, c, color=col, lw=2.8, zorder=3, label=lab)
        fr = f0_of(fx, c)
        ax.plot([fr], [min(c)], "o", color=col, ms=8, zorder=4,
                markeredgecolor=bg, markeredgewidth=1.4)

    # Zoom to the resonances plus the band. The raw sweep runs 1.5-3.5 GHz, but
    # rescaled that is a 2.2 GHz span in which every dip falls inside 0.2 GHz --
    # unreadable at poster distance.
    lo = min(f0_of(fx, c) for c in curves)
    ax.set_xlim(lo - 0.28, BLE_HI + 0.42)
    ax.set_ylim(min(min(c) for c in curves) - 3, 2)
    ax.set_xlabel("Frequency (GHz)")
    ax.set_ylabel(r"$S_{11}$ (dB)")
    ax.set_title(
        f"{nice}: reflection vs uniaxial strain, tuned to band\n"
        "frequency normalised so the unstrained resonance sits at 2.44 GHz  "
        "(serp_R 8.5, sub_h 6.508)",
        fontsize=15.5, linespacing=1.45, pad=14)
    ax.grid(True, color=fg, alpha=0.18, lw=0.8)
    ax.set_axisbelow(True)
    leg = ax.legend(loc="lower right", fontsize=12.5, framealpha=1.0,
                    facecolor=bg, edgecolor=fg, labelcolor=fg)
    leg.get_frame().set_linewidth(0.8)

    ax.text(0.5, -0.185,
            f"raw sweep rescaled ×{scale:.3f}; a multiplicative shift, so every "
            "drift percentage is unchanged",
            transform=ax.transAxes, color=fg, fontsize=11.5, alpha=0.75,
            ha="center", va="top")

    fig.tight_layout()
    fig.savefig(out, dpi=dpi, facecolor=bg, transparent=False)
    plt.close(fig)
    print(f"wrote {out}")
    print(f"   f0(0 %) {f0:.4f} GHz -> ×{scale:.4f} -> {F_TARGET:.2f} GHz")
    for s, d in zip(strains, tuned):
        print(f"   {s:3d} %  {d:+6.2f} %")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--which", choices=tuple(SOURCES), default="zwave")
    ap.add_argument("--style", choices=("match", "poster"), default="match",
                    help="match = the deck's 9x5 F22 style; poster = redrawn")
    ap.add_argument("--transparent", action="store_true",
                    help="match style only: keep the deck's transparent canvas")
    ap.add_argument("--reverse-ramp", action="store_true",
                    help="match style only: make 0 %% the boldest curve")
    ap.add_argument("--size", type=float, nargs=2, metavar=("W", "H"),
                    default=(9.0, 5.0),
                    help="match style only: figure size in inches (deck 9 5)")
    ap.add_argument("--dpi", type=int, default=300)
    ap.add_argument("--out", default=os.path.join(ROOT, "deliverables"))
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    stem = "strain-family-tuned" if args.which == "zwave" \
        else "strain-family-tuned-flat"

    if args.style == "match":
        size = tuple(args.size)
        if args.transparent:
            draw_match(args.which, os.path.join(args.out, f"{stem}.png"),
                       args.dpi, None, args.reverse_ramp, size)
            return
        for bg, suffix in ((DARK["bg"], "dark"), (LIGHT["bg"], "light")):
            draw_match(args.which,
                       os.path.join(args.out, f"{stem}-{suffix}.png"),
                       args.dpi, bg, args.reverse_ramp, size)
        return

    for pal, suffix in ((DARK, "dark"), (LIGHT, "light")):
        draw(pal, args.which, os.path.join(args.out, f"{stem}-{suffix}.png"),
             args.dpi)


if __name__ == "__main__":
    main()
