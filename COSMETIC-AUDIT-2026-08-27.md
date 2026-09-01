# Cosmetic / Visual Audit — crs-net.web.id

**Audit date:** 2026-08-27
**Scope:** Visual / design / layout only. This complements the technical/SEO/perf audit in `AUDIT-2026-08-27.md` — it does *not* re-cover performance, security, or SEO (those graded **A** and are unchanged).
**Method:** Source review of `index.html` + `assets/css/styles.css`, cross-checked against the live render. Browser sandbox was unavailable, so findings are deduced from the CSS box model / painting order and confirmed against the shipped source.

---

## Visual Scorecard

| Area | Grade | Notes |
|------|-------|-------|
| Layout & spacing | **A−** | Clean grids, consistent rhythm; 2 anchor-offset bugs |
| Iconography | **B** | Emoji + SVG mix; one emoji may not render on all OSes |
| Color & brand | **A−** | Cohesive blue system; minor focus-state gap |
| Typography | **A** | Sora/Inter, `display=swap`, good scale |
| Responsive | **A** | Solid breakpoints, mobile nav works |
| Polish / detail | **B+** | Focus rings, social image, iOS icon missing |

---

## HIGH — real visual bugs (fixed in this pass)

### 1. Hero "dashboard card" — skeleton lines paint OVER the logo
In `.hero-card`, the decorative `.hero-card-lines` block is `position: absolute; inset: 22px;` and comes **after** the logo in the DOM. Per CSS painting order, a positioned element with `z-index:auto` paints on top of a static sibling — so the faint blue skeleton bars sit *on top of* the CRS logo instead of behind it, cluttering the mark.
**Fix:** give `.hero-card-logo { position: relative; z-index: 1; }` so the logo stays above the mock lines. ✅ applied.

### 2. Sticky header hides section headings on anchor jump
The header is `position: sticky; top: 0` (70px tall). Clicking nav links (`#services`, `#about`, `#contact`, …) scrolls the target to `top: 0`, so the **first ~70px of every section is tucked under the header** — headings and the eyebrow labels get cut off.
**Fix:** add `scroll-margin-top: 90px;` to `.section`. ✅ applied.

---

## MEDIUM — design consistency

### 3. Mixed icon systems (emoji vs inline SVG)
Services cards, the Experience grid, the contact list, and the audit callout all use **emoji** (🖧 ☁️ 🛡️ 🧩 📞 📈 🛠️), while the Team cards use crisp **inline SVG** (LinkedIn/Credly). Two problems:
- The look is inconsistent — flat colorful emoji next to minimalist blue line-SVGs clashes with the "modern minimalist" brief.
- **🖧 (U+1F5A7 "telephone receiver") is a relatively new codepoint** and can render as a missing-glyph "box" (▯) on older Windows/Android builds. It's used for *Network & Infrastructure* in two places — a visible risk.
**Recommendation:** replace the emoji with a single inline-SVG icon set (stroke style, `currentColor`) reused across services/experience/contact, matching the team SVGs. *(Not auto-applied — design choice; I can do it on request.)*

### 4. No visible keyboard focus ring on buttons / links
Only the form inputs have a focus style. Buttons (`.btn`), nav links, and the mobile toggle have **no `:focus-visible` outline**, so keyboard users (and yourself tabbing through) get no visible focus cue.
**Fix:** added a `:focus-visible` outline using `--blue-500`. ✅ applied.

### 5. Social share image is just the bare logo
`og:image` points at `/assets/img/CRS_logo.png` — a transparent logo mark with no text. When shared on LinkedIn/FB/WhatsApp it shows a floating logo on a blank/white tile, which reads as unfinished next to competitors' branded 1200×630 cover images.
**Recommendation:** design one 1200×630 social card (logo + "Independent IT Consulting" + blue gradient) and point `og:image` at it. *(Not auto-applied — needs an asset.)*

---

## LOW — polish opportunities

- **6. No `apple-touch-icon`** — iOS home-screen bookmarks fall back to a screenshot. Add a squared 180×180 PNG (the logo alone has transparency and looks poor masked).
- **7. Button vs card radius mismatch** — buttons are fully pill (`999px`), cards are `16px`. Harmonize (e.g. `14px` buttons) or keep pills deliberately; either is fine, just be consistent.
- **8. No `:active`/tap state** — buttons only react on `:hover`. A subtle `:active { transform: translateY(0) }` improves mobile tap feedback.
- **9. `text-wrap: balance`** on `h1`/`h2` gives cleaner ragged headings (supported in modern Chrome/Safari; graceful no-op elsewhere).
- **10. Footer credit "Built with Docker · Modern · Minimal"** reads like a dev note. Consider a cleaner line, e.g. "© 2019 Cipta Raksa Sadaya — Independent IT Consulting".

---

## Reinforce (already good)
- Cohesive blue token system (`--blue-*`); gradients used consistently.
- Responsive grids collapse 3→2→1 and 4→2→1 sensibly; mobile nav toggles.
- `prefers-reduced-motion` respected; `font-display: swap` avoids invisible text.
- All images have `alt`; `lang` set; lazy-loading on below-the-fold photos.

---

## Fixes applied in this pass (files changed)
- `assets/css/styles.css`
  - `.hero-card-logo { position: relative; z-index: 1; }` (bug #1)
  - `.section { scroll-margin-top: 90px; }` (bug #2)
  - `a:focus-visible, .btn:focus-visible, .nav-toggle:focus-visible { outline: … }` (item #4)

## Recommended, not auto-applied
- #3 unify emoji → SVG icon set
- #5 branded 1200×630 social image
- #6 `apple-touch-icon`
- #7–#10 minor polish

## Verify / deploy
```bash
cd /home/crstio/crs-net-web
docker build -t crs-net-web .
docker run -d --name crs-net -p 8080:80 crs-net-web
# open http://localhost:8080 — confirm logo sits above the card lines,
# and that clicking nav links leaves the heading clear of the header.
```
