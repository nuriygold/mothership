# Terminal Server Deployment (DigitalOcean Droplet)

This service backs the `/claude` Terminal tab. It must run on infrastructure that supports long-lived WebSockets (not Vercel).

## Quick answer

Yes — deploying this on a **DigitalOcean Droplet** is a good option.

## What this server does

- Exposes `wss://.../ws` for the browser terminal client (`xterm.js`)
- Spawns the `claude` CLI via `node-pty`
- Protects access with `TERMINAL_SECRET`
- Persists/replays session scrollback for reconnects

## Prerequisites

- Ubuntu 22.04+ Droplet
- DNS record (e.g. `terminal.nuriy.com`) pointed to the Droplet IP
- SSH access as root (or sudo)
- Your SSH key already added to the Droplet

## Deploy

Run these commands **on the Droplet over SSH** (not on your local laptop):

```bash
git clone https://github.com/nuriygold/mothership.git
cd mothership
git checkout claude/fix-cors-health-check-eh2MV
cd terminal-server
sudo DOMAIN=terminal.nuriy.com bash deploy.sh
```

The script will:

1. Install Docker, Nginx, Certbot, and firewall rules
2. Copy service files to `/opt/terminal-server`
3. Prompt for `TERMINAL_SECRET` and `ANTHROPIC_API_KEY`
4. Start the container with Docker Compose
5. Configure TLS and Nginx reverse proxy for WebSockets

### Auth choice: API key OR Claude account login

When prompted:

- `TERMINAL_SECRET`: press Enter to auto-generate a random secret (recommended)
- `ANTHROPIC_API_KEY`: press Enter to skip if you want Claude account OAuth login instead

Then authenticate Claude CLI inside the container:

```bash
docker exec -it terminal-server-terminal-server-1 claude auth login
```

This prints a `claude.ai` URL. Open it in your browser, approve login, and the auth is persisted in the `claude-config` Docker volume.

## Configure the Claude page

In `/claude` → Terminal mode config bar:

- **Terminal URL:** `wss://terminal.nuriy.com`
- **Token:** your `TERMINAL_SECRET`

> Security note: keep `TERMINAL_SECRET` enabled. The site PIN protects app access, but the terminal server is a separate public endpoint.

## Verify

```bash
docker exec -it terminal-server-terminal-server-1 claude --version
curl https://terminal.nuriy.com/health
```

Expected: JSON with `ok: true`.
