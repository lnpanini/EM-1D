# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Two things, and it matters which one a question is about:

1. **The active project — a 2.44 GHz BLE antenna on stretchable kinesiology tape** (liquid-metal
   EGaIn in a cast Ecoflex channel), designed and validated in **CST Studio Suite**. This is the
   coursework deliverable and where all current work happens.
2. **The EM-1D web tool** (below) — a browser antenna-synthesis tool that produces CST VBA macros.
   It was the *means*: it generated the first designs. Still tested and working, but no longer the
   focus.

**🔴 ACTIVE WORK (2026-07-26): reviving the out-of-plane z-wave design.** The flat serpentine does
not hold frequency under stretch (−8.8 % at 20 % strain), which is the project's core premise. The
z-wave fixes it analytically (~0.11 % drift). Start at **`docs/ZWAVE-HANDOFF.md`** — it has the
design point, the re-tuning still needed, and a port bug already found and fixed.

**If you are here to understand the antenna, or to build presentation slides, start with:**

- **`docs/DESIGN-EVOLUTION.md`** — the narrative: what we built, what we got wrong, how we found
  out, and the current design. **Its §0 tells you which numbers are safe to present** — several
  earlier results were measured on faulty setups and must not be quoted.
- **`docs/PRESENTATION-GUIDE.md`** — slide-by-slide plan mapped to the grading rubric, which figures
  exist, and an explicit "do not present these" list.
- **`docs/ZWAVE-HANDOFF.md`** — the current engineering task (see above).

Design history and derivations live in `docs/superpowers/specs/` and `docs/superpowers/plans/`.
⚠️ Note `2026-07-22-stretchable-liquid-metal-ble-antenna.md` §5.5 carries a **correction banner** —
its on-body numbers were superseded; heed it rather than quoting the section.

CST tooling: `scripts/cst_bridge.py` (drive CST from Python — build/solve/read S-params, efficiency,
power balance) and `cst/` (companion VBA macros + a headless macro generator).

### The web tool

EM-1D is a browser-based antenna **synthesis** tool: the user enters design requirements
(frequency, substrate, target impedance, …) and it computes the antenna geometry, renders it in a
live Three.js 3D view, and exports a CST Studio Suite VBA macro. It is a zero-dependency static site
(no `node_modules`; Three.js is vendored in `src/vendor/`) deployed to Vercel.

## Commands

See `package.json` scripts for the canonical list (`test`, `dev`, `build`, `preview`). Run a single
test file or test by name with `node --test test/physics.test.mjs` or
`node --test --test-name-pattern "<name>"`.

Non-obvious constraints:

- **`node`/`npm` may not be on PATH.** There is no standalone Node install on every dev machine here;
  if `npm test` reports "command not found", run the suite with another app's bundled Node, e.g.
  `export PATH="$HOME/AppData/Local/ms-playwright-go/<ver>:$PATH" && node --test`.
- `npm run dev`/`preview` require `python3`, and `npm run build` uses Unix `rm`/`cp` — run these
  through the Bash tool (git-bash), not PowerShell.
- There is no bundler, linter, or transpile step; the browser loads the ES modules directly and
  resolves `three` via the importmap in `index.html`.

## Architecture

The codebase is built around a single **geometry intermediate representation (IR)** that decouples the
physics from everything downstream. The synthesis flow is:

```
main.js (UI state) → synthesize(type, design) → { metrics, warnings, geometry[] }
                                                        │
                          geometry[] (the IR) ─────────┼──→ buildVba()  → CST VBA macro text
                                                        └──→ scene.js → viewer.js → Three.js meshes
```

- **`src/physics.js`** — pure, DOM-free engine. Contains the numerical core (Bessel/Neumann series,
  Si/Ci integrals, Simpson integration, bisection/Newton root-finders), the 7 per-type synthesis
  functions, the `synthesize()` dispatcher, and `buildVba()`. Lengths are **mm**, frequency **GHz**,
  angles **rad**. Each synthesis function returns `{ inputs, metrics, warnings, geometry }`.
- **`src/scene.js`** — pure IR → mesh-spec mapping (`geometryToMeshSpecs`, `sceneBounds`,
  Sutherland–Hodgman polygon clipping for truncated/segment patches). No THREE/DOM imports, so it is
  unit-tested in Node.
- **`src/viewer.js`** — the only file that imports THREE; turns mesh-specs into actual meshes and runs
  the OrbitControls render loop. Loaded lazily from `main.js` and fails gracefully if WebGL is absent.
- **`src/main.js`** — UI wiring: field descriptors, per-type display config, state, render loop,
  pin/compare, copy/download. Re-runs `synthesize()` + `buildVba()` on every input change.

### The geometry IR

`geometry` is an array of plain descriptors. The shape vocabulary is the contract shared by `scene.js`
and `buildVba()` — both switch on `shape`/`kind`:

- `box`, `cylinder` (axis-aware `'x'|'y'|'z'`), `ring` (rOuter/rInner), `segment` (disk with
  `cuts[]` truncation chords and optional `slot`), and `feed` (a discrete port line `p1`→`p2`).
- `material` is `'pec'` | `'substrate'` | `'feed'`. In VBA, `'pec'` maps to CST's case-sensitive
  built-in `PEC`; `scene.js` maps materials to Design-System token colors.

### CST export rules

Non-negotiable constraints the exported macro must satisfy — all three have bitten us:

1. **Everything goes through `AddToHistory`.** In CST the history list *is* the model; a bare
   `Brick.Create` leaves an orphan solid that no parametric rebuild can touch. Use the `hist()`
   helper, never `body.push(vbaXxx(...))` directly.
2. **Never mix the legacy and modern `DiscretePort` point APIs.** `SetP1`/`SetP2` only — adding
   `UsePickedPoints` or `Point1`/`Point2` raises `(&H8000ffff)` and *aborts the macro mid-run*,
   which looks like a half-imported model rather than an error.
3. **Mind the VBA line-continuation limit** (24 per statement). `hist()` switches to the
   `h = h & ...` accumulator form past `HIST_INLINE_MAX` lines; callers must emit `Dim h As String`.

A result may set `template` to select a **parametric** exporter instead of the generic literal one:

- `'concentric-ring'` → `buildVbaConcentricRing()` — named parameters plus expression-string
  geometry (`.Xrange "-sub_x", "sub_x"`). Only works when the shape is expressible as CST expressions.
- `'serpentine'` → `buildVbaSerpentine()` — the trace is a ~1440-point offset ribbon, so the curve
  *evaluator itself* is emitted as the body of a history block: it calls `RestoreDoubleParameter` and
  regenerates the polygon on every rebuild. That is what makes `serp_R`/`amp_ratio`/`serp_n` real
  sweep variables. `test/physics.test.mjs` asserts the VBA math reproduces the JS IR outline, so any
  change to `serpPoint()`/the offset loop must be mirrored in `serpTraceBlock()`.

### Feed topology follows the ground plane

The serpentine's `groundPlane` toggle selects two *physically different antennas*, and each needs its
own excitation — `metrics.feedType` records which:

- **`None` → `'delta-gap'`.** A free-standing 1λ loop. The conductor is broken by `feedGapMm` and a
  balanced discrete source bridges the gap, both terminals in the conductor plane. Open ribbon, so
  the trace is one simple polygon.
- **`Full` → `'microstrip-edge'`.** Over a ground plane this is a microstrip resonator, and **the
  ground is the return conductor** — a port floating in the trace plane has no return path and
  excites the structure unphysically. So the loop closes galvanically (trace becomes an annulus:
  `outline` + `inner`), a 50 Ω line from `microstripWidth()` runs to the board edge, and the port is
  vertical at that edge from the top conductor down to the ground plane.

The feed line starts at `x = serp_R` because `serpPoint(0) === (R, 0)` exactly — the one point
guaranteed to lie on the centerline for any `n`/`A`/`S`, so the stub always bonds to the conductor.

Watch the pitch conflict: a 50 Ω line on thick or low-εr substrate can be **wider than one undulation
pitch** (`2πR/n`), shorting across the meander. `serpentineLoop()` warns; do not silence it.

Parametrisation in CST needs **both** halves: named entries via `StoreDoubleParameter`/`StoreParameter`
*and* history entries that reference those names as quoted expression strings. A literal number in a
history entry is inert no matter how many parameters are defined alongside it.

A shape has **three** consumers. Adding one means extending all of them:

1. `geometryToMeshSpecs` **and** `sceneBounds` in `scene.js` (→ the 3D viewer, via `viewer.js`)
2. the shape switch in `buildVba()` in `physics.js` (→ the CST macro)
3. `topViewSVG` **and** `sectionViewSVG` in `drawings.js` (→ the static drawings)

Missing #3 is the nastiest: `main.js:render()` calls the drawings *before* `viewer.update()`, so an
unhandled shape throws mid-render and the metrics panel updates while the 3D model silently keeps the
previous geometry — it looks like the viewer is broken, not the drawings. `test/scene.test.mjs`
asserts every synthesized shape survives both drawing functions; keep that list current.

Path-based shapes (`trace`, `tube`) have no `center`/`size`, so any code that assumes those fields
must special-case them before the generic branches.

### Adding a new antenna type

A type touches several coordinated tables — keep keys consistent across all of them:

1. `physics.js`: write the synthesis function, add it to `TYPES`, the `synthesize()` switch, and
   `SUBSTRATE_TYPES` if it has a dielectric substrate (gates the εr/height validation).
2. `main.js`: add the input list to `TYPE_FIELDS` (drawing from the shared `FIELDS` descriptors), a
   `VIEW` entry (`readout`/`kpis`/`results`), and a `GLYPH` icon class.
3. Add reference-value tests in `test/physics.test.mjs`.

## Testing conventions

Physics tests assert closed-form results against published reference values (Balanis / Garg /
Abramowitz–Stegun) with explicit tolerances via the `close(a, b, tol)` helper — when changing a
formula, update the expected value only if you can justify it against the reference, not to make a
test pass. `test/smoke.test.mjs` imports `main.js` under a hand-rolled DOM stub to guard the UI wiring
path without a browser; the 3D viewer itself is verified manually in a real browser.

## Design docs

`docs/superpowers/specs/` and `docs/superpowers/plans/` hold the physics derivations and phased design
specs (rectangular/wire engine, circular family, 3D viewer). Consult them for the provenance of a
formula before altering the physics.
