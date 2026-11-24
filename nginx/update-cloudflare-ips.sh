#!/usr/bin/env bash
# Exit immediately if a command exits with a non-zero status, 
# treats unset variables as errors, and catches pipe failures.
set -euo pipefail

CONF_FILE="/etc/nginx/conf.d/20-cloudflare-realip.conf"
TEMP_FILE=$(mktemp)
BACKUP_FILE="${CONF_FILE}.bak"

# Ensure cleanup of the temporary file on exit
trap 'rm -f "$TEMP_FILE"' EXIT

echo "# ===================================================" > "$TEMP_FILE"
echo "# Auto-generated Cloudflare Real IP Config" >> "$TEMP_FILE"
echo "# Updated on: $(date -u)" >> "$TEMP_FILE"
echo "# ===================================================" >> "$TEMP_FILE"
echo "" >> "$TEMP_FILE"

echo "# Cloudflare IPv4 Ranges" >> "$TEMP_FILE"
for ip in $(curl -fsS https://www.cloudflare.com/ips-v4); do
    echo "set_real_ip_from $ip;" >> "$TEMP_FILE"
done

echo "" >> "$TEMP_FILE"
echo "# Cloudflare IPv6 Ranges" >> "$TEMP_FILE"
for ip in $(curl -fsS https://www.cloudflare.com/ips-v6); do
    echo "set_real_ip_from $ip;" >> "$TEMP_FILE"
done

echo "" >> "$TEMP_FILE"
echo "# Real IP Header Definition" >> "$TEMP_FILE"
echo "real_ip_header CF-Connecting-IP;" >> "$TEMP_FILE"

# Verify the temporary file is non-empty before applying
if [ ! -s "$TEMP_FILE" ]; then
    echo "Error: Downloaded IP lists resulted in an empty configuration file." >&2
    exit 1
fi

# Backup current configuration if it exists
if [ -f "$CONF_FILE" ]; then
    cp "$CONF_FILE" "$BACKUP_FILE"
fi

# Move generated file to target location
cp "$TEMP_FILE" "$CONF_FILE"

# Test Nginx configuration syntax
if nginx -t; then
    echo "Nginx configuration test passed successfully. Reloading Nginx..."
    systemctl reload nginx
    rm -f "$BACKUP_FILE"
    echo "Cloudflare IPs updated and Nginx reloaded successfully."
else
    echo "Error: Nginx configuration test failed! Reverting to previous backup..." >&2
    if [ -f "$BACKUP_FILE" ]; then
        mv "$BACKUP_FILE" "$CONF_FILE"
    else
        rm -f "$CONF_FILE"
    fi
    exit 1
fi