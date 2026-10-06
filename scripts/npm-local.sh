#!/bin/bash
set -euo pipefail
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$project_root/.tools/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$project_root"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "FreeFlow 需要 Node.js 24 或更新版本，请安装后重试。详情见 MACOS-SETUP.md。" >&2
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  echo "FreeFlow 需要 Node.js 24 或更新版本（当前 $(node --version)）。" >&2
  exit 1
fi
exec npm "$@"
