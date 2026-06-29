import { synthesize, buildVba, TYPES } from './physics.js';

// Design-key inputs read from the DOM. `type` and `polarization` stay strings;
// everything else is numerically coerced.
const FIELDS = [
  'type', 'frequencyGHz', 'substrateEr', 'substrateHeightMm', 'lossTangent',
  'conductorThicknessMm', 'wireRadiusMm', 'groundLengthMm', 'groundWidthMm',
  'feedGapMm', 'portImpedance', 'ringRatio', 'polarization', 'lowerCutoffGHz',
];
const STRING_FIELDS = new Set(['type', 'polarization']);

const $ = (id) => document.getElementById(id);

// 3D viewer is optional: lazily + guardedly imported so headless/no-WebGL
// environments (and the Node smoke test) still load main.js without it.
let viewer = null;

function readDesign() {
  const design = {};
  for (const field of FIELDS) {
    const el = $(field);
    if (!el) continue;
    design[field] = STRING_FIELDS.has(field) ? el.value : Number(el.value);
  }
  return design;
}

// Populate the type select from the single source of truth (TYPES), preserving
// any current selection. The HTML carries the same options for no-JS structure.
function buildTypeSelect() {
  const sel = $('type');
  if (!sel) return;
  const current = sel.value || TYPES[0].key;
  sel.innerHTML = TYPES.map((t) => `<option value="${t.key}">${t.label}</option>`).join('');
  sel.value = current;
}

function applyVisibility(type) {
  document.querySelectorAll('[data-types]').forEach((el) => {
    el.hidden = !el.dataset.types.split(/\s+/).includes(type);
  });
}

// Format a number with fixed places + optional unit; em-dash for non-finite.
function fmt(value, places = 2, unit = '') {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const s = String(Number(n.toFixed(places)));
  return unit ? `${s} ${unit}` : s;
}

function fillMetrics(type, m) {
  const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };

  let size = '—';
  switch (type) {
    case 'rect': size = `${fmt(m.L)} × ${fmt(m.W)} mm`; break;
    case 'dipole': size = `arm ${fmt(m.armMm)} mm (L ${fmt(m.lengthMm)} mm)`; break;
    case 'monopole': size = `height ${fmt(m.heightMm)} mm`; break;
    case 'disk': size = `a ${fmt(m.a)} mm · ae ${fmt(m.ae)} mm`; break;
    case 'annular': size = `a ${fmt(m.a)} mm · b ${fmt(m.b)} mm`; break;
    case 'cp': size = `a ${fmt(m.a)} mm`; break;
    case 'uwb': size = `r ${fmt(m.discRadius)} mm · req ${fmt(m.reqRadius)} mm`; break;
    default: size = '—';
  }
  set('sizeMain', size);

  set('eeff', fmt(m.eeffF, 3));

  set('inset', type === 'cp'
    ? `Δb ${fmt(m.truncationDepth, 3)} mm · slot Ls ${fmt(m.slotLength)} mm`
    : fmt(m.insetY0, 3, 'mm'));

  set('edgeR', fmt(type === 'rect' ? m.Rin0 : m.Redge, 1, 'Ω'));
  set('q', fmt(m.Qt, 1));
  set('bw', fmt(m.bandwidthPct, 2, '%'));

  let ground = '—';
  if (type === 'rect') ground = `${fmt(m.groundL)} × ${fmt(m.groundW)} mm`;
  else if (type === 'disk') ground = `r ${fmt(m.groundRadius)} mm`;
  else if (type === 'uwb') ground = `${fmt(m.groundW)} × ${fmt(m.groundL)} mm`;
  set('ground', ground);

  const x = Number(m.X);
  set('impedance', Number.isFinite(x)
    ? `${fmt(m.R, 1)} ${x >= 0 ? '+' : '−'} j${fmt(Math.abs(x), 1)} Ω`
    : '—');

  set('resonant', `${fmt(m.resonantLengthRatio, 4)} ·λ0`);

  let probe = '—';
  if (type === 'disk') probe = fmt(m.probeRho0, 3, 'mm');
  else if (type === 'annular') probe = fmt((Number(m.a) + Number(m.b)) / 2, 3, 'mm');
  else if (type === 'cp') probe = `${fmt(m.feedRho0, 3)} mm @ ${fmt(m.feedAngleDeg, 0)}°`;
  set('probe', probe);

  set('splitFreqs', `${fmt(m.f1, 4)} / ${fmt(m.f2, 4)} GHz`);
  set('arBw', fmt(m.arBandwidthPct, 2, '%'));
  set('matchable', m.matchable ? 'yes' : 'no');
}

function showWarnings(warnings) {
  const box = $('warnings');
  if (!box) return;
  box.replaceChildren();
  for (const w of warnings || []) {
    const div = document.createElement('div');
    div.className = 'warn';
    div.textContent = String(w);
    box.appendChild(div);
  }
}

function render() {
  const design = readDesign();
  const type = design.type;
  const result = synthesize(type, design);
  fillMetrics(type, result.metrics || {});
  showWarnings(result.warnings);
  $('vba').value = buildVba(result, design);
  if (viewer) viewer.update(result.geometry);
}

function vbaFor(design) {
  return buildVba(synthesize(design.type, design), design);
}

// --- wiring ---------------------------------------------------------------
buildTypeSelect();

const controls = $('controls');
controls.addEventListener('input', render);
controls.addEventListener('change', render);

$('type').addEventListener('change', () => {
  applyVisibility($('type').value);
  render();
});

$('copy').addEventListener('click', () => {
  navigator.clipboard.writeText($('vba').value);
});

$('download').addEventListener('click', () => {
  const design = readDesign();
  const freq = design.type === 'uwb' ? design.lowerCutoffGHz : design.frequencyGHz;
  const blob = new Blob([vbaFor(design)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${design.type}-${freq}GHz-cst.vba`;
  anchor.click();
  URL.revokeObjectURL(url);
});

applyVisibility($('type').value);
render();

// Bring up the 3D viewer if the environment supports it (browser + WebGL).
import('./viewer.js')
  .then((m) => {
    viewer = m.createViewer($('viewer'));
    if (viewer) render();
  })
  .catch(() => { /* viewer unavailable — the rest of the app works without it */ });
