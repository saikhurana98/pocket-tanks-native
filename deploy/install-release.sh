#!/usr/bin/env bash
set -euo pipefail
base=/srv/pocket-tanks
repo=saikhurana98/pocket-tanks-native
api="https://api.github.com/repos/$repo"
url=http://127.0.0.1:8080
exec 9>"$base/deploy.lock"
flock -x 9
get() { curl --fail --silent --show-error --location --retry 3 --max-time 120 "$@"; }
sha=$(get "$api/commits/main" | jq -er '.sha')
[[ $sha =~ ^[0-9a-f]{40}$ ]]
runs=$(get "$api/actions/workflows/native-ci.yml/runs?branch=main&event=push&head_sha=$sha&per_page=1")
if ! jq -e --arg sha "$sha" '.workflow_runs[0] | .head_sha==$sha and .conclusion=="success" and .status=="completed"' <<< "$runs" >/dev/null; then
  echo "Awaiting successful public CI for $sha"
  exit 0
fi
old=$(readlink -f "$base/current" || true)
release="$base/releases/$sha"
if [[ $old == "$release" ]] && curl -fsS "$url/healthz" | jq -e --arg sha "$sha" '.revision==$sha' >/dev/null; then
  echo "Already serving $sha"
  exit 0
fi
stage=$(mktemp -d "$base/releases/.stage.XXXXXXXX")
trap 'rm -rf -- "$stage"' EXIT
if [[ ! -d $release ]]; then
  get "https://codeload.github.com/$repo/tar.gz/$sha" -o "$stage/source.tar.gz"
  mkdir "$stage/source"
  tar -xzf "$stage/source.tar.gz" -C "$stage/source" --strip-components=1
  mkdir "$stage/runtime"
  (cd "$stage/source" && cp -R -- art audio engine server ./*.mjs game.js style.css index.html range.json match-range.json package*.json "$stage/runtime/")
  (cd "$stage/runtime" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
  echo "REVISION=$sha" > "$stage/runtime/release.env"
  chmod -R u+rwX,go+rX "$stage/runtime"
  mv -T "$stage/runtime" "$release"
fi
activate() {
  ln -s -- "$1" "$stage/current.next" || return 1
  mv -Tf "$stage/current.next" "$base/current" || return 1
  sudo -n /usr/bin/systemctl restart pocket-tanks.service
}
if activate "$release" &&
   curl -fsS --retry 12 --retry-delay 1 --retry-connrefused "$url/healthz" >/dev/null &&
   node deploy/smoke.mjs "$url" "$sha" "$release"; then
  echo "Deployed $sha"
else
  if [[ -d $old && $old != "$release" && $old == "$base/releases/"* ]]; then
    activate "$old"
    previous=$(basename "$old")
    curl -fsS --retry 12 --retry-delay 1 --retry-connrefused "$url/healthz" >/dev/null
    node deploy/smoke.mjs "$url" "$previous" "$old"
    echo "Restored $previous" >&2
  fi
  exit 1
fi
