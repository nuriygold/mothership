#!/usr/bin/env bash
# One-shot setup for a fresh Ubuntu 22.04 / 24.04 Digital Ocean Droplet.
# Run as root (or with sudo) after SSHing in:
#   bash deploy.sh
# Then follow the post-install steps printed at the end.
set -euo pipefail

DOMAIN="${DOMAIN:-}"   # set via env or you'll be prompted

# ── 1. System packages ─────────────────────────────────────────────────────────
apt-get update -qq
apt-get install -y --no-install-recommends \
  curl ca-certificates gnupg lsb-release nginx certbot python3-certbot-nginx ufw

# ── 2. Docker ──────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
fi

# ── 3. Copy terminal-server files ─────────────────────────────────────────────
INSTALL_DIR=/opt/terminal-server
mkdir -p "$INSTALL_DIR"

# If running from inside the repo, copy files; otherwise pull from git.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/server.js" ]]; then
  cp "$SCRIPT_DIR"/{server.js,package.json,Dockerfile,docker-compose.yml,nginx.conf} "$INSTALL_DIR/"
  [[ -f "$SCRIPT_DIR/.env.example" ]] && cp "$SCRIPT_DIR/.env.example" "$INSTALL_DIR/"
else
  echo "ERROR: run this script from the terminal-server/ directory or from the repo root."
  exit 1
fi

# ── 4. .env file ──────────────────────────────────────────────────────────────
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
  echo ""
  echo "▶ Edit $INSTALL_DIR/.env and set TERMINAL_SECRET and ANTHROPIC_API_KEY, then re-run."
  echo "  Or set them now:"
  read -rp "  TERMINAL_SECRET (leave blank to generate): " SECRET
  if [[ -z "$SECRET" ]]; then
    SECRET=$(openssl rand -hex 32)
    echo "  Generated: $SECRET"
  fi
  sed -i "s|change-me-to-something-secret|$SECRET|" "$INSTALL_DIR/.env"
  read -rp "  ANTHROPIC_API_KEY (sk-ant-...): " APIKEY
  sed -i "s|sk-ant-\.\.\.|$APIKEY|" "$INSTALL_DIR/.env"
fi

# ── 5. Build and start container ──────────────────────────────────────────────
cd "$INSTALL_DIR"
docker compose --env-file .env up -d --build

# ── 6. Firewall ────────────────────────────────────────────────────────────────
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ── 7. Nginx + TLS ────────────────────────────────────────────────────────────
if [[ -z "$DOMAIN" ]]; then
  read -rp "Domain name for this server (e.g. terminal.nuriy.com): " DOMAIN
fi

NGINX_CONF=/etc/nginx/sites-available/terminal-server
cp "$INSTALL_DIR/nginx.conf" "$NGINX_CONF"
sed -i "s|YOURDOMAIN|$DOMAIN|g" "$NGINX_CONF"
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/terminal-server
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "hello@nuriy.com" || {
  echo "⚠  Certbot failed — DNS may not be pointing here yet. Run manually:"
  echo "   certbot --nginx -d $DOMAIN"
}

# ── 8. Done ───────────────────────────────────────────────────────────────────
TERMINAL_SECRET=$(grep TERMINAL_SECRET "$INSTALL_DIR/.env" | cut -d= -f2-)

echo ""
echo "════════════════════════════════════════════════════"
echo " Terminal server deployed!"
echo ""
echo " WSS URL   : wss://$DOMAIN"
echo " Token     : $TERMINAL_SECRET"
echo " Health    : https://$DOMAIN/health"
echo ""
echo " In the Claude console config bar:"
echo "   Terminal URL → wss://$DOMAIN"
echo "   Token        → (paste the Token above)"
echo "════════════════════════════════════════════════════"
