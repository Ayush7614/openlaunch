#!/usr/bin/env bash
# The deployed contract sources, their build settings and the pinned libraries must match contracts/deployed.lock byte for
# byte. Fails on any drift. Run from anywhere.
#   script/check-deployed-sources.sh                    check
#   script/check-deployed-sources.sh --update [path…]   rewrite the hashes; extra paths (from the repo root) are added
set -euo pipefail
cd "$(dirname "$0")/../.."
lock=contracts/deployed.lock

sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }
gitlink() { git ls-files -s -- "$1" | awk '$1 == "160000" { print $2 }'; }
current() { # kind path -> the value the lock should hold, empty when the path is gone
  if [[ "$1" == gitlink ]]; then gitlink "$2"; elif [[ -f "$2" && ! -L "$2" ]]; then sha "$2"; fi
}

if [[ "${1:-}" == "--update" ]]; then
  shift
  tmp=$(mktemp)
  grep -E '^(#|$)' "$lock" > "$tmp" || true
  { grep -E '^(sha256|gitlink) ' "$lock" | awk '{ print $1, $3 }'
    for extra in "$@"; do
      if [[ -n "$(gitlink "$extra")" ]]; then echo "gitlink $extra"; else echo "sha256 $extra"; fi
    done
  } | awk '!seen[$2]++' | while read -r kind path; do
    value=$(current "$kind" "$path")
    [[ -n "$value" ]] || { echo "cannot lock $path: not a tracked file or submodule" >&2; exit 1; }
    printf '%s %s  %s\n' "$kind" "$value" "$path"
  done >> "$tmp"
  mv "$tmp" "$lock"; echo "updated $lock"; exit 0
fi

failed=0; checked=0
while read -r kind want path; do
  [[ "$kind" == sha256 || "$kind" == gitlink ]] || continue
  checked=$((checked + 1))
  got=$(current "$kind" "$path")
  if [[ "$got" != "$want" ]]; then
    echo "DRIFT  $path: locked $kind ${want:0:12}…, found ${got:-nothing}"; failed=1; continue
  fi
  # the library that gets compiled is the checked-out one, so it has to be the pinned commit too
  if [[ "$kind" == gitlink && -e "$path/.git" ]]; then
    out=$(git -C "$path" rev-parse HEAD)
    [[ "$out" == "$want" ]] || { echo "DRIFT  $path: checked out at ${out:0:12}…, pinned at ${want:0:12}… (git submodule update)"; failed=1; }
  fi
done < "$lock"

if [[ "$checked" -eq 0 ]]; then echo "$lock lists nothing to check"; exit 1; fi
if [[ "$failed" -ne 0 ]]; then
  echo "Deployed contract files are never edited. A change for another chain goes in a new copied file (see src/LaunchFactoryArc.sol)."
  exit 1
fi
echo "ok: $checked deployed contract files and library pins match $lock"
