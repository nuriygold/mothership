#!/usr/bin/env bash
# Drive the /ops control plane from the terminal.
# Useful for recording a hackathon demo video, or just for understanding
# the system without touching the UI.
#
# Usage:
#   chmod +x scripts/ops-demo.sh
#   OPS_HOST=https://your-deploy.vercel.app ./scripts/ops-demo.sh seed
#   OPS_HOST=http://localhost:3000          ./scripts/ops-demo.sh dispatch
#   OPS_HOST=http://localhost:3000          ./scripts/ops-demo.sh feed <campaign-id>
#   OPS_HOST=http://localhost:3000          ./scripts/ops-demo.sh kill <campaign-id>
#   OPS_HOST=http://localhost:3000          ./scripts/ops-demo.sh approve <campaign-id>
#   OPS_HOST=http://localhost:3000          ./scripts/ops-demo.sh clear

set -euo pipefail

HOST="${OPS_HOST:-http://localhost:3000}"
CMD="${1:-help}"

# Pretty-print if jq is available, otherwise raw
fmt() {
  if command -v jq >/dev/null 2>&1; then
    jq
  else
    cat
  fi
}

case "$CMD" in
  seed)
    echo "→ Loading demo missions on $HOST"
    curl -sX POST "$HOST/api/ops/demo-seed" | fmt
    ;;

  list)
    echo "→ Listing campaigns on $HOST"
    curl -s "$HOST/api/ops/campaigns" | fmt
    ;;

  dispatch)
    echo "→ Dispatching real workflow on $HOST"
    curl -sX POST "$HOST/api/ops/campaigns" \
      -H "Content-Type: application/json" \
      -d '{
        "name": "Hackathon test mission",
        "objective": "Produce a one-page summary of why durable workflows matter for agent reliability.",
        "leadAgentId": "agent_adrian",
        "requiredArtifacts": ["action-log.md"],
        "minimumBatchSize": 1,
        "executionMode": "STANDARD"
      }' | fmt
    ;;

  feed)
    ID="${2:-}"
    if [ -z "$ID" ]; then
      echo "Usage: $0 feed <campaign-id>" >&2
      exit 1
    fi
    echo "→ Reading feed for $ID"
    curl -s "$HOST/api/ops/campaigns/$ID/feed" | fmt
    ;;

  approve)
    ID="${2:-}"
    if [ -z "$ID" ]; then
      echo "Usage: $0 approve <campaign-id>" >&2
      exit 1
    fi
    echo "→ Approving $ID"
    curl -sX POST "$HOST/api/ops/campaigns/$ID/control" \
      -H "Content-Type: application/json" \
      -d '{"action": "approve_action"}' | fmt
    ;;

  kill)
    ID="${2:-}"
    if [ -z "$ID" ]; then
      echo "Usage: $0 kill <campaign-id>" >&2
      exit 1
    fi
    echo "→ Killing $ID"
    curl -sX POST "$HOST/api/ops/campaigns/$ID/control" \
      -H "Content-Type: application/json" \
      -d '{"action": "kill"}' | fmt
    ;;

  clear)
    echo "→ Clearing demo missions on $HOST"
    curl -sX DELETE "$HOST/api/ops/demo-seed" | fmt
    ;;

  help|*)
    cat <<EOF
ops-demo.sh — drive the /ops control plane from the terminal

Commands:
  seed              Load three demo missions (Adrian RUNNING, Marvin BLOCKED, Iceman DONE)
  list              List campaigns + ticker summary
  dispatch          Start a real durable workflow run via the WDK
  feed <id>         Read the live feed of a campaign
  approve <id>      Send an approve_action control event
  kill <id>         Cancel the campaign + the durable workflow run
  clear             Remove demo missions, leave real ones intact

Environment:
  OPS_HOST   Base URL of the deployment (default: http://localhost:3000)

Examples:
  OPS_HOST=https://mothership.vercel.app $0 seed
  $0 dispatch
  $0 feed camp_xyz123
EOF
    ;;
esac
