# CST macros & tools

Companion VBA macros and a headless generator for the CST Studio Suite workflow.
See `docs/superpowers/specs/2026-07-22-stretchable-liquid-metal-ble-antenna.md` for
the full design/validation story these support.

## Files

| File | What it does |
|---|---|
| `generate-macro.mjs` | Node helper — writes a parametric antenna `.vba` from `physics.js`. Edit the `design` object, run `node cst/generate-macro.mjs [out.vba]`. |
| `add-tissue-phantom.vba` | Add-on macro: drops a skin/fat/muscle body phantom under a tuned antenna (does **not** rebuild the antenna). Run on the current model, then re-solve for on-body results. |
| `amc-unit-cell.vba` | Builds a parametric AMC unit cell (patch on grounded PDMS) for reflection-phase design. Run in a **new empty project**; Floquet-port + boundary steps are in the file's comments. |

## Regenerating the antenna macro

```bash
node cst/generate-macro.mjs my-antenna.vba
```

Then in CST: **VBA Macros → Open VBA Macro Editor**, paste the file contents, **F5**.
The macro is parametric — once imported, tune `serp_R`, `z_amp`, etc. live in the
Parameter List and re-solve. Works in CST 2024 and 2026 (the VBA API used is stable).

## Notes learned the hard way (see the spec for detail)

- The History List **is** the model — everything goes through `AddToHistory` or it
  can't be swept.
- `DiscretePort`: emit `SetP1`/`SetP2` only — never mix in legacy `UsePickedPoints`.
- Parameter names must not shadow VBA/Python builtins (`space` → `bg_space`).
- On thin PDMS, `eeff ≈ 1`, not `εr` — size the antenna empirically in CST, not
  from the closed-form.
