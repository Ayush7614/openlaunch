#!/usr/bin/env bash
# Post-deploy smoke: every page type + the live APIs must answer 200, on both chains. Usage: scripts/smoke.sh [https://basebid.lol]
set -u
B="${1:-https://openlaunch.lol}"
fail=0
check() { code=$(curl -s -o /dev/null -w '%{http_code}' "$B$1"); ok=0; case "$1" in /api/launch/meta/*) { [ "$code" = 200 ] || [ "$code" = 404 ]; } && ok=1;; /t/0x*) { [ "$code" = 307 ] || [ "$code" = 308 ]; } && ok=1;; *) [ "$code" = 200 ] && ok=1;; esac; [ $ok = 1 ] && echo "  ok   $code $1" || { echo "  FAIL $code $1"; fail=1; }; }
for p in / /me /feed "/api/posts?feed=1" "/api/quotes?chain=robinhood&q=AAPL" "/api/quotes?chain=base" "/?filter=gitlawb" /gitlawb-mark.png "/?chain=robinhood" /launch "/launch?chain=robinhood" /rules /agents /llms.txt /api/health "/api/launch/live?sort=trending&window=1h" "/api/launch/live?sort=new&chain=robinhood" /api/launch/feed /api/presence; do check "$p"; done
for c in base robinhood; do
  T=$(curl -s "$B/api/launch/list?chain=$c&limit=1" | python3 -c 'import json,sys; l=json.load(sys.stdin)["launches"]; print(l[0]["token"] if l else "")')
  if [ -n "$T" ]; then check "/t/$c/$T"; check "/t/$c/$T/opengraph-image"; check "/api/launch/meta/$T?chain=$c"; check "/t/$T"; else echo "  skip no launches on $c"; fi
done
exit $fail
