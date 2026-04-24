#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 1
fi

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
NVMRC_PATH="$ROOT_DIR/.nvmrc"

if [ ! -f "$NVMRC_PATH" ]; then
  echo "Missing .nvmrc at $NVMRC_PATH" >&2
  exit 1
fi

REQUESTED_VERSION=$(tr -d '[:space:]' < "$NVMRC_PATH")
REQUESTED_VERSION=${REQUESTED_VERSION#v}

resolve_node_bin() {
  if [ -n "${PROJECT_NODE_BIN:-}" ] && [ -x "${PROJECT_NODE_BIN}/node" ]; then
    printf '%s\n' "$PROJECT_NODE_BIN"
    return 0
  fi

  if [ -d "$HOME/.nvm/versions/node" ]; then
    local exact="$HOME/.nvm/versions/node/v$REQUESTED_VERSION/bin"
    if [ -x "$exact/node" ]; then
      printf '%s\n' "$exact"
      return 0
    fi

    local match
    match=$(
      find "$HOME/.nvm/versions/node" -maxdepth 1 -mindepth 1 -type d -name "v$REQUESTED_VERSION*" \
        | sort -V \
        | tail -n 1
    )
    if [ -n "$match" ] && [ -x "$match/bin/node" ]; then
      printf '%s\n' "$match/bin"
      return 0
    fi
  fi

  local path_node
  path_node=$(command -v node || true)
  if [ -n "$path_node" ] && [ "${path_node#/Applications/Codex.app/}" = "$path_node" ]; then
    printf '%s\n' "$(dirname "$path_node")"
    return 0
  fi

  return 1
}

NODE_BIN=$(resolve_node_bin) || {
  echo "Could not find a usable Node runtime for version '$REQUESTED_VERSION'." >&2
  echo "Install it with nvm or set PROJECT_NODE_BIN=/path/to/node/bin." >&2
  exit 1
}

PATH="$NODE_BIN:$PATH" exec "$@"
