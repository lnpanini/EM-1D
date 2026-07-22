// Generate a CST Studio Suite VBA macro for a serpentine design, headless.
//
//   node cst/generate-macro.mjs [out.vba]
//
// Edit the `design` object below, run it, then open the .vba in CST
// (VBA Macros -> Open VBA Macro Editor -> paste, or File > Open) and press F5.
// The macro is parametric: once in CST, tune serp_R / z_amp / body params live.
import { synthesize, buildVba } from '../src/physics.js';
import { writeFileSync } from 'node:fs';

// --- the design to export (defaults = the stretchable BLE loop, PDMS + EGaIn) ---
const design = {
  type: 'serp',
  frequencyGHz: 2.44,
  substrateEr: 2.68,          // PDMS (bulk); real thin-slab eeff is lower — tune serp_R in CST
  substrateHeightMm: 1.5,
  lossTangent: 0.02,
  ampRatio: 0.20,
  serpRatio: 0.05,
  undulations: 12,
  traceWidthMm: 0.8,
  conductorThicknessMm: 0.018,
  portImpedance: 50,
  conductorForm: 'Embedded channel',   // 'Etched trace' for the rigid-copper variant
  channelDiaMm: 0.5,
  zCycles: 48,
  maxStrainPct: 20,                     // 0 = flat (cheap mesh); >0 solves the z-wave
  groundPlane: 'None',                  // ignored for an embedded channel (a loop needs no ground)
};

const out = process.argv[2] || 'serp-antenna.vba';
const r = synthesize('serp', design);
if (!r.geometry.length) {
  console.error('empty geometry — check the design inputs:', r.warnings.join('; '));
  process.exit(1);
}
writeFileSync(out, buildVba(r, design));
const m = r.metrics;
console.log(`wrote ${out}`);
console.log(`  feed=${m.feedType}  R=${m.R?.toFixed(3)} mm  footprint=${m.footprintD?.toFixed(2)} mm`
  + (m.embedded ? `  z_amp=${m.zAmp?.toFixed(3)} mm  eff~${(m.efficiency * 100).toFixed(1)}%` : ''));
for (const w of r.warnings) console.log(`  WARNING: ${w}`);
