#!/usr/bin/env bash
set -euo pipefail

print_usage() {
    echo "Usage: $(basename "$0") production|development destination.conf"
}

if [ $# -lt 2 ]; then
    print_usage
    exit 1
fi

TEMPLATE_DIR="$(pwd)/sites-available"
VARIABLES_FILE="$(pwd)/.env_${1}"
TEMPLATE="${TEMPLATE_DIR}/nginx.${1}.template.conf"
OUTPUT="${2}"

if [ ! -f "${VARIABLES_FILE}" ]; then
    echo "Variables file not found: ${VARIABLES_FILE}"
    exit 1
fi

if [ ! -f "${TEMPLATE}" ]; then
    echo "Template file not found: ${TEMPLATE}"
    exit 1
fi

if [ ! -f "./variable_list" ]; then
    echo "Environment variable list not found: ./variable_list"
    exit 1
fi

set -a
source ${VARIABLES_FILE}
set +a

: "${NGINX_SERVER_NAME:?NGINX_SERVER_NAME is required}"
: "${NGINX_WEB_ROOT:?NGINX_WEB_ROOT is required}"
: "${NGINX_TLS_CERT:?NGINX_TLS_CERT is required}"
: "${NGINX_TLS_KEY:?NGINX_TLS_KEY is required}"
: "${NGINX_ACCESS_LOG:?NGINX_ACCESS_LOG is required}"
: "${NGINX_ERROR_LOG:?NGINX_ERROR_LOG is required}"
: "${NGINX_API_UPSTREAM:?NGINX_API_UPSTREAM is required}"
: "${NGINX_COUCHDB_UPSTREAM:?NGINX_COUCHDB_UPSTREAM is required}"
: "${NGINX_COUCHDB_DB_NAME:?NGINX_COUCHDB_DB_NAME is required}"

envsubst "$(tr '\n' ' ' < ./variable_list)" \
    < "${TEMPLATE}" \
    > "${OUTPUT}"

# nginx -t -c /etc/nginx/nginx.conf

printf 'Rendered configuration: %s\n' "${OUTPUT}"