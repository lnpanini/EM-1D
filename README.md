# EM-1D

EM-1D is a browser-based antenna **synthesis** tool: you enter the design requirements
(frequency, substrate, target impedance, …) and it computes the geometry, renders it in a live
3D view, and exports a CST Studio Suite VBA macro. Zero runtime dependencies; deploys as a static
Vercel site.

## Features

- **7 antenna types**, each synthesized from requirements → geometry:
  - Rectangular microstrip patch · center-fed dipole · quarter-wave monopole
  - Circular disk patch · annular ring patch · circularly-polarized (CP) circular patch · UWB planar disc monopole
- **Accurate closed-form physics** (not just first-order rules): Hammerstad-Jensen + Kirschning-Jansen
  dispersion and numerically-integrated Balanis radiation conductance for patches; induced-EMF
  impedance with resonance root-finding for wires; cavity-model Bessel/Neumann synthesis for the
  circular family. Every formula is cross-checked against Balanis/Garg/Abramowitz-Stegun reference
  values in the test suite.
- **Live 3D viewer** (Three.js): rotate / zoom / pan a color-coded model that rebuilds on every
  parameter change.
- **Type-specific CST VBA** export with live preview, copy-to-clipboard, and one-click `.vba` download.
- A dynamic UI that shows only the inputs and metrics relevant to the selected antenna.

## Testing

```bash
npm test            # node --test: physics reference values, robustness, scene mapping, DOM smoke
```

The physics engine (`src/physics.js`) and 3D scene mapping (`src/scene.js`) are pure and
DOM-free, so the full suite runs headlessly in Node.

## Development

```bash
npm run dev
```

Open <http://localhost:5173> to view the local site.

## Build

```bash
npm run build
```

The build produces a static `dist/` directory configured for Vercel through `vercel.json`.

## Deploy to Vercel

### Option 1: Deploy from the Vercel dashboard

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. In Vercel, choose **Add New... > Project** and import the repository.
3. Keep the detected settings from `vercel.json`:
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Click **Deploy**.
5. After the deployment completes, open the generated Vercel URL to view the antenna generator.

### Option 2: Deploy from the terminal

If you already have the Vercel CLI installed and are logged in:

```bash
vercel --prod
```

If the CLI asks for project settings, use:

- Build Command: `npm run build`
- Output Directory: `dist`
- Development Command: `npm run dev`

## Notes

The generated dimensions are starting points for simulation sweeps. Validate and tune in CST with the intended materials, ports, boundary conditions, solver setup, mesh, and manufacturing constraints before fabrication.
