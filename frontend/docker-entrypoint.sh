#!/bin/sh
# The web container writes its runtime configuration from the environment before nginx starts.
# docker-compose.yml reads frontend.env into the container, so editing frontend.env and running
# `docker compose up -d` is enough: no image rebuild, no baked-in values.
set -e

echo "laluan-web: writing /config.js from the container environment"
cat > /usr/share/nginx/html/config.js <<EOF
window.__LALUAN__ = { apiUrl: "${VITE_API_URL}", supabaseUrl: "${VITE_SUPABASE_URL}", supabaseAnonKey: "${VITE_SUPABASE_ANON_KEY}" };
EOF

# Never exit without a server: with no arguments (or a failed exec) start nginx ourselves.
if [ "$#" -eq 0 ]; then
  exec nginx -g "daemon off;"
fi
exec "$@"
