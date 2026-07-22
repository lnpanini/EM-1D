// Pure geometry-IR → mesh-spec mapping for the 3D viewer.
// No THREE / DOM imports so it is unit-testable in Node. viewer.js turns these
// plain descriptors into actual Three.js meshes.

// Material colors match the EM-1D Design System token map (tokens.css):
// conductor steel #BFC7D0, dielectric substrate #2E7D5B (translucent), feed #E0524D.
export const MAT_CONDUCTOR = 0xbfc7d0;
export const MAT_SUBSTRATE = 0x2e7d5b;
export const MAT_FEED = 0xe0524d;
// Liquid metal (EGaIn/Galinstan): warmer and brighter than the steel PEC tone so
// an injected channel reads differently from an etched trace at a glance.
export const MAT_LIQUID = 0xe8e4dc;

export function materialStyle(material) {
  switch (material) {
    case 'substrate': return { color: MAT_SUBSTRATE, opacity: 0.36, transparent: true };
    case 'feed': return { color: MAT_FEED, opacity: 1, transparent: false };
    case 'lm': return { color: MAT_LIQUID, opacity: 1, transparent: false };
    case 'pec':
    default: return { color: MAT_CONDUCTOR, opacity: 1, transparent: false }; // steel PEC
  }
}

// Clip a 2D polygon to the half-plane { p : p·n <= d } (Sutherland–Hodgman).
function clipHalfPlane(poly, n, d) {
  const out = [];
  const side = (p) => p[0] * n[0] + p[1] * n[1] - d;
  const intersect = (a, b) => {
    const da = side(a), db = side(b), t = da / (da - db);
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  };
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i], prev = poly[(i - 1 + poly.length) % poly.length];
    const curIn = side(cur) <= 0, prevIn = side(prev) <= 0;
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out;
}

// Outline (2D points) of a disk of radius R with truncation chords applied.
export function segmentOutline(p, segments = 96) {
  const R = p.radius;
  let pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    pts.push([R * Math.cos(a), R * Math.sin(a)]);
  }
  for (const cut of p.cuts || []) {
    const th = ((cut.angleDeg || 0) * Math.PI) / 180;
    const n = [Math.cos(th), Math.sin(th)];
    const d = R - (cut.depth || 0);
    if (d > 0 && d < R) pts = clipHalfPlane(pts, n, d);
  }
  return pts;
}

export function geometryToMeshSpecs(geometry) {
  const specs = [];
  for (const p of geometry || []) {
    if (!p || !p.shape) continue;
    const style = materialStyle(p.material);
    if (p.shape === 'box') {
      specs.push({ kind: 'box', size: [p.size.x, p.size.y, p.size.z], pos: [...p.center], ...style });
    } else if (p.shape === 'cylinder') {
      specs.push({ kind: 'cylinder', radius: p.radius, height: p.height, axis: p.axis || 'z', pos: [...p.center], ...style });
    } else if (p.shape === 'ring') {
      specs.push({ kind: 'ring', rInner: p.rInner, rOuter: p.rOuter, pos: [...p.center], ...style });
    } else if (p.shape === 'segment') {
      specs.push({ kind: 'shape', outline: segmentOutline(p), pos: [...p.center], ...style });
    } else if (p.shape === 'trace') {
      // A closed loop is an annulus: `inner` is the hole boundary.
      const spec = { kind: 'shape', outline: p.outline, pos: [...p.center], ...style };
      if (p.inner && p.inner.length) spec.holes = [p.inner];
      specs.push(spec);
    } else if (p.shape === 'tube') {
      // Swept channel along a 3D centerline (embedded liquid metal).
      specs.push({ kind: 'tube', path: p.path.map((q) => [...q]), radius: p.radius, ...style });
    } else if (p.shape === 'feed') {
      specs.push({ kind: 'line', p1: [...p.p1], p2: [...p.p2], color: MAT_FEED });
    }
  }
  return specs;
}

// ---------------------------------------------------------------------------
// Dimension annotations derived from the geometry IR.
// Each spec: { p1:[x,y,z], p2:[x,y,z], label, views, kind? } where views is a
// subset of '3d' | 'top' | 'section' and kind 'radial' marks center→edge dims.
// Values are mm; labels are bare numbers (units shown once in the UI chrome).
// ---------------------------------------------------------------------------
export function dimLabel(v) {
  const a = Math.abs(Number(v) || 0);
  return String(Number(a.toFixed(a < 0.1 ? 3 : 2)));
}

export function dimensionSpecs(geometry) {
  const shapes = (geometry || []).filter((p) => p && p.shape);
  const dims = [];
  const boxes = shapes.filter((p) => p.shape === 'box');

  // The "board" is the largest-footprint box (substrate or ground sheet).
  let board = null;
  for (const b of boxes) if (!board || b.size.x * b.size.y > board.size.x * board.size.y) board = b;
  const boardArea = board ? board.size.x * board.size.y : 0;
  const pad = board ? 0.07 * Math.max(board.size.x, board.size.y) : 2;

  if (board) {
    const [cx, cy, cz] = board.center;
    const zTop = cz + board.size.z / 2;
    const x0 = cx - board.size.x / 2, x1 = cx + board.size.x / 2;
    const y0 = cy - board.size.y / 2, y1 = cy + board.size.y / 2;
    dims.push({ p1: [x0, y0 - pad, zTop], p2: [x1, y0 - pad, zTop], label: dimLabel(board.size.x), views: ['3d', 'top'] });
    dims.push({ p1: [x0 - pad, y0, zTop], p2: [x0 - pad, y1, zTop], label: dimLabel(board.size.y), views: ['3d', 'top'] });
  }

  // Distinct smaller plates (e.g. a patch) get their own footprint dims, drawn
  // just inside their edges. Near-board-sized (ground) and sliver (feed strip)
  // boxes are skipped to avoid duplicate/cluttered callouts.
  for (const b of boxes) {
    if (b === board || !boardArea) continue;
    const ratio = (b.size.x * b.size.y) / boardArea;
    if (ratio >= 0.88 || ratio < 0.12) continue;
    const [cx, cy, cz] = b.center;
    const zTop = cz + b.size.z / 2;
    const x0 = cx - b.size.x / 2, x1 = cx + b.size.x / 2;
    const y0 = cy - b.size.y / 2, y1 = cy + b.size.y / 2;
    dims.push({ p1: [x0, y0 + pad * 0.35, zTop], p2: [x1, y0 + pad * 0.35, zTop], label: dimLabel(b.size.x), views: ['3d', 'top'] });
    dims.push({ p1: [x0 + pad * 0.35, y0, zTop], p2: [x0 + pad * 0.35, y1, zTop], label: dimLabel(b.size.y), views: ['3d', 'top'] });
  }

  // Rings: outer radius for each (staggered angles so multi-ring labels don't
  // overlap); inner radius once, on the outermost ring.
  const rings = shapes.filter((p) => p.shape === 'ring').slice().sort((a, b) => b.rOuter - a.rOuter);
  rings.forEach((r, i) => {
    const [cx, cy, cz] = r.center;
    const zTop = cz + (r.height || 0) / 2;
    const th = ((30 + i * 40) % 360) * Math.PI / 180;
    dims.push({
      p1: [cx, cy, zTop], p2: [cx + r.rOuter * Math.cos(th), cy + r.rOuter * Math.sin(th), zTop],
      label: `R ${dimLabel(r.rOuter)}`, views: ['3d', 'top'], kind: 'radial',
    });
    if (i === 0) {
      const t2 = th + Math.PI;
      dims.push({
        p1: [cx, cy, zTop], p2: [cx + r.rInner * Math.cos(t2), cy + r.rInner * Math.sin(t2), zTop],
        label: `r ${dimLabel(r.rInner)}`, views: ['3d', 'top'], kind: 'radial',
      });
    }
  });

  for (const p of shapes) {
    if (p.shape === 'segment') {
      const [cx, cy, cz] = p.center;
      const zTop = cz + (p.height || 0) / 2;
      const th = Math.PI * 0.75; // 135° — clear of the 45°/225° CP truncations
      dims.push({
        p1: [cx, cy, zTop], p2: [cx + p.radius * Math.cos(th), cy + p.radius * Math.sin(th), zTop],
        label: `R ${dimLabel(p.radius)}`, views: ['3d', 'top'], kind: 'radial',
      });
    } else if (p.shape === 'cylinder' && (p.axis || 'z') === 'z') {
      const [cx, cy, cz] = p.center;
      if (p.height > 2 * p.radius) {
        // wire: dim its length alongside
        const off = Math.max(2, 4 * p.radius);
        dims.push({
          p1: [cx + off, cy, cz - p.height / 2], p2: [cx + off, cy, cz + p.height / 2],
          label: dimLabel(p.height), views: ['3d', 'section'],
        });
      } else {
        // disk: radius
        const th = Math.PI / 6;
        const zTop = cz + p.height / 2;
        dims.push({
          p1: [cx, cy, zTop], p2: [cx + p.radius * Math.cos(th), cy + p.radius * Math.sin(th), zTop],
          label: `R ${dimLabel(p.radius)}`, views: ['3d', 'top'], kind: 'radial',
        });
      }
    }
  }

  // Layer thicknesses (section view): one dim per distinct z-slab, placed past
  // the +x/+y extent so they sit beside the stack in either cut orientation.
  const slabKey = new Set();
  const slabs = [];
  const addSlab = (z0, z1) => {
    const k = z0.toFixed(4) + ':' + z1.toFixed(4);
    if (!slabKey.has(k) && z1 - z0 > 0) { slabKey.add(k); slabs.push([z0, z1]); }
  };
  let maxX = 0, maxY = 0;
  for (const p of shapes) {
    if (p.shape === 'box') {
      addSlab(p.center[2] - p.size.z / 2, p.center[2] + p.size.z / 2);
      maxX = Math.max(maxX, p.center[0] + p.size.x / 2);
      maxY = Math.max(maxY, p.center[1] + p.size.y / 2);
    } else if (p.shape === 'ring') {
      addSlab(p.center[2] - p.height / 2, p.center[2] + p.height / 2);
      maxX = Math.max(maxX, p.center[0] + p.rOuter);
      maxY = Math.max(maxY, p.center[1] + p.rOuter);
    } else if (p.shape === 'segment' || (p.shape === 'cylinder' && (p.axis || 'z') === 'z' && p.height <= 2 * p.radius)) {
      addSlab(p.center[2] - p.height / 2, p.center[2] + p.height / 2);
      maxX = Math.max(maxX, p.center[0] + p.radius);
      maxY = Math.max(maxY, p.center[1] + p.radius);
    }
  }
  slabs.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
  for (const [z0, z1] of slabs) {
    dims.push({ p1: [maxX + pad * 0.5, maxY + pad * 0.5, z0], p2: [maxX + pad * 0.5, maxY + pad * 0.5, z1], label: dimLabel(z1 - z0), views: ['section'] });
  }

  return dims;
}

// Axis-aligned bounding box over all specs, for camera auto-fit.
export function sceneBounds(specs) {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  const grow = (pt) => { for (let i = 0; i < 3; i++) { if (pt[i] < min[i]) min[i] = pt[i]; if (pt[i] > max[i]) max[i] = pt[i]; } };
  for (const s of specs) {
    if (s.kind === 'box') {
      const [x, y, z] = s.pos, [sx, sy, sz] = s.size;
      grow([x - sx / 2, y - sy / 2, z - sz / 2]); grow([x + sx / 2, y + sy / 2, z + sz / 2]);
    } else if (s.kind === 'cylinder') {
      const [x, y, z] = s.pos, r = s.radius, h = s.height / 2;
      const e = s.axis === 'z' ? [r, r, h] : s.axis === 'x' ? [h, r, r] : [r, h, r];
      grow([x - e[0], y - e[1], z - e[2]]); grow([x + e[0], y + e[1], z + e[2]]);
    } else if (s.kind === 'ring') {
      const [x, y, z] = s.pos, r = s.rOuter;
      grow([x - r, y - r, z]); grow([x + r, y + r, z]);
    } else if (s.kind === 'shape') {
      const [x, y, z] = s.pos;
      for (const o of s.outline) grow([x + o[0], y + o[1], z]);
    } else if (s.kind === 'tube') {
      const r = s.radius;
      for (const q of s.path) { grow([q[0] - r, q[1] - r, q[2] - r]); grow([q[0] + r, q[1] + r, q[2] + r]); }
    } else if (s.kind === 'line') {
      grow(s.p1); grow(s.p2);
    }
  }
  if (!Number.isFinite(min[0])) return null;
  return {
    min, max,
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    size: Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1),
  };
}
