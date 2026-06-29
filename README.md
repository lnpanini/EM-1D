# EM-1D

EM-1D is a browser-based antenna design helper for generating CST Studio Suite VBA macros. It is designed to be deployed as a static Vercel site.

## Features

- Interactive tuning controls for microstrip patch, center-fed dipole, and quarter-wave monopole antennas.
- First-order geometry estimates for wavelength, patch dimensions, dipole arm length, monopole height, and patch feed inset.
- Live CST VBA preview with copy-to-clipboard support.
- One-click `.vba` download for importing or running in CST Studio Suite.

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
