#!/usr/bin/env bash
# nats-cron-trigger.sh — Publish a NATS event from cron (no LLM involved).
#
# Usage:
#   nats-cron-trigger.sh <subject> [payload_json]
#
# Examples:
#   nats-cron-trigger.sh agent.events.cron.daily-report
#   nats-cron-trigger.sh agent.events.cron.check-revenue '{"task":"check_revenue"}'
#
# Environment:
#   NATS_SIDECAR_URL    — Sidecar HTTP URL  (default: http://127.0.0.1:3104)
#   NATS_PLUGIN_API_KEY — Bearer token       (required)

set -euo pipefail

SUBJECT="${1:?Usage: nats-cron-trigger.sh <subject> [payload_json]}"
PAYLOAD="${2:-"{}"}"
SIDECAR="${NATS_SIDECAR_URL:-http://127.0.0.1:3104}"

if [ -z "${NATS_PLUGIN_API_KEY:-}" ]; then
  echo "Error: NATS_PLUGIN_API_KEY is not set" >&2
  exit 1
fi

exec curl -sf -X POST "${SIDECAR}/api/publish" \
  -H "Authorization: Bearer ${NATS_PLUGIN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"subject\":\"${SUBJECT}\",\"payload\":${PAYLOAD}}"
