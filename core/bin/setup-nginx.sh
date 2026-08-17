#!/usr/bin/env bash
# Uso: setup-nginx.sh <domínio>
# Prepara diretório global de locations e imprime um bloco server sugerido para incluir no nginx.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

usage() {
  echo "Uso: $0 <domínio>" >&2
  exit 1
}

[[ $# -ge 1 ]] || usage

DOMAIN="$1"

LOC_REL="${PREVIA_LOCATIONS_DIR}"
mkdir -p "$LOC_REL"

SNIPPET_PATH="${LOC_REL}/nginx-server-snippet.conf"
cat >"$SNIPPET_PATH" <<EOF
# Gerado pelo previa core — inclua este server {} em sites-available ou importe o arquivo.
server {
    server_name ${DOMAIN};

    include ${LOC_REL}/*.location;

    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;

    listen 80;
    # listen 443 ssl;
    # <configurações de certificado / Certbot>
}
EOF

echo "Diretório de locations: ${LOC_REL}"
echo "Snippet nginx gravado em: ${SNIPPET_PATH}"
echo "Revise o arquivo, ajuste SSL/listen e inclua no nginx do sistema (ex.: ln -s para sites-enabled)."
