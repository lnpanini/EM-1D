# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

EM-1D is a browser-based antenna **synthesis** tool: the user enters design requirements
(frequency, substrate, target impedance, …) and it computes the antenna geometry, renders it in a
live Three.js 3D view, and exports a CST Studio Suite VBA macro. It is a zero-dependency static site
(no `node_modules`; Three.js is vendored in `src/vendor/`) deployed to Vercel.

## Commands

```bash
npm test            # node --test — runs everything in test/*.test.mjs (physics, scene, smoke)
npm run dev         # python3 -m http.server 5173  → open http://localhost:5173
npm run build       # produces static dist/ (copies index.html + src/)
npm run preview     # serve the built dist/ on :4173
```

Run a single test file or test by name:

```bash
node --test test/physics.test.mjs
node --test --test-name-pattern "rect patch FR4" 
```

Note: `npm run dev`/`preview` require `python3`, and `npm run build` uses Unix `rm`/`cp` — run these
through the Bash tool (git-bash), not PowerShell. There is no bundler, linter, or transpile step; the
browser loads the ES modules directly and resolves `three` via the importmap in `index.html`.

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

If you add a new shape, you must extend **both** `geometryToMeshSpecs`/`sceneBounds` in `scene.js`
**and** the shape switch in `buildVba()` in `physics.js`, or it will render but not export (or vice
versa).

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
