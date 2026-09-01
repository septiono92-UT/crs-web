# CRS Net — static IT consultant site
# Multi-stage not needed; nginx:alpine is tiny and perfect for static files.
FROM nginx:1.27-alpine

# Install python3 for the self-hosted visitor counter (tiny, alpine-native)
RUN apk add --no-cache python3

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our config and site files
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html            /usr/share/nginx/html/index.html
COPY id.html               /usr/share/nginx/html/id.html
COPY sitemap.xml           /usr/share/nginx/html/sitemap.xml
COPY assets/               /usr/share/nginx/html/assets/
COPY counter.py            /usr/local/bin/counter.py
COPY start.sh              /start.sh
RUN chmod +x /usr/local/bin/counter.py /start.sh

# Ensure nginx (unprivileged worker) can read every file regardless of
# source file modes (the logo was shipped 0600 on the host).
RUN chmod -R a+rX /usr/share/nginx/html && chown -R nginx:nginx /usr/share/nginx/html

# Healthcheck: nginx should answer on :80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

EXPOSE 80

# Start the visitor-counter service (background) + nginx (foreground)
CMD ["/start.sh"]
