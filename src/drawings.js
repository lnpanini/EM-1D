// Static dimensioned engineering views — top-down and cross-section — rendered
// as SVG strings straight from the geometry IR. Pure (no DOM/THREE) so it is
// unit-tested in Node alongside scene.js.
import { MAT_CONDUCTOR, MAT_SUBSTRATE, MAT_FEED, segmentOutline, dimensionSpecs } from './scene.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const C_COND = hex(MAT_CONDUCTOR);
const C_SUB = hex(MAT_SUBSTRATE);
const C_FEED = hex(MAT_FEED);
const C_INK = '#586572';   // conductor outline ink (design-system token)
const C_DIM = '#4C7AE6';   // dimension lines/labels (brand blue)

const nn = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r3 = (v) => Number(nn(v).toFixed(3));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function text(x, y, s, fs, anchor = 'middle', fill = C_DIM) {
  return `<text x="${r3(x)}" y="${r3(y)}" font-size="${r3(fs)}" text-anchor="${anchor}" fill="${fill}" stroke="none" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${esc(s)}</text>`;
}

// Linear dimension: line with perpendicular end ticks + centered label.
function dimLine(x1, y1, x2, y2, label, fs) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const t = fs * 0.4;
  const mx = (x1 + x2) / 2 + nx * fs * 0.9, my = (y1 + y2) / 2 + ny * fs * 0.9;
  return `<g stroke="${C_DIM}" stroke-width="${r3(fs * 0.08)}">`
    + `<line x1="${r3(x1)}" y1="${r3(y1)}" x2="${r3(x2)}" y2="${r3(y2)}"/>`
    + `<line x1="${r3(x1 - nx * t)}" y1="${r3(y1 - ny * t)}" x2="${r3(x1 + nx * t)}" y2="${r3(y1 + ny * t)}"/>`
    + `<line x1="${r3(x2 - nx * t)}" y1="${r3(y2 - ny * t)}" x2="${r3(x2 + nx * t)}" y2="${r3(y2 + ny * t)}"/>`
    + '</g>'
    + text(mx, my + fs * 0.3, label, fs);
}

// Radial dimension: center dot + line to the edge, label near the midpoint.
function dimRadial(x1, y1, x2, y2, label, fs) {
  const mx = x1 + (x2 - x1) * 0.55, my = y1 + (y2 - y1) * 0.55;
  return `<g stroke="${C_DIM}" stroke-width="${r3(fs * 0.08)}">`
    + `<line x1="${r3(x1)}" y1="${r3(y1)}" x2="${r3(x2)}" y2="${r3(y2)}"/>`
    + `<circle cx="${r3(x1)}" cy="${r3(y1)}" r="${r3(fs * 0.14)}" fill="${C_DIM}"/>`
    + '</g>'
    + text(mx, my - fs * 0.35, label, fs);
}

function svgDoc(inner, b, fs) {
  const pad = fs * 2.6;
  const w = b.maxX - b.minX + 2 * pad, h = b.maxY - b.minY + 2 * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r3(b.minX - pad)} ${r3(b.minY - pad)} ${r3(w)} ${r3(h)}" role="img">${inner}</svg>`;
}

const newBounds = () => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
function grow(b, x, y) {
  if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x;
  if (y < b.minY) b.minY = y; if (y > b.maxY) b.maxY = y;
}

const fillFor = (material) => (material === 'substrate'
  ? `fill="${C_SUB}" fill-opacity="0.28" stroke="${C_SUB}"`
  : `fill="${C_COND}" fill-opacity="0.92" stroke="${C_INK}"`);

// ---------------------------------------------------------------------------
// Top-down view (x-y plane, +y up).
// ---------------------------------------------------------------------------
export function topViewSVG(geometry) {
  const shapes = (geometry || []).filter((p) => p && p.shape);
  if (!shapes.length) return '';
  const b = newBounds();
  const layers = { substrate: [], pec: [], feed: [] };
  const Y = (y) => -y;

  for (const p of shapes) {
    const key = p.material === 'substrate' ? 'substrate' : (p.shape === 'feed' ? 'feed' : 'pec');
    if (p.shape === 'box') {
      const x0 = p.center[0] - p.size.x / 2, y0 = Y(p.center[1]) - p.size.y / 2;
      grow(b, x0, y0); grow(b, x0 + p.size.x, y0 + p.size.y);
      layers[key].push(`<rect x="${r3(x0)}" y="${r3(y0)}" width="${r3(p.size.x)}" height="${r3(p.size.y)}" ${fillFor(p.material)}/>`);
    } else if (p.shape === 'tube') {
      // Swept channel: a stroked polyline of width = channel diameter reads the
      // same as the filled conductor from above.
      const d = p.path.map((q, i) => `${i ? 'L' : 'M'}${r3(q[0])} ${r3(Y(q[1]))}`).join(' ');
      for (const q of p.path) { grow(b, q[0] - p.radius, Y(q[1]) - p.radius); grow(b, q[0] + p.radius, Y(q[1]) + p.radius); }
      layers[key].push(`<path d="${d}" fill="none" stroke="${C_COND}" stroke-width="${r3(2 * p.radius)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    } else if (p.shape === 'trace') {
      const ring = (pts) => pts.map((q, i) => `${i ? 'L' : 'M'}${r3(p.center[0] + q[0])} ${r3(Y(p.center[1] + q[1]))}`).join(' ') + ' Z';
      for (const q of p.outline) grow(b, p.center[0] + q[0], Y(p.center[1] + q[1]));
      const d = ring(p.outline) + (p.inner ? ' ' + ring(p.inner) : '');
      layers[key].push(`<path d="${d}" fill-rule="evenodd" ${fillFor(p.material)}/>`);
    } else if (p.shape === 'cylinder' && (p.axis || 'z') === 'z') {
      grow(b, p.center[0] - p.radius, Y(p.center[1]) - p.radius);
      grow(b, p.center[0] + p.radius, Y(p.center[1]) + p.radius);
      layers[key].push(`<circle cx="${r3(p.center[0])}" cy="${r3(Y(p.center[1]))}" r="${r3(p.radius)}" ${fillFor(p.material)}/>`);
    } else if (p.shape === 'ring') {
      grow(b, p.center[0] - p.rOuter, Y(p.center[1]) - p.rOuter);
      grow(b, p.center[0] + p.rOuter, Y(p.center[1]) + p.rOuter);
      const cx = r3(p.center[0]), cy = r3(Y(p.center[1]));
      const d = `M ${cx - r3(p.rOuter)} ${cy} a ${r3(p.rOuter)} ${r3(p.rOuter)} 0 1 0 ${r3(2 * p.rOuter)} 0 a ${r3(p.rOuter)} ${r3(p.rOuter)} 0 1 0 ${r3(-2 * p.rOuter)} 0 Z `
        + `M ${cx - r3(p.rInner)} ${cy} a ${r3(p.rInner)} ${r3(p.rInner)} 0 1 0 ${r3(2 * p.rInner)} 0 a ${r3(p.rInner)} ${r3(p.rInner)} 0 1 0 ${r3(-2 * p.rInner)} 0 Z`;
      layers[key].push(`<path d="${d}" fill-rule="evenodd" ${fillFor(p.material)}/>`);
    } else if (p.shape === 'segment') {
      const pts = segmentOutline(p).map(([x, y]) => `${r3(p.center[0] + x)},${r3(Y(p.center[1] + y))}`).join(' ');
      grow(b, p.center[0] - p.radius, Y(p.center[1]) - p.radius);
      grow(b, p.center[0] + p.radius, Y(p.center[1]) + p.radius);
      layers[key].push(`<polygon points="${pts}" ${fillFor(p.material)}/>`);
    } else if (p.shape === 'feed') {
      const x = p.p1[0], y = Y(p.p1[1]);
      grow(b, x, y);
      layers.feed.push(`<g stroke="${C_FEED}" stroke-width="__SW__"><line x1="${r3(x - 1)}" y1="${r3(y)}" x2="${r3(x + 1)}" y2="${r3(y)}"/><line x1="${r3(x)}" y1="${r3(y - 1)}" x2="${r3(x)}" y2="${r3(y + 1)}"/></g>`);
    }
  }

  const dims = dimensionSpecs(geometry).filter((d) => d.views.includes('top'));
  for (const d of dims) { grow(b, d.p1[0], Y(d.p1[1])); grow(b, d.p2[0], Y(d.p2[1])); }
  if (!Number.isFinite(b.minX)) return '';
  const fs = 0.045 * Math.max(b.maxX - b.minX, b.maxY - b.minY, 1);

  let out = layers.substrate.join('') + layers.pec.join('') + layers.feed.join('').replace(/__SW__/g, String(r3(fs * 0.12)));
  for (const d of dims) {
    const fn = d.kind === 'radial' ? dimRadial : dimLine;
    out += fn(d.p1[0], Y(d.p1[1]), d.p2[0], Y(d.p2[1]), d.label, fs);
  }
  return svgDoc(out, b, fs);
}

// ---------------------------------------------------------------------------
// Cross-section view. Cuts x-z at y=0 by default; if the conductor layout is
// offset in y (planar monopoles), cuts y-z at x=0 instead. Thin boards get a
// z-scale exaggeration (noted in the corner) so layer heights stay readable.
// ---------------------------------------------------------------------------
export function sectionViewSVG(geometry) {
  const shapes = (geometry || []).filter((p) => p && p.shape);
  if (!shapes.length) return '';

  // pick the cut plane from the conductor footprint's y-symmetry
  let yMin = Infinity, yMax = -Infinity;
  for (const p of shapes) {
    if (p.shape === 'feed' || p.material === 'substrate') continue;
    // Path-based shapes carry no `center`; take their extent from the path/outline.
    if (p.shape === 'tube') {
      for (const q of p.path) { yMin = Math.min(yMin, q[1] - p.radius); yMax = Math.max(yMax, q[1] + p.radius); }
      continue;
    }
    if (p.shape === 'trace') {
      for (const q of p.outline) { yMin = Math.min(yMin, p.center[1] + q[1]); yMax = Math.max(yMax, p.center[1] + q[1]); }
      continue;
    }
    let hy = 0;
    if (p.shape === 'box') hy = p.size.y / 2;
    else if (p.shape === 'ring') hy = p.rOuter;
    else if (p.shape === 'cylinder' || p.shape === 'segment') hy = p.radius;
    yMin = Math.min(yMin, p.center[1] - hy); yMax = Math.max(yMax, p.center[1] + hy);
  }
  const yExt = (yMax - yMin) || 1;
  const planeX = Math.abs((yMin + yMax) / 2) > 0.2 * yExt;   // asymmetric → cut x=0
  const H = planeX ? 1 : 0;                                   // horizontal coord index
  const hSize = (p) => (H === 0 ? p.size.x : p.size.y);
  const perpHalf = (p) => {
    if (p.shape === 'box') return (H === 0 ? p.size.y : p.size.x) / 2;
    if (p.shape === 'ring') return p.rOuter;
    return p.radius;
  };

  const rects = [];   // { h0, h1, z0, z1, material }
  const feeds = [];
  for (const p of shapes) {
    if (p.shape === 'feed') { feeds.push(p); continue; }
    if (p.shape === 'tube') {
      // Section a swept channel: every path point within the cut plane becomes a
      // slice of the conductor at its own depth, so the z-undulation shows up.
      const perp = H === 0 ? 1 : 0;
      for (const q of p.path) {
        if (Math.abs(q[perp]) > p.radius) continue;
        rects.push({ h0: q[H] - p.radius, h1: q[H] + p.radius,
          z0: q[2] - p.radius, z1: q[2] + p.radius, material: p.material });
      }
      continue;
    }
    if (p.shape === 'trace') {
      const hs = p.outline.map((q) => p.center[H] + q[H]);
      rects.push({ h0: Math.min(...hs), h1: Math.max(...hs),
        z0: p.center[2] - p.thickness / 2, z1: p.center[2] + p.thickness / 2, material: p.material });
      continue;
    }
    const cPerp = p.center[H === 0 ? 1 : 0];
    if (Math.abs(cPerp) > perpHalf(p) + 1e-9) continue;       // shape misses the cut plane
    const c = p.center[H], cz = p.center[2];
    if (p.shape === 'box') {
      rects.push({ h0: c - hSize(p) / 2, h1: c + hSize(p) / 2, z0: cz - p.size.z / 2, z1: cz + p.size.z / 2, material: p.material });
    } else if (p.shape === 'cylinder' || p.shape === 'segment') {
      rects.push({ h0: c - p.radius, h1: c + p.radius, z0: cz - p.height / 2, z1: cz + p.height / 2, material: p.material });
    } else if (p.shape === 'ring') {
      rects.push({ h0: c - p.rOuter, h1: c - p.rInner, z0: cz - p.height / 2, z1: cz + p.height / 2, material: p.material });
      rects.push({ h0: c + p.rInner, h1: c + p.rOuter, z0: cz - p.height / 2, z1: cz + p.height / 2, material: p.material });
    }
  }
  if (!rects.length) return '';

  let hMin = Infinity, hMax = -Infinity, zMin = Infinity, zMax = -Infinity;
  for (const r of rects) {
    hMin = Math.min(hMin, r.h0); hMax = Math.max(hMax, r.h1);
    zMin = Math.min(zMin, r.z0); zMax = Math.max(zMax, r.z1);
  }
  const hExt = (hMax - hMin) || 1, zExt = (zMax - zMin) || 1;
  const zScale = Math.min(40, Math.max(1, (hExt * 0.22) / zExt));
  const Z = (z) => -z * zScale;

  const b = newBounds();
  const sub = [], pec = [];
  for (const r of rects) {
    grow(b, r.h0, Z(r.z1)); grow(b, r.h1, Z(r.z0));
    const rect = `<rect x="${r3(r.h0)}" y="${r3(Z(r.z1))}" width="${r3(r.h1 - r.h0)}" height="${r3((r.z1 - r.z0) * zScale)}" ${fillFor(r.material)}/>`;
    (r.material === 'substrate' ? sub : pec).push(rect);
  }

  const dims = dimensionSpecs(geometry).filter((d) => d.views.includes('section'));
  for (const d of dims) { grow(b, d.p1[H], Z(d.p1[2])); grow(b, d.p2[H], Z(d.p2[2])); }
  const fs = 0.045 * Math.max(b.maxX - b.minX, b.maxY - b.minY, 1);

  let out = sub.join('') + pec.join('');
  for (const f of feeds) {
    out += `<line x1="${r3(f.p1[H])}" y1="${r3(Z(f.p1[2]))}" x2="${r3(f.p2[H])}" y2="${r3(Z(f.p2[2]))}" stroke="${C_FEED}" stroke-width="${r3(fs * 0.12)}" stroke-dasharray="${r3(fs * 0.4)} ${r3(fs * 0.3)}"/>`;
    grow(b, f.p1[H], Z(f.p1[2])); grow(b, f.p2[H], Z(f.p2[2]));
  }

  // Dim callouts: short (thin-layer) dims get ticks + a side label, staggered
  // to avoid overlap; longer dims render as normal dimension lines.
  let lastLabelY = -Infinity;
  const sorted = dims.slice().sort((a, c) => ((a.p1[2] + a.p2[2]) - (c.p1[2] + c.p2[2])));
  for (const d of sorted) {
    const x = d.p1[H], y1 = Z(d.p1[2]), y2 = Z(d.p2[2]);
    if (Math.abs(y2 - y1) >= fs * 2) {
      out += dimLine(x, y1, x, y2, d.label, fs);
      continue;
    }
    const t = fs * 0.4, yMid = (y1 + y2) / 2;
    let ly = yMid;
    if (ly - lastLabelY < fs * 1.2 && Number.isFinite(lastLabelY)) ly = lastLabelY + fs * 1.2;
    lastLabelY = ly;
    out += `<g stroke="${C_DIM}" stroke-width="${r3(fs * 0.08)}">`
      + `<line x1="${r3(x - t)}" y1="${r3(y1)}" x2="${r3(x + t)}" y2="${r3(y1)}"/>`
      + `<line x1="${r3(x - t)}" y1="${r3(y2)}" x2="${r3(x + t)}" y2="${r3(y2)}"/>`
      + `<line x1="${r3(x)}" y1="${r3(yMid)}" x2="${r3(x + fs * 0.9)}" y2="${r3(ly)}"/>`
      + '</g>'
      + text(x + fs * 1.1, ly + fs * 0.32, d.label, fs, 'start');
    grow(b, x + fs * 5, ly);
  }

  if (zScale > 1.05) out += text(b.minX, b.minY - fs * 0.6, `z ×${Number(zScale.toFixed(1))}`, fs * 0.9, 'start', C_INK);
  return svgDoc(out, b, fs);
}
