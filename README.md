# CRS Net — IT Consultant Website

Modern, minimalist, blue-themed static website for **crs-net.web.id**, served by
nginx inside Docker.

## Brand
- Logo: `assets/img/CRS_logo.png` (blue, #0060C0 / #4080C0)
- Contact: crs.network@outlook.com · +62 821 1207 7181 (WhatsApp)
- Owner: Tio Septiono · linkedin.com/in/septiono · credly.com/users/septiono

## Build & run

```bash
# Build the image
docker build -t crs-net-web .

# Run (publish on host port 8080 -> container 80)
docker run -d --name crs-net -p 8080:80 crs-net-web

# Open
xdg-open http://localhost:8080
```

## Publish to crs-net.web.id
Point your domain's A/AAAA record at the host, then expose port 80/443
(reverse proxy with TLS, e.g. Caddy/Traefik, or add certbot). The container
serves plain HTTP on :80; put TLS in front of it.

## Files
- `index.html` — markup
- `assets/css/styles.css` — styling
- `assets/js/script.js` — nav toggle, scroll reveal, contact form
- `nginx.conf` — server config (gzip, caching, security headers)
- `Dockerfile` — nginx:alpine image
