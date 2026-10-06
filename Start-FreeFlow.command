#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export FREEFLOW_HOME_DIR="${FREEFLOW_HOME_DIR:-$HOME/Library/Application Support/FreeFlow}"
exec bash scripts/npm-local.sh run start:desktop
