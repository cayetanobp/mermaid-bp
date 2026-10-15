#!/bin/sh
set -eu
ancestors="'self'"
if [ -n "${EMBED_ORIGIN:-}" ]; then
    if ! printf '%s\n' "$EMBED_ORIGIN" | grep -Eq '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?$'; then
        printf '%s\n' 'EMBED_ORIGIN debe ser un origen HTTPS, sin ruta ni parámetros.' >&2
        exit 1
    fi
    ancestors="$ancestors $EMBED_ORIGIN"
fi
sed "s|__FRAME_ANCESTORS__|$ancestors|g" /etc/nginx/conf.d/default.conf > /tmp/mermaid-site.conf
exec nginx -g 'daemon off;'
