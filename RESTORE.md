# CRS Net — Full Restore Runbook (fresh VPS + fresh Hermes)

Purpose: after reinstalling the VPS and/or Hermes Agent, rebuild the entire
website stack from this repository. Written for a future Hermes session (or a
human) with zero prior context.

Live site: https://crs.web.id (+ `/id.html` Indonesian mirror)
Repo: https://github.com/septiono92-UT/crs-web (public)

---

## Architecture (what must exist again)

```
Internet → Cloudflare edge (HTTPS, Universal SSL *.crs-net.web.id)
         → Cloudflare Tunnel (cloudflared on the VPS)
         → Docker container `crs-net` (nginx:1.27-alpine + python3 counter)
         → static site + /api/visits
```

Same tunnel also serves (recreate these too on a full VPS reinstall):
- `agent.septiono.my.id` → `http://100.127.160.123:9119` (Hermes dashboard, Tailscale IP)
- `fate.septiono.my.id` → `http://127.0.0.1:8000` (fate-app, separate project)

## What GitHub gives you (in this repo)

- All site code: index.html, id.html, assets/, nginx.conf, sitemap.xml, Dockerfile
- Design system + three.js 3D hero + How-We-Work 3D + team tilt cards (self-hosted vendor)
- `scripts/deploy.sh` — build & run container with durable counter volume
- `scripts/verify_seo.sh` — origin+public SEO probe
- `scripts/verify-3d.js` — CDP harness for the 3D scenes (needs node + chromium)
- `scripts/perf-probe.js` — CDP Core Web Vitals probe
- `counter.py` — privacy-friendly visitor counter (state now on a docker volume)

## What GitHub CANNOT give you (the owner must supply)

1. **Cloudflare account access** — dashboard login, or an API token (needs
   Zone.DNS Edit + Zone.Redirect Rules Edit for both zones). The Cloudflare MCP
   tools (`mcp__cloudflare__*`) already have write access to account
   `4a9a7748ee6fb41e5ecf598de2643278` when configured in Hermes.
2. **Tunnel credentials** — `cloudflared tunnel login` (browser) or copy the
   tunnel credentials JSON back onto the box. Tunnel ID:
   `79ac423d-0a04-4872-bcf7-57fedcc114fa`
3. **GitHub credentials** — a PAT with repo write (stored previously in
   `~/.git-credentials` on the old box).
4. **OpenCode Go API key** — `OPENCODE_GO_API_KEY` (was in Hermes `~/.hermes/.env`;
   on a fresh Hermes, re-add via `hermes auth` or paste into opencode's
   `~/.local/share/opencode/auth.json`). Only needed if regenerating code with
   the OpenCode CLI — not needed for restore itself.

## Restore steps (order matters)

### 1. VPS prerequisites
```bash
sudo apt-get update && sudo apt-get install -y docker.io git curl
# cloudflared (official repo):
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared
```

### 2. Clone + build + run
```bash
git clone https://github.com/septiono92-UT/crs-web.git /home/crstio/crs-net-web
cd /home/crstio/crs-net-web
bash scripts/deploy.sh        # builds, runs with durable counter volume, health-checks
curl -s http://127.0.0.1:8080/ | head -5   # expect HTML
```

### 3. Tunnel
```bash
# Preferred (keeps existing tunnel): copy the credentials file + config from
# backup. If none exists, re-create:
cloudflared tunnel login                       # browser auth
cloudflared tunnel create crsnet               # note new ID, replace below
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml <<'EOF'
tunnel: <TUNNEL-ID>
credentials-file: /home/crstio/.cloudflared/<TUNNEL-ID>.json
ingress:
  - hostname: agent.septiono.my.id
    service: http://100.127.160.123:9119
  - hostname: fate.septiono.my.id
    service: http://127.0.0.1:8000
  - hostname: crs-net.web.id
    service: http://127.0.0.1:8080
  - hostname: www.crs-net.web.id
    service: http://127.0.0.1:8080
  - hostname: web.crs-net.web.id
    service: http://127.0.0.1:8080
  - service: http_status:404
EOF
cloudflared tunnel route dns crsnet crs-net.web.id
cloudflared tunnel route dns crsnet www.crs-net.web.id
cloudflared tunnel route dns crsnet web.crs-net.web.id
cloudflared tunnel route dns crsnet septiono.my.id
cloudflared tunnel route dns crsnet www.septiono.my.id
cloudflared tunnel route dns crsnet agent.septiono.my.id
cloudflared tunnel route dns crsnet fate.septiono.my.id
# run as the systemd user service (unit: cloudflared-tunnel.service):
systemctl --user enable --now cloudflared-tunnel.service
```

### 4. Cloudflare DNS + redirects (if not recreated by tunnel routes)
A fresh Hermes with the Cloudflare MCP tools does this via API:
- CNAME (proxied) → `<TUNNEL-ID>.cfargotunnel.com` for:
  `crs-net.web.id`, `www.crs-net.web.id`, `web.crs-net.web.id` (zone
  `crs-net.web.id` = `692f18401c232d7a872d3fc1d2c17950`);
  `septiono.my.id`, `www.septiono.my.id` (zone `septiono.my.id` = `6024703eb3e49ff32ec7839d593673a2`)
- TXT records to recreate: `google-site-verification=fnfgQwp3qOSLvMxHhJsey1VFH91yrrxOX0dA8iurtSM`
  (crs-net.web.id), `openai-domain-verification=dv-QW7u5TraDLWR1zkLdLyHHZ19` (septiono.my.id)
- 301 redirect rulesets (phase `http_request_dynamic_redirect`, entrypoint PUT,
  `from_value.target_url.expression: concat("https://web.crs-net.web.id", http.request.uri.path)`,
  status 301, preserve_query_string):
  - zone septiono.my.id: hosts `septiono.my.id`, `www.septiono.my.id` → web.crs-net.web.id
  - zone crs-net.web.id: hosts `crs-net.web.id`, `www.crs-net.web.id` → web.crs-net.web.id
- HTTPS is automatic via Universal SSL (no cert purchase).
- Email Address Obfuscation (Scrape Shield) was ON — fine to leave default.

### 5. Verify
```bash
bash scripts/verify_seo.sh https://web.crs-net.web.id http://localhost:8080
# expect all YES + VALID on origin AND public
node scripts/verify-3d.js https://web.crs-net.web.id/ 9351 --fine   # optional, needs chromium+node
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" https://septiono.my.id/   # 301
curl -s -o /dev/null -w "%{http_code}\n" https://web.crs-net.web.id/                  # 200
```

### 6. Known placeholders to restore (owner inputs)
- GA4: replace `G-XXXXXXXXXX` (2× per HTML file, EN + ID) with real property ID
- GSC: real verification code (DNS TXT above may already satisfy verification) +
  submit `https://web.crs-net.web.id/sitemap.xml`
- Formspree: optional form ID in `assets/js/script.js` (`FORMSPREE_ENDPOINT`);
  mailto fallback works without it

## Statement of record (as of 2026-09-07)
- Canonical host: web.crs-net.web.id · old hosts 301 here · design: cobalt/electric-blue,
  dark default · 3D: hero globe + approach scene (2 WebGL contexts) + team tilt cards
- Lighthouse-equivalent (CDP probes): LCP ~0.6 s, CLS 0, ~348 KB total transfer
- Git history: main = live; new-site = build branch

---

## UPDATE 2026-09-09 — VPS rebuilt; new zone crs.web.id is now canonical
After the VPS reinstall, the site was restored from this repo onto a fresh box and
re-homed to a NEW Cloudflare zone: **crs.web.id** (apex is canonical; www 301s to apex
at the nginx layer). All canonical/hreflang/og/JSON-LD/title/footer/sitemap references
in index.html, id.html, sitemap.xml, nginx.conf now point to crs.web.id.

Current stack (verified end-to-end 2026-09-09):
- Container `crs-net` (crs-net-web:main) on 127.0.0.1:8080, counter volume `crsnet-counter`
- Tunnel **crsweb** id `d7dc47c8-e01c-4161-bb24-ddd82173cd48`, cert + credentials in
  `~/.cloudflared/`, ingress config `~/.cloudflared/config.yml` (crs.web.id + www → :8080)
- Runs as systemd **user** service `cloudflared-tunnel.service` (unit file in
  `~/.config/systemd/user/`), enabled at boot; cloudflared binary at `~/.local/bin/cloudflared`
- DNS: CNAMEs crs.web.id + www.crs.web.id → tunnel (created via `cloudflared tunnel route dns`)
- The old zones (crs-net.web.id, septiono.my.id) still exist in the Cloudflare account
  but have NO DNS records since the reinstall — recreate redirects there if wanted.

## UPDATE 2026-09-09 (later) — legacy zones now 301 to crs.web.id
All 5 legacy hostnames resolve through the same tunnel and redirect at the origin:
- DNS (proxied CNAME → `d7dc47c8-e01c-4161-bb24-ddd82173cd48.cfargotunnel.com`):
  crs-net.web.id, www.crs-net.web.id, web.crs-net.web.id (zone crs-net.web.id
  = `692f18401c232d7a872d3fc1d2c17950`); septiono.my.id, www.septiono.my.id
  (zone septiono.my.id = `6024703eb3e49ff32ec7839d593673a2`)
- Tunnel ingress (in `~/.cloudflared/config.yml`) lists all 5 legacy hostnames → :8080
- nginx `default_server` block 301s every legacy Host → https://crs.web.id (path+query kept)
- nginx gotcha learned the hard way: the main server block MUST carry an explicit
  `server_name crs.web.id` — a wildcard `_` plus `default_server` catch-all on the
  redirect block turns the canonical host into an infinite self-redirect loop.
- cloudflared login cert is per-zone scoped: three certs were used (crs.web.id,
  crs-net.web.id, septiono.my.id); backups in `~/.cloudflared/cert.pem.*-backup`.
  DNS record writes can also be done via the apiToken embedded in each cert.pem.
- Old Cloudflare Redirect Rules (→ web.crs-net.web.id) were DELETED from both legacy
  zones on 2026-09-09 (via dashboard). Legacy hosts now take a SINGLE 301 hop at the
  origin: <legacy-host> → https://crs.web.id (path + query preserved). Verified first-hop
  Location headers show crs.web.id directly for all 5 hostnames.

## To restore again on a fresh box: clone this repo, `bash scripts/deploy.sh`, install
cloudflared, `cloudflared tunnel login`, recreate the tunnel (or copy credentials back),
rewrite the tunnel ID in `~/.cloudflared/config.yml`, `cloudflared tunnel route dns crsweb crs.web.id`
(+ www), enable the systemd user unit.
