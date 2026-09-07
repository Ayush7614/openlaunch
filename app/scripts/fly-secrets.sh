#!/usr/bin/env bash
# Stage runtime secrets on Fly for this app. Values are read from ./.env.production (never printed,
# never committed — see .env.example for the keys). DATABASE_URL is set by `fly postgres attach`.
# Staged secrets apply on the next `fly deploy`. Re-runnable.
#   FLY_APP     = Fly app name (default: basebid — the live openlaunch.lol app; set your own for a fork)
#   SECRETS_ENV = file to read (default: .env.production)
set -euo pipefail
cd "$(dirname "$0")/.."
APP=${FLY_APP:-basebid}
WEB=${SECRETS_ENV:-.env.production}
[ -f "$WEB" ] || { echo "missing $WEB — copy .env.example to $WEB and fill in the production values"; exit 1; }
val() { grep -E "^$2=" "$1" | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//'; }
args=()
add() { [ -n "${2:-}" ] && args+=("$1=$2") && echo "  staged $1" || echo "  SKIP $1 (empty)"; }
# Token logo bucket: created by `fly storage create -a basebid -n openlaunch-images --public` (stages AWS_ACCESS_KEY_ID/
# BASE_B20_RPC_URL (optional): Base node that executes B20 precompiles (Coinbase tokenized stocks). Alchemy answers
#   "EVM error OpcodeNotFound" for those; default fallback is https://base-rpc.publicnode.com.
#   AWS_SECRET_ACCESS_KEY/AWS_ENDPOINT_URL_S3/AWS_REGION/BUCKET_NAME itself) — not managed here.

add BASE_RPC_URL "$(val $WEB BASE_RPC_URL)"
add ROBINHOOD_RPC_URL "$(val $WEB BASE_RPC_URL | sed -E "s#base-mainnet#robinhood-mainnet#")"
add NEXT_PUBLIC_CHAIN base
add NEXT_PUBLIC_SITE_URL https://openlaunch.lol
add NEXT_PUBLIC_LAUNCH_FACTORY "${NEXT_PUBLIC_LAUNCH_FACTORY:-}"
add NEXT_PUBLIC_LAUNCH_LOCKER "${NEXT_PUBLIC_LAUNCH_LOCKER:-}"
add LAUNCH_DEPLOY_BLOCK "${LAUNCH_DEPLOY_BLOCK:-}"
add NEXT_PUBLIC_LAUNCH_FACTORY_ROBINHOOD "${NEXT_PUBLIC_LAUNCH_FACTORY_ROBINHOOD:-}"
add NEXT_PUBLIC_LAUNCH_LOCKER_ROBINHOOD "${NEXT_PUBLIC_LAUNCH_LOCKER_ROBINHOOD:-}"
add LAUNCH_DEPLOY_BLOCK_ROBINHOOD "${LAUNCH_DEPLOY_BLOCK_ROBINHOOD:-}"

fly secrets set -a "$APP" --stage "${args[@]}" >/dev/null
echo "done. NEXT_PUBLIC_LAUNCH_FACTORY / _LOCKER are also BUILD args (see fly.toml header)."
