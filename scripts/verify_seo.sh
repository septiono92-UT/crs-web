#!/usr/bin/env bash
# verify_seo.sh <public-domain> <origin-url>
# Curls BOTH a static site's public (Cloudflare) URL and its origin (e.g. http://localhost:8080),
# then checks for: JSON-LD, GA4 (gtag), GSC verification tag, and a widened CSP script-src.
# Also validates that any JSON-LD present is parseable JSON.
# Usage: bash verify_seo.sh https://crs-net.web.id http://localhost:8080
set -u
PUBLIC="${1:?usage: verify_seo.sh <public-domain> <origin-url>}"
ORIGIN="${2:?usage: verify_seo.sh <public-domain> <origin-url>}"

check() {
  local label="$1"; local url="$2"
  echo "===== $label ($url) ====="
  local html head
  html=$(curl -s "$url/")
  head=$(curl -sI "$url/")
  echo -n "  JSON-LD present:        "; echo "$html" | grep -q 'application/ld+json' && echo "YES" || echo "no"
  echo -n "  GA4 (gtag) present:     "; echo "$html" | grep -q 'gtag' && echo "YES" || echo "no"
  echo -n "  GSC verify tag present: "; echo "$html" | grep -q 'google-site-verification' && echo "YES" || echo "no"
  echo -n "  CSP script-src:         "; echo "$head" | grep -io 'script-src[^;]*' | head -1 || echo "(none)"
  echo -n "  JSON-LD valid JSON:     "
  echo "$html" | awk '/application\/ld\+json/{f=1;next} f&&/<\/script>/{f=0} f' | python3 -c 'import sys,json
try:
    json.load(sys.stdin); print("VALID")
except Exception as e:
    print("INVALID:", e)' 2>/dev/null || echo "(no JSON-LD or parse error)"
  echo
}

check "ORIGIN" "$ORIGIN"
check "PUBLIC" "$PUBLIC"
echo "Done. If PUBLIC shows stale/no tags but ORIGIN is correct, wait a moment for the Cloudflare edge cache to refresh."
