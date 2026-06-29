// Headless smoke: import src/main.js under a forgiving DOM stub and assert the
// workbench load path (build picker/params + initial render + buildVba) runs
// without throwing and produces a CST macro. Full visual verification is done
// in a real browser; this guards the module wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function fakeEl() {
  const e = {
    className: '', _text: '', _html: '', value: '', dataset: {}, style: {},
    children: [],
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    set textContent(v) { this._text = v; }, get textContent() { return this._text; },
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    removeChild(c) { return c; },
    remove() {},
    replaceChildren() { this.children = []; },
    addEventListener() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    querySelector() { return fakeEl(); },   // forgiving: any lookup yields a usable node
    querySelectorAll() { return []; },
  };
  return e;
}

test('main.js builds the workbench and renders a macro without throwing', async () => {
  const byId = new Map();
  global.document = {
    getElementById: (id) => { if (!byId.has(id)) byId.set(id, fakeEl()); return byId.get(id); },
    createElement: () => fakeEl(),
    querySelectorAll: () => [],
  };
  global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
  global.Blob = class {};

  await import('../src/main.js');   // runs renderPicker + renderParams + render at load

  // initial render (rect) should have written a CST macro into #vba
  const vba = byId.get('vba')?.textContent || '';
  assert.match(vba, /Sub Main[\s\S]*End Sub/, 'initial render produced a macro');
  assert.doesNotMatch(vba, /NaN|Infinity|undefined/, 'no garbage in macro');
});
