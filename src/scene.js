// Pure geometry-IR → mesh-spec mapping for the 3D viewer.
// No THREE / DOM imports so it is unit-testable in Node. viewer.js turns these
// plain descriptors into actual Three.js meshes.

// Material colors match the EM-1D Design System token map (tokens.css):
// conductor steel #BFC7D0, dielectric substrate #2E7D5B (translucent), feed #E0524D.
export const MAT_CONDUCTOR = 0xbfc7d0;
export const MAT_SUBSTRATE = 0x2e7d5b;
export const MAT_FEED = 0xe0524d;

export function materialStyle(material) {
  switch (material) {
    case 'substrate': return { color: MAT_SUBSTRATE, opacity: 0.36, transparent: true };
    case 'feed': return { color: MAT_FEED, opacity: 1, transparent: false };
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
      specs.push({ kind: 'shape', outline: p.outline, pos: [...p.center], ...style });
    } else if (p.shape === 'feed') {
      specs.push({ kind: 'line', p1: [...p.p1], p2: [...p.p2], color: MAT_FEED });
    }
  }
  return specs;
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
