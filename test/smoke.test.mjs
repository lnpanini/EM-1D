// Headless DOM-stub smoke test: imports src/main.js (which wires the DOM at load),
// then drives all 7 antenna types through the real render() path and asserts each
// produces a valid CST macro with no NaN/Infinity/undefined.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function makeEl(id) {
  const listeners = {};
  return {
    id, value: '', _text: '', _html: '', hidden: false, dataset: {},
    set textContent(v) { this._text = v; }, get textContent() { return this._text; },
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    addEventListener(ev, cb) { (listeners[ev] ||= []).push(cb); },
    dispatch(ev) { (listeners[ev] || []).forEach((cb) => cb({})); },
    replaceChildren() {}, appendChild() {}, querySelectorAll() { return []; },
  };
}

test('main.js loads and renders all 7 types without throwing', async () => {
  const els = new Map();
  const get = (id) => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); };
  global.document = {
    getElementById: get,
    querySelectorAll: () => [],                       // no [data-types] => applyVisibility no-op
    createElement: () => ({ click() {}, set href(v) {}, set download(v) {}, style: {} }),
  };
  // navigator is a read-only global in modern Node and is only used by the copy
  // handler (not fired here), so it is intentionally left unstubbed.
  global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
  global.Blob = class {};

  const base = {
    frequencyGHz: '2.4', lowerCutoffGHz: '3.1', substrateEr: '4.4', substrateHeightMm: '1.6',
    lossTangent: '0.02', conductorThicknessMm: '0.035', wireRadiusMm: '0.75',
    groundLengthMm: '90', groundWidthMm: '90', feedGapMm: '1', portImpedance: '50',
    ringRatio: '2', polarization: 'RHCP',
  };
  for (const [k, v] of Object.entries(base)) get(k).value = v;
  get('type').value = 'rect';

  await import('../src/main.js');               // runs buildTypeSelect + applyVisibility + render

  assert.match(get('vba').value, /Sub Main[\s\S]*End Sub/, 'initial render produced a macro');

  const typeEl = get('type');
  for (const t of ['rect', 'dipole', 'monopole', 'disk', 'annular', 'cp', 'uwb']) {
    typeEl.value = t;
    typeEl.dispatch('change');
    const vba = get('vba').value;
    assert.match(vba, /Sub Main[\s\S]*End Sub/, `${t}: valid macro`);
    assert.doesNotMatch(vba, /NaN|Infinity|undefined/, `${t}: no garbage`);
  }
});
