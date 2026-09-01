#!/bin/sh
# Entrypoint: start the self-hosted visitor counter (background) then nginx (foreground).
set -e
mkdir -p /var/lib/crsnet
python3 /usr/local/bin/counter.py &
exec nginx -g 'daemon off;'
