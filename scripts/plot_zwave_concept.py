"""Conceptual side profile of the z-wave channel: the length-conservation idea.

A schematic companion to F20 (scripts/make_presentation_figures.py). F20 plots
the macro's real curve under the real 20 % strain and carries the measured
numbers; this one carries NO numbers and exaggerates the strain, because its
only job is to make the mechanism legible at poster distance.

The construction: BOTH waves are drawn with the SAME ARC LENGTH -- the same
piece of wire, twice. Stretching flattens the wave (z contracts as
1/sqrt(1+e)) and lengthens its period, so that identical wire now reaches
further along the substrate. That extra reach IS the strain, absorbed. The
conductor never had to get longer, so the resonant length never changed.

Idealised sinusoid at the design ratio z_amp / lambda_z = 0.211, not the real
serpentine curve, so the period is uniform across the frame. Deliberately
schematic -- quote F20 for anything numeric.

IMPORTANT for captioning: this shows the mechanism in its IDEAL form. In
full-wave the cancellation is only partial (~60-70 % of out-of-plane length is
electrically realised), which is why the antenna is strain-TOLERANT, not
strain-invariant. See docs/ZWAVE-STRAIN-FINDINGS.md section 8.

Emits strain-mechanism-{dark,light}.png into deliverables/.
"""
import argparse
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CYCLES = 2.0          # periods of wire, measured in the relaxed state

# The design ratio z_amp/lambda_z = 0.211 is the value that conserves arc
# length at the REAL 20 % strain. Exaggerating the strain for legibility
# without also deepening the wave would break the very cancellation the figure
# claims -- at 55 % strain a 0.211 wave absorbs only ~22 % of the stretch, and
# the picture would contradict its own caption. So the ratio is solved for
# whatever visual strain is drawn (solve_ratio below), keeping the schematic
# internally exact. solve_ratio(0.20) returns ~0.211, which is the check that
# this reproduces the real design point.
RATIO = 0.2107

DARK = dict(bg="#16212e", fg="#e8eef5", relax="#f5c518", stretch="#ff8a65",
            accent="#7CFC98")
LIGHT = dict(bg="#ffffff", fg="#1d2b3a", relax="#b8860b", stretch="#d4551a",
             accent="#1f7a4d")


def wave(gx, gz, ratio, arc_budget=None, m=4000, reach=6.0):
    """Unrolled z profile, truncated at a fixed ARC LENGTH.

    gx scales the in-plane period, gz scales the out-of-plane amplitude.
    Returns (xs, zs, lam, amp, arc_used).
    """
    lam, amp = gx, ratio * gz

    xs, zs, arc = [], [], 0.0
    px = pz = None
    for i in range(m + 1):
        x = reach * i / m
        z = amp * math.cos(2 * math.pi * x / lam)
        if px is not None:
            arc += math.hypot(x - px, z - pz)
            if arc_budget is not None and arc > arc_budget:
                break
        xs.append(x)
        zs.append(z)
        px, pz = x, z
    return xs, zs, lam, amp, arc


def reach_gain(ratio, gx, gz):
    """Extra in-plane span the same arc of wire covers once flattened."""
    _, _, _, _, budget = wave(1.0, 1.0, ratio, reach=CYCLES)
    a, _, _, _, _ = wave(1.0, 1.0, ratio, budget)
    b, _, _, _, _ = wave(gx, gz, ratio, budget)
    return b[-1] / a[-1]


def solve_ratio(gx, gz, lo=0.02, hi=1.60, iters=60):
    """Wave depth a/lambda that makes the wire absorb the stretch exactly.

    Monotone in ratio: a flat wave absorbs nothing (gain -> 1), a deep one
    releases more length than the stretch demands. Bisect on the crossing.
    """
    for _ in range(iters):
        mid = (lo + hi) / 2
        if reach_gain(mid, gx, gz) < gx:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def draw_overlay(ax, pal, x0, z0, amp0, x1, z1, amp1, end0, end1):
    """Both waves on one baseline, as in the original F20 side profile.

    Because the arc length is identical and the cancellation is exact, both
    curves show the SAME number of cycles -- the stretched one is simply
    flatter and wider, and so runs off further to the right.
    """
    fg, relax = pal["fg"], pal["relax"]
    stretch, accent = pal["stretch"], pal["accent"]

    lead = -0.42                       # run-in, leaving room for the gauge
    ax.plot([lead, end1], [0, 0], color=fg, lw=1.0, ls=":", alpha=0.35,
            zorder=1)
    for amp, c, xe in ((amp0, relax, end0), (amp1, stretch, end1)):
        for sgn in (1, -1):
            ax.plot([lead, xe], [sgn * amp] * 2, color=c, lw=1.3,
                    ls=(0, (5, 4)), alpha=0.55, zorder=1)

    ax.plot(x1, z1, color=stretch, lw=4.6, zorder=2, solid_capstyle="round",
            label="stretched")
    ax.plot(x0, z0, color=relax, lw=4.6, zorder=3, solid_capstyle="round",
            label="relaxed")

    # (1) FLATTENS -- gauge across the gap between the two upper envelopes
    xg = lead + 0.17
    ax.annotate("", xy=(xg, amp0), xytext=(xg, amp1),
                arrowprops=dict(arrowstyle="<->", color=accent, lw=2.6,
                                shrinkA=0, shrinkB=0), zorder=5)
    ax.text(xg, amp0 + 0.07, "FLATTENS", color=accent, fontsize=15,
            weight="bold", ha="center", va="bottom")

    # (2) SPREADS -- the same wire simply runs out further along
    y_arrow = -amp0 - 0.22
    ax.annotate("", xy=(end1, y_arrow), xytext=(end0, y_arrow),
                arrowprops=dict(arrowstyle="-|>", color=accent, lw=3.2,
                                shrinkA=0, shrinkB=0), zorder=5)
    for xe, c, top in ((end0, relax, amp0), (end1, stretch, amp1)):
        ax.plot([xe, xe], [y_arrow, top], color=c, lw=1.6, ls=(0, (4, 4)),
                alpha=0.8, zorder=2)
        ax.plot([xe, xe], [y_arrow - 0.05, y_arrow + 0.05], color=c, lw=2.6,
                zorder=5)
    ax.text((end0 + end1) / 2, y_arrow - 0.09,
            "…and SPREADS — the same wire simply reaches further.\n"
            "That extra reach IS the stretch, absorbed.",
            color=accent, fontsize=15, weight="bold", ha="center", va="top",
            linespacing=1.4)

    ax.set_xlim(lead - 0.08, end1 + 0.10)
    ax.set_ylim(y_arrow - 0.34, amp0 + 0.34)
    # relaxed reads first, though it is drawn second to sit on top
    h, l = ax.get_legend_handles_labels()
    leg = ax.legend(h[::-1], l[::-1], loc="upper right", fontsize=14,
                    framealpha=1.0, facecolor=pal["bg"], edgecolor=fg,
                    labelcolor=fg, ncol=2)
    leg.get_frame().set_linewidth(0.8)


def draw(pal, strain, ratio, out, dpi, layout="overlay"):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    bg, fg = pal["bg"], pal["fg"]
    relax, stretch, accent = pal["relax"], pal["stretch"], pal["accent"]
    plt.rcParams.update({
        "figure.facecolor": bg, "axes.facecolor": bg, "savefig.facecolor": bg,
        "savefig.transparent": False,
        "text.color": fg, "axes.labelcolor": fg, "axes.edgecolor": fg,
    })

    # One wire's worth of arc, then the same arc spent on the flattened wave.
    gx, gz = 1.0 + strain, 1.0 / math.sqrt(1.0 + strain)
    _, _, _, _, budget = wave(1.0, 1.0, ratio, reach=CYCLES)
    x0, z0, lam0, amp0, _ = wave(1.0, 1.0, ratio, budget)
    x1, z1, lam1, amp1, _ = wave(gx, gz, ratio, budget)
    end0, end1 = x0[-1], x1[-1]

    fig, ax = plt.subplots(figsize=(13.6, 6.8) if layout == "overlay"
                           else (13.6, 7.4))
    if layout == "overlay":
        draw_overlay(ax, pal, x0, z0, amp0, x1, z1, amp1, end0, end1)
        ax.set_xticks([])
        ax.set_yticks([])
        ax.set_xlabel("position along the substrate      "
                      "(stretch direction →)", fontsize=15, labelpad=12)
        ax.set_title("How the out-of-plane wave absorbs stretch\n"
                     "channel side profile, unrolled — same length of wire, "
                     "drawn twice  (strain exaggerated)",
                     fontsize=17.5, linespacing=1.4, pad=16)
        for sp in ax.spines.values():
            sp.set_visible(False)
        fig.tight_layout()
        fig.savefig(out, dpi=dpi, facecolor=bg, transparent=False)
        plt.close(fig)
        print(f"wrote {out}   (reach {end0:.3f} -> {end1:.3f}, "
              f"+{100*(end1/end0-1):.0f} % on the same arc)")
        return

    # --- stacked lanes, separated by the RELAXED wave height ---------------
    half = amp0 * 1.55 + 0.06
    cy0, cy1 = half, -half

    for xs, zs, cy, amp, c, lab in (
            (x0, z0, cy0, amp0, relax, "RELAXED"),
            (x1, z1, cy1, amp1, stretch, "STRETCHED")):
        ax.plot([0, xs[-1]], [cy, cy], color=fg, lw=1.0, ls=":", alpha=0.28,
                zorder=1)
        # envelopes stop where THIS wire stops -- running them the full width
        # reads as if the wave carried on past the end of the conductor
        for sgn in (1, -1):
            ax.plot([0, xs[-1]], [cy + sgn * amp] * 2, color=c, lw=1.2,
                    ls=(0, (5, 4)), alpha=0.5, zorder=1)
        ax.plot(xs, [cy + z for z in zs], color=c, lw=4.6, zorder=3,
                solid_capstyle="round")
        ax.text(-0.30, cy, lab, color=c, fontsize=16, weight="bold",
                ha="center", va="center", rotation=90)
        # wave-height gauge, same x in both lanes so the drop is directly read
        ax.annotate("", xy=(-0.11, cy + amp), xytext=(-0.11, cy - amp),
                    arrowprops=dict(arrowstyle="<->", color=c, lw=2.4,
                                    shrinkA=0, shrinkB=0), zorder=5,
                    annotation_clip=False)

    ax.text(-0.11, cy1 - amp1 - 0.05, "flatter", color=accent, fontsize=14.5,
            weight="bold", ha="center", va="top")

    # the payoff: same wire, more reach
    y_arrow = cy1 - amp0 - 0.24
    ax.annotate("", xy=(end1, y_arrow), xytext=(end0, y_arrow),
                arrowprops=dict(arrowstyle="-|>", color=accent, lw=3.2,
                                shrinkA=0, shrinkB=0), zorder=5)
    for xe, c, top in ((end0, relax, cy0 + amp0), (end1, stretch, cy1 + amp1)):
        ax.plot([xe, xe], [y_arrow, top], color=c, lw=1.6, ls=(0, (4, 4)),
                alpha=0.75, zorder=2)
        ax.plot([xe, xe], [y_arrow - 0.05, y_arrow + 0.05], color=c, lw=2.6,
                zorder=5)
    ax.text((end0 + end1) / 2, y_arrow - 0.085,
            "extra reach — this is the stretch, absorbed", color=accent,
            fontsize=15, weight="bold", ha="center", va="top")

    ax.text(end1 * 1.015, 0.0,
            "the conductor\nnever gets longer\n— so the antenna\nstays in tune",
            color=accent, fontsize=15.5, weight="bold", ha="left", va="center",
            linespacing=1.45)

    ax.set_xlim(-0.42, end1 * 1.40)
    ax.set_ylim(y_arrow - 0.30, cy0 + amp0 + 0.08)
    ax.set_xlabel("flattening the wave lets the SAME LENGTH OF WIRE span a "
                  "longer stretch of substrate", fontsize=16, labelpad=14)
    ax.set_xticks([])                # schematic: no scale, no measurements
    ax.set_yticks([])
    ax.set_title("How the out-of-plane wave absorbs stretch\n"
                 "channel side profile, unrolled — same wire drawn twice  "
                 "(strain exaggerated)",
                 fontsize=17.5, linespacing=1.4, pad=16)
    for sp in ax.spines.values():
        sp.set_visible(False)

    fig.tight_layout()
    fig.savefig(out, dpi=dpi, facecolor=bg, transparent=False)
    plt.close(fig)
    print(f"wrote {out}   (reach {end0:.3f} -> {end1:.3f}, "
          f"+{100*(end1/end0-1):.0f} % on the same arc)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strain", type=float, default=0.55,
                    help="VISUAL strain for the schematic (not the real 0.20)")
    ap.add_argument("--layout", choices=("overlay", "stacked"),
                    default="overlay",
                    help="overlay = both waves on one baseline, as in F20")
    ap.add_argument("--dpi", type=int, default=300)
    ap.add_argument("--out", default=os.path.join(ROOT, "deliverables"))
    args = ap.parse_args()

    # Self-check against the real design. At 20 % uniaxial strain the LOOP's
    # in-plane perimeter grows only +6.02 % (scripts/plot_deformation.py) --
    # not +20 %, because most of the loop does not run along the stretch axis.
    # Feeding that true growth in must recover the documented 0.211.
    check = solve_ratio(1.0602, 1.0 / math.sqrt(1.20))
    print(f"self-check vs real design: {check:.4f}  "
          f"(documented z_amp/lambda_z {RATIO:.4f})")

    # The schematic is the pure 1-D case -- a wire running ALONG the stretch,
    # so its substrate really does grow by (1+e). That needs a deeper wave than
    # the real loop, which is fine for a figure carrying no numbers.
    gx, gz = 1.0 + args.strain, 1.0 / math.sqrt(1.0 + args.strain)
    ratio = solve_ratio(gx, gz)
    print(f"drawing at visual strain {args.strain:.2f}, wave depth "
          f"a/lambda = {ratio:.4f}")

    os.makedirs(args.out, exist_ok=True)
    for pal, name in ((DARK, "strain-mechanism-dark.png"),
                      (LIGHT, "strain-mechanism-light.png")):
        draw(pal, args.strain, ratio, os.path.join(args.out, name), args.dpi,
             args.layout)


if __name__ == "__main__":
    main()
