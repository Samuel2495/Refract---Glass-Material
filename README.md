<<<<<<< HEAD
# Refract – Glass Material (Framer plugin, MVP v0.1)

## Run
```bash
npm install
npm run dev        # then in Framer: Plugins → Development → Open Development Plugin
npm run typecheck
npm run pack       # produces plugin.zip for submission
```

## In this MVP
- Apply screen: 4 presets (Frosted, Clear, Tinted, Satin), single-element apply
- Adjust screen: blur, refraction, chromatic dispersion, thickness (Low/Med/High)
- Live preview: WebGL shader preview (`src/webgl.ts`) with CSS backdrop-filter fallback
- Mobile/Performance mode toggle + automatic WebGL-support fallback
- Locally saved custom presets (stored in the Framer file via plugin data), Reset
- Static (non-animated) glass

## Deferred
Batch apply (v1.1) · Local background removal (v1.2+) · True before/after slider

## IMPORTANT: known limits to validate first
1. **Output component is CSS/SVG based, not WebGL.** A WebGL shader can't read what's
   behind a DOM element in the browser. The plugin preview uses WebGL; the component it
   inserts (`src/RefractGlass.tsx.txt`) uses `backdrop-filter` blur + SVG displacement
   refraction (Chromium only) + edge colour fringing for dispersion (all browsers).
   Safari/Firefox get blur + fringing; refraction there needs a different technique
   (e.g. snapshotting the backdrop into a WebGL texture). Prototype this first.
2. `framerApi.ts` inserts the glass as a child component of the selected node. Verify
   the Framer API calls (`createCodeFile`, `addComponentInstance`, `controls`) against
   the framer-plugin version you install; method names shift between versions.
3. Test chromatic dispersion cost on low-end mobile.
=======
# Refract---Glass-Material
>>>>>>> 51dee3903775e23885205f25622d165c9637251d
