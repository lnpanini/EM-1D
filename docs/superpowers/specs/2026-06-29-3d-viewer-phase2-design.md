# EM-1D 3D Parametric Viewer — Phase 2 Design Spec

**Date:** 2026-06-29
**Status:** Approved (design)
**Depends on:** Phase 1 geometry IR (`{shape, material, ...}` primitives from each model)

## Goal
A live, rotatable 3D view of the synthesized antenna that rebuilds on every parameter change,
in a **hero-panel** layout (viewer large beside the controls; metrics + CST VBA below).

## Decisions (approved)
- **Renderer:** Three.js, **vendored** in `src/vendor/` (offline, static-deployable). Pinned version.
- **Controls:** OrbitControls (rotate/zoom/pan, damping).
- **Layout:** hero panel.
- **Source of truth:** the Phase-1 `result.geometry` IR — the viewer recomputes nothing.

## Architecture
```
src/vendor/three.module.js        vendored Three.js (pinned)
src/vendor/OrbitControls.js       vendored addon (imports bare 'three' → importmap)
src/scene.js   NEW  PURE: geometryToMeshSpecs(geometry) + materialColor + sceneBounds (no THREE import → unit-testable)
src/viewer.js  NEW  createViewer(container) → { update(geometry), dispose() }; builds THREE meshes from specs
src/main.js    EDIT lazily/guarded import viewer; render() calls viewer.update(result.geometry)
index.html     EDIT importmap {"three":"/src/vendor/three.module.js"}; hero layout; #viewer container
src/styles.css EDIT hero-panel grid
test/scene.test.mjs NEW  asserts the pure IR→mesh-spec mapping (no THREE, no DOM)
```

## Pure mapping (`src/scene.js`, testable)
`geometryToMeshSpecs(geometry)` → array of plain descriptors:
- `box` → `{kind:'box', size, pos, color, opacity}`
- `cylinder` → `{kind:'cylinder', radius, height, axis, pos, color, opacity}`
- `ring` → `{kind:'ring', rInner, rOuter, pos, color, opacity}` (flat annulus; patch metal is ~µm thin)
- `segment` → `{kind:'shape', outline:[[x,y]...], pos, color, opacity}` (disk arc minus chord cuts, as a 2D path)
- `feed` → `{kind:'line', p1, p2, color:'#ff5555'}`
- `materialColor`: substrate `#2e7d5b` opacity 0.35, pec `#d8893b` (copper), ground `#8a8f98`, feed red.
- `sceneBounds(specs)` → bounding box for camera auto-fit.

## Viewer (`src/viewer.js`)
`createViewer(container)`: WebGLRenderer + PerspectiveCamera + hemispheric/directional light +
GridHelper + AxesHelper + OrbitControls; `update(geometry)` clears the model group, builds meshes
from `geometryToMeshSpecs`, recenters + auto-fits the camera to `sceneBounds`. CylinderGeometry is
y-up by default → rotate to the spec `axis`. `ShapeGeometry` for the CP truncated disk.

## main.js wiring
- **Lazy, guarded** import so the headless Node test still loads `main.js`:
  ```js
  let viewer = null;
  import('./viewer.js').then(m => { viewer = m.createViewer(document.getElementById('viewer')); render(); })
    .catch(() => {});           // viewer unavailable (headless/no WebGL) → app still works
  ```
- `render()` ends with `if (viewer) viewer.update(result.geometry);`

## Verification
- `test/scene.test.mjs`: each of the 7 types → non-empty specs; box/cylinder/ring/shape/line kinds
  present where expected; colors by material; finite positions; no NaN. (Pure, no THREE/DOM.)
- `node --check` on scene.js, viewer.js, main.js.
- Existing `test/smoke.test.mjs` still green (guarded dynamic import → no THREE in node).
- Build copies `src/vendor/` into `dist/`.
- Browser visual check when the Chrome extension is connected (rotate, switch types, see live rebuild).

## Non-goals (Phase 2)
- No CSG/Boolean meshing (flat metal approximations are visually faithful for thin patches).
- No animation/field plots; no export of the 3D model.
