"""Affine uniaxial strain model of the loop centreline: 0 % vs 20 % strain.

Reproduces exactly the equations in cst/serp-strain.vba, so the path-length
number printed here is the same one the macro deforms the model by.

Supersedes work/plot_deformation.py, which inherited the presentation deck's
`savefig.transparent: True` rcParams. That dropped the background, grid and
axis frame, leaving the ink to blend into the slide -- it read as translucent.
Everything here is drawn at alpha = 1.0 on an opaque canvas.

Emits both themes in one run:
  strain-deformation-dark.png   solid dark canvas, light ink  (slides)
  strain-deformation-light.png  solid white canvas, dark ink  (poster / print)

Geometry is the FLAT design (serp_R 9.05), which is what this figure is for:
it shows the problem the z-wave solves -- an in-plane serpentine gains path
length under stretch. Pass --R to override.
"""
import argparse
import math
import os

# --- flat-design point (docs/DESIGN-EVOLUTION.md) --------------------------
AMP_R, SERP_R, N = 0.2, 0.05, 12
GAP = 1.0

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Deck palette, from scripts/make_presentation_figures.py.
DARK = dict(bg="#16212e", fg="#e8eef5", cold="#4dd0e1", hot="#ff9f43")
LIGHT = dict(bg="#ffffff", fg="#1d2b3a", cold="#1f6f8b", hot="#d4691a")


def outline(strain, R, m=2400):
    """Serpentine centreline under affine uniaxial strain (matches the macro).

    Incompressible (nu ~ 0.5): stretch by 1+e along x, contract by 1/sqrt(1+e)
    along y and z.
    """
    Am, Sk = R * AMP_R, R * SERP_R
    lx = 1.0 + strain
    lt = 1.0 / math.sqrt(1.0 + strain)
    s0 = math.hypot(Am * N, R - 2 * N * Sk)
    dg = min(GAP / max(s0, 1e-6), 0.6)
    tA, tB = dg / 2, 2 * math.pi - dg / 2
    xs, ys = [], []
    for i in range(m + 1):
        t = tA + (tB - tA) * i / m
        uu = R + Am * math.sin(N * t)
        vv = Sk * math.sin(2 * N * t)
        ct, st = math.cos(t), math.sin(t)
        xs.append(lx * (uu * ct + vv * st))
        ys.append(lt * (uu * st - vv * ct))
    return xs, ys


def perim(xs, ys):
    return sum(math.hypot(xs[i + 1] - xs[i], ys[i + 1] - ys[i])
               for i in range(len(xs) - 1))


def draw(pal, R, x0, y0, x2, y2, gain, out, dpi):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    bg, fg, cold, hot = pal["bg"], pal["fg"], pal["cold"], pal["hot"]
    # Every colour is opaque and every facecolor is set, so nothing can fall
    # through to whatever the figure is pasted onto.
    plt.rcParams.update({
        "figure.facecolor": bg, "axes.facecolor": bg, "savefig.facecolor": bg,
        "savefig.transparent": False,
        "text.color": fg, "axes.labelcolor": fg, "axes.edgecolor": fg,
        "xtick.color": fg, "ytick.color": fg,
        "axes.labelsize": 13, "xtick.labelsize": 11, "ytick.labelsize": 11,
        "axes.titlesize": 13, "legend.fontsize": 11,
    })

    fig, ax = plt.subplots(figsize=(7.6, 7.4))
    ax.plot(x0, y0, lw=2.6, color=cold, alpha=1.0, solid_capstyle="round",
            label="0 % strain", zorder=3)
    ax.plot(x2, y2, lw=2.6, color=hot, alpha=1.0, solid_capstyle="round",
            label="20 % strain", zorder=2)

    for sgn in (1, -1):                                   # stretch, along x
        ax.annotate("", xy=(sgn * 15.8, 0), xytext=(sgn * 12.6, 0),
                    arrowprops=dict(arrowstyle="-|>", color=hot, lw=2.4,
                                    alpha=1.0))
    ax.text(0, -16.7, "stretch along x    $\\lambda_x$ = ×1.20", ha="center",
            fontsize=12, color=hot, weight="bold")

    for sgn in (1, -1):                                   # contraction, in y
        ax.annotate("", xy=(0, sgn * 11.0), xytext=(0, sgn * 13.5),
                    arrowprops=dict(arrowstyle="-|>", color=hot, lw=2.0,
                                    alpha=1.0))
    ax.text(0.4, 14.1, "contracts in y (and z)    $\\lambda$ = ×0.913",
            ha="center", fontsize=11, color=hot)

    ax.set_aspect("equal")
    ax.set_xlim(-18, 18)
    ax.set_ylim(-17.6, 17.2)
    ax.grid(True, color=fg, alpha=0.18, lw=0.8)
    ax.set_axisbelow(True)
    ax.set_xlabel("x (mm)")
    ax.set_ylabel("y (mm)")
    ax.set_title("Affine uniaxial strain model — loop centreline\n"
                 f"volume-preserving (ν≈0.5): path length +{gain:.2f} % "
                 "at 20 % strain")
    leg = ax.legend(loc="upper right", framealpha=1.0, facecolor=bg,
                    edgecolor=fg, labelcolor=fg)
    leg.get_frame().set_linewidth(0.8)

    fig.tight_layout()
    fig.savefig(out, dpi=dpi, facecolor=bg, transparent=False)
    plt.close(fig)
    print("wrote", out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--R", type=float, default=9.05,
                    help="loop radius in mm (default 9.05, the flat design)")
    ap.add_argument("--dpi", type=int, default=300)
    ap.add_argument("--out", default=os.path.join(ROOT, "deliverables"))
    args = ap.parse_args()

    R = args.R
    x0, y0 = outline(0.0, R)
    x2, y2 = outline(0.2, R)
    p0, p2 = perim(x0, y0), perim(x2, y2)
    gain = 100 * (p2 - p0) / p0

    print(f"serp_R {R} mm   lambda_x {1.2:.3f}   "
          f"lambda_y = lambda_z {1/math.sqrt(1.2):.4f}")
    print(f"path length  0 %: {p0:8.3f} mm")
    print(f"path length 20 %: {p2:8.3f} mm   -> +{gain:.2f} %")

    os.makedirs(args.out, exist_ok=True)
    for pal, name in ((DARK, "strain-deformation-dark.png"),
                      (LIGHT, "strain-deformation-light.png")):
        draw(pal, R, x0, y0, x2, y2, gain,
             os.path.join(args.out, name), args.dpi)


if __name__ == "__main__":
    main()
