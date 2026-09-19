# CRS Net — IT Consultant Website

Modern, minimalist, blue-themed static website for **crs.web.id** (+ `/id.html`
Indonesian mirror), served by nginx inside Docker behind a Cloudflare Tunnel.

## Brand
- Logo: `assets/img/CRS_logo.png` (blue, #0060C0 / #4080C0)
- Contact: crs.network@outlook.com · +62 821 1207 7181 (WhatsApp)
- Owner: Tio Septiono · linkedin.com/in/septiono · credly.com/users/septiono

## Build & run

```bash
# Build + run with the durable visitor-counter volume (recommended)
bash scripts/deploy.sh

# Or manually:
docker build -t crs-net-web .
docker run -d --name crs-net -p 8080:80 -v crsnet-counter:/var/lib/crsnet crs-net-web
```

## Verify

```bash
bash scripts/verify_seo.sh https://crs.web.id http://localhost:8080   # SEO probes
node scripts/verify-3d.js https://crs.web.id/ 9351 --fine             # 3D scenes + tilt (CDP)
node scripts/verify-ui-effects.js https://crs.web.id/ 9360            # glass/counters/parallax/cursor
```

## Files
- `index.html` — EN markup · `id.html` — ID mirror (also loads legacy `styles.css`)
- `assets/css/design-system.css` — design tokens, components, UI-effects layer
  (glassmorphism, ambient glows, cursor FX, CTA band)
- `assets/css/styles.css` — legacy sheet (id.html only; overridden by design system)
- `assets/js/script.js` — theme toggle, nav, reveal, visitor counter, contact form
- `assets/js/ui-effects.js` — animated counters, light parallax, cursor FX
- `assets/js/3d-hero|3d-approach|3d-team/` — three.js scenes (self-hosted vendor)
- `counter.py` — self-hosted visitor counter (`/api/visits`)
- `nginx.conf` — server config (redirects, gzip, caching, security headers, CSP)
- `Dockerfile` — nginx:alpine image · `scripts/deploy.sh` — build + run
- `scripts/verify-*.js|sh` — CDP/SEO verification harnesses
- `RESTORE.md` — full rebuild runbook (fresh VPS + fresh Hermes)
