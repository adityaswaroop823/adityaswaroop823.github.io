# Aditya Swaroop — Portfolio

New-era-classic single-page portfolio with a Three.js distorted-icosahedron centerpiece.

## Stack
- Vanilla HTML/CSS/JS (no build step)
- Three.js r160 (loaded via importmap from unpkg)
- Custom GLSL vertex/fragment shaders (simplex noise displacement + fresnel iridescence)
- Google Fonts: Instrument Serif, Inter, JetBrains Mono

## Run locally
ES modules need a real server (file:// won't work for importmap). Pick one:

```bash
# Python
python3 -m http.server 8000

# Node (if you have it)
npx serve .
```

Then open http://localhost:8000

## Files
- `index.html` — markup, sections, content
- `styles.css` — design system, type, layout
- `main.js` — Three.js scene, shaders, scroll/mouse interactions
- `Aditya-Swaroop-Resume.pdf` — linked from nav CTA

## Deploy
Drop the folder on Vercel / Netlify / Cloudflare Pages. No build needed.
