// EM-1D Antenna Synthesis Workbench — wires the design-system Workbench layout
// to the physics engine (synthesize/buildVba) and the Three.js viewer.
import { synthesize, buildVba, TYPES } from './physics.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const fmt = (v, p = 2) => (Number.isFinite(Number(v)) ? String(Number(Number(v).toFixed(p))) : '—');
const glyphHTML = (type) => `<span class="${GLYPH[type]}"></span>`;

const GLYPH = { rect: 'g-rect', dipole: 'g-line', monopole: 'g-vline', disk: 'g-disk', annular: 'g-ring', cp: 'g-cp', uwb: 'g-uwb' };

// ---- substrate presets -----------------------------------------------------
// Each preset sets the laminate's nominal εr / tanδ and the standard panel
// thicknesses offered for it. 'Custom' leaves εr/tanδ editable and offers a
// broad set of common thicknesses.
const SUBSTRATE_PRESETS = {
  'FR-4':           { er: 4.4,  tanD: 0.02,   thicknesses: [0.4, 0.6, 0.8, 1.0, 1.6, 2.4, 3.2], def: 1.6 },
  'Rogers RO4350B': { er: 3.66, tanD: 0.0037, thicknesses: [0.168, 0.254, 0.338, 0.508, 0.762, 1.524], def: 0.762 },
  'Rogers RO4003C': { er: 3.55, tanD: 0.0027, thicknesses: [0.203, 0.305, 0.406, 0.508, 0.813, 1.524], def: 0.813 },
  'RT/Duroid 5880': { er: 2.2,  tanD: 0.0009, thicknesses: [0.127, 0.254, 0.381, 0.508, 0.787, 1.575], def: 0.787 },
  'Custom':         { er: null, tanD: null,   thicknesses: [0.13, 0.25, 0.51, 0.79, 1.0, 1.52, 1.6, 2.0, 3.2], def: 1.6 },
};

const CHEV = '<span class="chev"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>';

// ---- field descriptors -----------------------------------------------------
const FIELDS = {
  frequencyGHz:      { label: 'Target frequency', sym: 'f₀', unit: 'GHz', def: 2.45, group: 'Operating point' },
  lowerCutoffGHz:    { label: 'Lower cutoff', sym: 'f_L', unit: 'GHz', def: 3.1, group: 'Operating point' },
  substratePreset:   { label: 'Substrate preset', group: 'Substrate', select: Object.keys(SUBSTRATE_PRESETS), def: 'FR-4', preset: true },
  substrateEr:       { label: 'Relative permittivity', sym: 'εr', def: 4.4, group: 'Substrate' },
  substrateHeightMm: { label: 'Substrate height', sym: 'h', unit: 'mm', def: 1.6, group: 'Substrate', thickness: true },
  lossTangent:       { label: 'Loss tangent', sym: 'tanδ', def: 0.02, group: 'Substrate' },
  conductorThicknessMm: { label: 'Conductor thickness', sym: 't', unit: 'mm', def: 0.035, group: 'Substrate' },
  portImpedance:     { label: 'Port impedance', sym: 'Z₀', unit: 'Ω', def: 50, group: 'Feed' },
  wireRadiusMm:      { label: 'Wire radius', sym: 'a', unit: 'mm', def: 0.5, group: 'Geometry' },
  feedGapMm:         { label: 'Feed gap', sym: 'g', unit: 'mm', def: 1, group: 'Feed' },
  groundLengthMm:    { label: 'Ground length', unit: 'mm', def: 100, group: 'Geometry' },
  groundWidthMm:     { label: 'Ground width', unit: 'mm', def: 100, group: 'Geometry' },
  ringRatio:         { label: 'Ring ratio b/a', sym: 'ρ', def: 2, group: 'Geometry' },
  ringCount:         { label: 'Number of rings', group: 'Geometry', select: ['1', '2', '3', '4', '5'], def: '2' },
  ringGapMm:         { label: 'Inter-ring gap', sym: 'g', unit: 'mm', def: 1, group: 'Geometry' },
  innerRingWidthMm:  { label: 'Inner ring width', unit: 'mm', def: 2.5, group: 'Geometry' },
  feedWidthMm:       { label: 'Feed width', unit: 'mm', def: 1, group: 'Feed' },
  polarization:      { label: 'Polarization', group: 'Feed', select: ['RHCP', 'LHCP'] },
};
const TYPE_FIELDS = {
  rect: ['frequencyGHz', 'substratePreset', 'substrateEr', 'substrateHeightMm', 'lossTangent', 'conductorThicknessMm', 'portImpedance'],
  dipole: ['frequencyGHz', 'wireRadiusMm', 'feedGapMm'],
  monopole: ['frequencyGHz', 'wireRadiusMm', 'groundLengthMm', 'groundWidthMm', 'feedGapMm'],
  disk: ['frequencyGHz', 'substratePreset', 'substrateEr', 'substrateHeightMm', 'lossTangent', 'conductorThicknessMm', 'portImpedance'],
  annular: ['frequencyGHz', 'substratePreset', 'substrateEr', 'substrateHeightMm', 'lossTangent', 'portImpedance', 'ringRatio', 'ringCount', 'ringGapMm', 'innerRingWidthMm', 'feedWidthMm'],
  cp: ['frequencyGHz', 'substratePreset', 'substrateEr', 'substrateHeightMm', 'lossTangent', 'portImpedance', 'polarization'],
  uwb: ['lowerCutoffGHz', 'feedGapMm', 'groundLengthMm', 'groundWidthMm'],
};

const zstr = (m) => `${fmt(m.R, 1)} ${Number(m.X) >= 0 ? '+' : '−'} j${fmt(Math.abs(Number(m.X)), 1)} Ω`;

// ---- per-type display config (KPIs / viewer readout / results list) ---------
const VIEW = {
  rect: {
    readout: (m) => [['L', fmt(m.L)], ['W', fmt(m.W)]],
    kpis: (m) => [['Length L · mm', fmt(m.L)], ['Width W · mm', fmt(m.W)], ['Bandwidth · %', fmt(m.bandwidthPct)]],
    results: (m) => [['Effective εr', fmt(m.eeffF, 3)], ['Inset feed y₀', fmt(m.insetY0) + ' mm', 1], ['Edge resistance', fmt(m.Rin0, 1) + ' Ω'], ['Q factor', fmt(m.Qt, 1)], ['Ground plane', `${fmt(m.groundL)} × ${fmt(m.groundW)} mm`]],
  },
  dipole: {
    readout: (m) => [['arm', fmt(m.armMm)], ['L', fmt(m.lengthMm)]],
    kpis: (m) => [['Arm · mm', fmt(m.armMm)], ['Input R · Ω', fmt(m.R, 1)], ['L / λ₀', fmt(m.resonantLengthRatio, 4)]],
    results: (m) => [['Full length', fmt(m.lengthMm) + ' mm'], ['Reactance X', fmt(m.X, 2) + ' Ω'], ['Resonant L/λ₀', fmt(m.resonantLengthRatio, 4)]],
  },
  monopole: {
    readout: (m) => [['h', fmt(m.heightMm)]],
    kpis: (m) => [['Height · mm', fmt(m.heightMm)], ['Input R · Ω', fmt(m.R, 1)], ['React X · Ω', fmt(m.X, 1)]],
    results: (m) => [['Input impedance', zstr(m), 1]],
  },
  disk: {
    readout: (m) => [['a', fmt(m.a)], ['ae', fmt(m.ae)]],
    kpis: (m) => [['Radius a · mm', fmt(m.a)], ['Eff. radius · mm', fmt(m.ae)], ['Bandwidth · %', fmt(m.bandwidthPct)]],
    results: (m) => [['Edge resistance', fmt(m.Redge, 1) + ' Ω'], ['Probe ρ₀', fmt(m.probeRho0) + ' mm', 1], ['Resonance check', fmt(m.frCheck, 3) + ' GHz'], ['Q factor', fmt(m.Qt, 1)], ['Ground radius', fmt(m.groundRadius) + ' mm'], ['Matchable', m.matchable ? 'yes' : 'no']],
  },
  annular: {
    readout: (m) => [['R', fmt(m.b)], ['rings', fmt(m.ringCount, 0)]],
    kpis: (m) => [['Outer R · mm', fmt(m.b)], ['Rings', fmt(m.ringCount, 0)], ['Bandwidth · %', fmt(m.bandwidthPct)]],
    results: (m) => [['Rings', fmt(m.ringCount, 0)], ['Outer ring a–b', `${fmt(m.a)} – ${fmt(m.b)} mm`], ['Inter-ring gap', fmt(m.gap) + ' mm', 1], ['Innermost radius', fmt(m.innermostRadius) + ' mm'], ['Feed width', fmt(m.feedWidth) + ' mm'], ['Board', `${fmt(m.boardX)} × ${fmt(m.boardY)} mm`], ['Q factor', fmt(m.Qt, 1)]],
  },
  cp: {
    readout: (m) => [['a', fmt(m.a)]],
    kpis: (m) => [['Radius a · mm', fmt(m.a)], ['AR BW · %', fmt(m.arBandwidthPct)], ['Q factor', fmt(m.Qt, 1)]],
    results: (m) => [['Truncation Δb', fmt(m.truncationDepth, 3) + ' mm', 1], ['Slot Ls', fmt(m.slotLength) + ' mm'], ['Feed ρ₀', fmt(m.feedRho0) + ' mm'], ['Split f₁', fmt(m.f1, 4) + ' GHz'], ['Split f₂', fmt(m.f2, 4) + ' GHz']],
  },
  uwb: {
    readout: (m) => [['r', fmt(m.discRadius)], ['req', fmt(m.reqRadius)]],
    kpis: (m) => [['Disc r · mm', fmt(m.discRadius)], ['Equiv. r · mm', fmt(m.reqRadius)], ['f_L · GHz', fmt(m.fLcheck, 3)]],
    results: (m) => [['Ground width', fmt(m.groundW) + ' mm'], ['Ground length', fmt(m.groundL) + ' mm']],
  },
};

const labelFor = (key) => (TYPES.find((t) => t.key === key) || {}).label || key;

// ---- state -----------------------------------------------------------------
const state = {
  type: 'rect',
  values: Object.fromEntries(Object.entries(FIELDS).map(([k, f]) => [k, f.select ? (f.def ?? f.select[0]) : f.def])),
  pinned: [],
  lastResult: null,
};
let viewer = null;

// ---- builders --------------------------------------------------------------
function renderPicker() {
  const wrap = $('picker');
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', 'Antenna topology');
  wrap.replaceChildren();
  for (const t of TYPES) {
    const on = t.key === state.type;
    const card = el('button', 'gcard' + (on ? ' on' : ''));   // real button → keyboard operable
    card.type = 'button';
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', String(on));
    card.innerHTML = `<div class="gglyph">${glyphHTML(t.key)}</div><span class="gname">${t.label}</span>`;
    card.addEventListener('click', () => setType(t.key));
    wrap.appendChild(card);
  }
}

function renderParams() {
  const host = $('params');
  host.replaceChildren();
  const ids = TYPE_FIELDS[state.type];
  let curGroup = null;
  let group = null;
  const flush = () => { if (group) host.appendChild(group); };
  for (const id of ids) {
    const f = FIELDS[id];
    if (f.group !== curGroup) {
      flush();
      group = el('div', 'fgroup');
      group.appendChild(el('div', 'fglabel', f.group));
      curGroup = f.group;
    }
    group.appendChild(fieldEl(id, f));
  }
  flush();
}

// Build a styled <select> field with the shared chevron; onChange gets the value.
function selectEl(id, label, options, current, onChange) {
  const wrap = el('div', 'em-select');
  wrap.innerHTML = `<label for="f_${id}">${label}</label><div class="wrap"><select id="f_${id}" aria-label="${label}">${options.map((o) => `<option ${String(o) === String(current) ? 'selected' : ''}>${o}</option>`).join('')}</select>${CHEV}</div>`;
  wrap.querySelector('select').addEventListener('change', (e) => onChange(e.target.value));
  return wrap;
}

// Apply a substrate preset: material presets overwrite εr/tanδ and snap the
// thickness into the preset's standard set; 'Custom' just changes the options.
function applyPreset(name) {
  state.values.substratePreset = name;
  const p = SUBSTRATE_PRESETS[name];
  if (p && p.er != null) {
    state.values.substrateEr = p.er;
    state.values.lossTangent = p.tanD;
    if (!p.thicknesses.includes(Number(state.values.substrateHeightMm))) state.values.substrateHeightMm = p.def;
  }
  renderParams();   // refresh εr / tanδ / thickness inputs to the preset values
  render();
}

function fieldEl(id, f) {
  const v = state.values[id];
  if (f.preset) return selectEl(id, f.label, Object.keys(SUBSTRATE_PRESETS), v, applyPreset);
  if (f.thickness) {
    const preset = SUBSTRATE_PRESETS[state.values.substratePreset] || SUBSTRATE_PRESETS.Custom;
    const opts = preset.thicknesses.slice();
    if (!opts.includes(Number(v))) opts.unshift(Number(v));   // keep an off-list value visible
    return selectEl(id, `${f.label}${f.unit ? ` (${f.unit})` : ''}`, opts, Number(v), (val) => { state.values[id] = Number(val); render(); });
  }
  if (f.select) return selectEl(id, f.label, f.select, v, (val) => { state.values[id] = val; render(); });
  const wrap = el('div', 'em-field' + (f.unit ? ' unit' : ''));
  const sym = f.sym ? `<span class="sym">${f.sym}</span>` : '';
  const unit = f.unit ? `<span class="u">${f.unit}</span>` : '';
  const aria = `${f.label}${f.unit ? ` (${f.unit})` : ''}`;
  wrap.innerHTML = `<div class="lab"><span>${f.label}</span>${sym}</div><div class="wrap"><input id="f_${id}" aria-label="${aria}" inputmode="decimal" value="${v}">${unit}</div>`;
  wrap.querySelector('input').addEventListener('input', (e) => { state.values[id] = e.target.value; render(); });
  return wrap;
}

function designFromState() {
  const d = { type: state.type };
  for (const [k, f] of Object.entries(FIELDS)) d[k] = f.select ? state.values[k] : Number(state.values[k]);
  return d;
}

// ---- main render -----------------------------------------------------------
function render() {
  const design = designFromState();
  const result = synthesize(state.type, design);
  state.lastResult = { design, result };
  const m = result.metrics || {};
  const cfg = VIEW[state.type];

  // KPIs
  const kpis = $('kpis');
  kpis.replaceChildren();
  cfg.kpis(m).forEach(([label, val], i) => {
    kpis.appendChild(el('div', 'kpi' + (i === 0 ? ' lead' : ''), `<div class="kv">${val}</div><div class="kl">${label}</div>`));
  });

  // results metric list
  const results = $('results');
  results.replaceChildren();
  cfg.results(m).forEach(([label, val, accent]) => {
    results.appendChild(el('div', 'em-metric', `<span class="ml">${label}</span><span class="mv${accent ? ' accent' : ''}">${val}</span>`));
  });

  // warnings
  const warn = $('warnings');
  warn.replaceChildren();
  for (const w of result.warnings || []) {
    const e = el('div', 'em-warning');
    e.innerHTML = `<span class="ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span><span></span>`;
    e.querySelector('span:last-child').textContent = String(w);
    warn.appendChild(e);
  }

  // substrate badge
  const er = Number(state.values.substrateEr);
  const hasSub = TYPE_FIELDS[state.type].includes('substrateEr');
  $('subBadge').textContent = !hasSub ? (state.type === 'uwb' ? 'UWB' : 'air')
    : (Math.abs(er - 4.4) < 0.05 ? 'FR-4' : `εr ${fmt(er, 2)}`);

  // viewer badge + readout
  $('vBadge').textContent = labelFor(state.type);
  const ro = $('vReadout');
  ro.replaceChildren();
  cfg.readout(m).forEach(([name, val]) => ro.appendChild(el('span', null, `${name} <b>${val}</b>`)));
  ro.appendChild(el('span', null, 'mm'));

  // export
  $('vba').textContent = buildVba(result, design);

  if (viewer) viewer.update(result.geometry);
}

function setType(t) {
  state.type = t;
  renderPicker();
  renderParams();
  render();
}

function resetDefaults() {
  for (const [k, f] of Object.entries(FIELDS)) state.values[k] = f.select ? f.select[0] : f.def;
  renderParams();
  render();
}

// ---- export ----------------------------------------------------------------
function currentVba() { return $('vba').textContent || ''; }
function doCopy() { navigator.clipboard?.writeText(currentVba()); }
function doDownload() {
  const d = designFromState();
  const raw = state.type === 'uwb' ? d.lowerCutoffGHz : d.frequencyGHz;
  const freq = Number.isFinite(raw) ? raw : 0;   // never let junk input put "NaN" in the filename
  const blob = new Blob([currentVba()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a'); a.href = url; a.download = `${state.type}-${freq}GHz-cst.bas`; a.click();
  URL.revokeObjectURL(url);
}

// ---- pin / compare ---------------------------------------------------------
function pinCurrent() {
  const { design, result } = state.lastResult || {};
  if (!result) return;
  const freq = state.type === 'uwb' ? design.lowerCutoffGHz : design.frequencyGHz;
  state.pinned.push({
    type: state.type, label: labelFor(state.type),
    values: { ...state.values }, metrics: result.metrics || {}, freq,
  });
  if (state.pinned.length > 6) state.pinned.shift();
  renderChips();
}

function renderChips() {
  const chips = $('chips');
  // remove existing chips but keep the add button
  [...chips.querySelectorAll('.chip')].forEach((c) => c.remove());
  const addBtn = $('pinBtn');
  state.pinned.forEach((p, i) => {
    const chip = el('button', 'chip');   // real button → keyboard operable
    chip.type = 'button';
    const sub = TYPE_FIELDS[p.type].includes('substrateEr')
      ? (Math.abs(Number(p.values.substrateEr) - 4.4) < 0.05 ? 'FR-4' : `εr ${fmt(p.values.substrateEr, 2)}`)
      : (p.type === 'uwb' ? 'UWB' : 'air');
    chip.innerHTML = `<span class="cglyph">${glyphHTML(p.type)}</span><span class="cmeta"><span class="cname">${p.label}</span><span class="cfreq">${fmt(p.freq, 2)} GHz · ${sub}</span></span>`;
    chip.setAttribute('aria-label', `Load ${p.label}, ${fmt(p.freq, 2)} GHz`);
    chip.addEventListener('click', () => loadPinned(i));
    chips.insertBefore(chip, addBtn);
  });
}

function loadPinned(i) {
  const p = state.pinned[i];
  if (!p) return;
  state.type = p.type;
  state.values = { ...state.values, ...p.values };
  renderPicker();
  renderParams();
  render();
  setView('design');
}

const COMPARE_ROWS = [
  ['Substrate / εr', (p) => TYPE_FIELDS[p.type].includes('substrateEr')
    ? `${Math.abs(Number(p.values.substrateEr) - 4.4) < 0.05 ? 'FR-4' : 'εr'} · ${fmt(p.values.substrateEr, 2)}`
    : (p.type === 'uwb' ? '—' : 'air · 1.0')],
  ['Main size', (p) => mainSize(p)],
  ['Bandwidth', (p) => (Number.isFinite(Number(p.metrics.bandwidthPct)) ? fmt(p.metrics.bandwidthPct) + ' %' : '—')],
  ['Q factor', (p) => (Number.isFinite(Number(p.metrics.Qt)) ? fmt(p.metrics.Qt, 1) : '—')],
  ['Edge R / Zin', (p) => edgeOrZ(p)],
  ['AR bandwidth', (p) => (Number.isFinite(Number(p.metrics.arBandwidthPct)) ? fmt(p.metrics.arBandwidthPct) + ' %' : '—')],
  ['Polarization', (p) => (p.type === 'cp' ? (p.values.polarization || 'RHCP') : 'linear')],
];
function mainSize(p) {
  const m = p.metrics;
  switch (p.type) {
    case 'rect': return `${fmt(m.L)} × ${fmt(m.W)} mm`;
    case 'disk': case 'cp': return `a ${fmt(m.a)} mm`;
    case 'annular': return `a ${fmt(m.a)} · b ${fmt(m.b)} mm`;
    case 'dipole': return `arm ${fmt(m.armMm)} mm`;
    case 'monopole': return `h ${fmt(m.heightMm)} mm`;
    case 'uwb': return `r ${fmt(m.discRadius)} mm`;
    default: return '—';
  }
}
function edgeOrZ(p) {
  const m = p.metrics;
  if (p.type === 'rect') return fmt(m.Rin0, 1) + ' Ω';
  if (p.type === 'disk') return fmt(m.Redge, 1) + ' Ω';
  if (p.type === 'dipole' || p.type === 'monopole') return zstr(m);
  return '—';
}

function renderCompare() {
  const t = $('cmptable');
  t.replaceChildren();
  const pins = state.pinned;
  t.style.gridTemplateColumns = `210px repeat(${Math.max(pins.length, 1)}, 1fr)`;
  // header row
  t.appendChild(el('div', 'ch', `<span class="phint" style="color:var(--text-faint)">${pins.length} pinned</span>`));
  if (!pins.length) {
    t.appendChild(el('div', 'ch', '<span class="ch-name" style="font-weight:500;color:var(--text-muted)">Pin designs from the dock to compare them here.</span>'));
    return;
  }
  pins.forEach((p) => {
    t.appendChild(el('div', 'ch', `<div class="ch-glyph">${glyphHTML(p.type)}</div><span class="ch-name">${p.label}</span><span class="em-badge accent">${fmt(p.freq, 2)} GHz</span>`));
  });
  // metric rows
  for (const [label, fn] of COMPARE_ROWS) {
    t.appendChild(el('div', 'crow-l', label));
    pins.forEach((p) => {
      const val = fn(p);
      const cell = el('div', 'crow-v', val);
      cell.setAttribute('aria-label', `${p.label} — ${label}: ${val}`);  // self-describing for AT
      t.appendChild(cell);
    });
  }
}

// ---- view toggle -----------------------------------------------------------
function setView(view) {
  const compare = view === 'compare';
  $('shell').classList.toggle('view-compare', compare);
  $('navDesign').setAttribute('aria-selected', String(!compare));
  $('navCompare').setAttribute('aria-selected', String(compare));
  if (compare) renderCompare();
}

// ---- wiring ----------------------------------------------------------------
renderPicker();
renderParams();
render();
renderChips();

$('resetBtn').addEventListener('click', resetDefaults);
$('copyTop').addEventListener('click', doCopy);
$('copyExport').addEventListener('click', doCopy);
$('downloadTop').addEventListener('click', doDownload);
$('downloadExport').addEventListener('click', doDownload);
$('pinBtn').addEventListener('click', pinCurrent);
$('navDesign').addEventListener('click', () => setView('design'));
$('backToDesign').addEventListener('click', () => setView('design'));
$('navCompare').addEventListener('click', () => setView('compare'));
$('compareAll').addEventListener('click', () => setView('compare'));

// Bring up the 3D viewer if the environment supports it (browser + WebGL).
import('./viewer.js')
  .then((mod) => { viewer = mod.createViewer($('viewer')); if (viewer) render(); })
  .catch(() => { /* viewer unavailable (headless / no WebGL) — app still works */ });
