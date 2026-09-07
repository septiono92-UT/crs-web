# OpenCode Go session prompts — paste into the TUI with the matching model

Run these in `/home/crstio/crs-net-web` on branch `new-site`. One GLM-5.3 window covers prompts 1+2; switch to GPT 5.6 Luna for prompt 3.

## Prompt 1 — Design system + hero (model: `opencode-go/glm-5.3`)

```
Read OUTLINE.md first. Build a new design system for the CRS Net company site in
assets/css/design-system.css: minimalist cobalt/electric-blue palette on white,
with a full dark theme (keep the existing dark-mode toggle contract), Sora for
headings, Inter for body, 8px spacing scale, card/button/badge components,
44px minimum touch targets. Then restructure index.html to the OUTLINE.md section
order (Hero, About, Services x6, How We Work, Team x3, Contact) using the new
classes. Keep ALL existing <head> SEO tags, the Formspree handler, and the
copyright exactly as they are. Do not touch id.html yet.
```

## Prompt 2 — 3D hero (model: `opencode-go/glm-5.3`)

```
Create assets/js/3d-hero/ as a self-hosted Three.js ES module (download three.module.js
into assets/js/3d-hero/vendor/ — no CDN, CSP is script-src 'self'). Scene: a slowly
rotating wireframe icosahedron globe with ~120 connected network nodes in the brand
blue, subtle opacity fog, transparent canvas behind the hero text. Constraints:
- Cap ~45fps, pause on document.visibilitychange, respect prefers-reduced-motion
  (render one static frame instead of animating)
- On viewports < 768px or no WebGL: render max 40 nodes, and if WebGL is entirely
  unavailable show the static gradient fallback in CSS
- No render loop work when the hero is scrolled out of view
- Wire in via <script type="module"> at the end of index.html hero section
```

## Prompt 3 — Bulk content + SEO cutover (model: `opencode-go/gpt-5.6-luna`)

```
On branch new-site: (1) point every canonical, OG:url and JSON-LD url field to
https://web.crs-net.web.id in index.html and id.html; update sitemap.xml to the
same host. (2) Fill the Services section's six cards with the copy from the
current live services section (preserve the 6 categories). (3) Apply the same
hero/design-system changes to id.html, keeping the Indonesian copy. (4) Team
section: keep the three profiles and the inline-SVG LinkedIn/Credly buttons
exactly as on the live site. Commit each step separately with clear messages.
```

**After the sessions:** `docker build -t crs-net-web . && docker rm -f crs-net && docker run -d --name crs-net -p 8080:80 --restart unless-stopped crs-net-web`, then verify origin + https://web.crs-net.web.id and run `scripts/verify_seo.sh web.crs-net.web.id http://localhost:8080`.
