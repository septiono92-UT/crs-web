# New CRS Network Website — Content Outline & Sitemap

Primary host: **https://web.crs-net.web.id** (live, auto-HTTPS; apex + www of both zones 301 here).
Single-page build in `index.html` (current proven pattern), `id.html` Indonesian mirror kept in sync.
Branch: `new-site`. All existing SEO tier-1 assets (JSON-LD, GA4 slot, OG, sitemap, CSP) carried over and pointed at the new host.

---

## Page sections (single page, top to bottom)

### 1. Hero — **3D animation (required)**
- Three.js scene: connected network nodes / wireframe globe in brand blue — visualizes "IT network infrastructure".
- Self-hosted ES module; brand palette (cobalt/electric blue from the 2026-09-02 refresh).
- **Mobile fallback mandatory:** reduced particle count on small screens, static gradient + logo fallback if WebGL unavailable, `prefers-reduced-motion` → static render, pause on `visibilitychange`.
- Headline: IT Consultant & IT Contractor value proposition. CTA buttons: WhatsApp (+62 821 1207 7181) + Contact.

### 2. About
- CRS Net / PT Cipta Raksa Sadaya; 13+ years experience statement.
- Founder: Tio Septiono. Credentials strip with Credly certification badges.

### 3. Services — six categories (from the crawled IT reports)
1. IT Consulting & Planning
2. Network Infrastructure & Mikrotik
3. IT Contracting & Field Support
4. Cloud & Virtualization
5. Security & Backup
6. Managed Services & Maintenance
*(final wording follows the existing services section — 6 items preserved)*

### 4. How We Work (Approach)
- 4-step process band, kept from the current site, restyled to the new design system.

### 5. Meet Our Team (placed after How We Work)
- Septiono — Business Development (photo ./Septiono.jpg)
- Yulianto — DevOps (no photo; monogram card)
- Mentari — Finance & Administration (photo ./Mentari.jpg)
- Each: short bio below the photo; **LinkedIn + Credly buttons with inline SVG icons** (existing pattern).

### 6. Contact
- Email crs.network@outlook.com · WhatsApp +62 821 1207 7181 (click-to-chat)
- Formspree form + pre-filled mailto fallback (existing handler)
- LinkedIn company: linkedin.com/company/cipta-raksa-sadaya

### Footer
- © 2019 Cipta Raksa Sadaya (existing requirement). Dark/light toggle (existing feature) kept working.

---

## Sitemap / URLs (canonical host = web.crs-net.web.id)

| URL | Status |
|---|---|
| `https://web.crs-net.web.id/` (EN) | primary |
| `https://web.crs-net.web.id/id.html` (ID) | Indonesian mirror |
| `https://web.crs-net.web.id/sitemap.xml` | updated to new host |
| `septiono.my.id` / `www.` / `crs-net.web.id` / `www.` | 301 → web host (live) |

## SEO deltas on cutover
- canonical + OG:url + JSON-LD `url`/`sameAs` → `https://web.crs-net.web.id`
- GSC: submit `https://web.crs-net.web.id/sitemap.xml`; DNS TXT verification already in the zone
- GA4: cross-host consistency (single property), placeholder swap when real ID arrives

## Assets inventory (existing, reused)
`/assets/css/styles.css` (design system base), `/assets/js/` (theme toggle, form handler), `/assets/img/` (logo, photos), `/assets/reports/` (62 field reports — future case studies), fonts: Inter + Sora (Google Fonts, CSP-allowed).
