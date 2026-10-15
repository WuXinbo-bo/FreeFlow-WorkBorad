#!/bin/bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
electron_app="$project_root/node_modules/electron/dist/Electron.app"
log_dir="$HOME/Library/Logs/FreeFlow"
log_file="$log_dir/desktop-start.log"

fail() {
  echo "FreeFlow 启动失败：$1" >&2
  if [[ -t 0 ]]; then
    read -r -p "按回车关闭此窗口…" reply
  fi
  exit 1
}

[[ -f "$project_root/electron/main.js" ]] || fail "找不到项目，请在项目目录中运行此脚本。"
[[ -x "$electron_app/Contents/MacOS/Electron" ]] || fail "找不到 Electron 依赖，请先按 MACOS-SETUP.md 安装项目依赖。"
mkdir -p "$log_dir"
cd "$project_root"
unset ELECTRON_RUN_AS_NODE

# LaunchServices owns the process so closing Terminal will not stop FreeFlow.
if ! /usr/bin/open -n -a "$electron_app" --env ELECTRON_RUN_AS_NODE \
  --stdout "$log_file" --stderr "$log_file" --args "$project_root" "$@"; then
  fail "请查看日志：$log_file"
fi
echo "FreeFlow 已启动；若已运行，将显示已有窗口。"
echo "项目：$project_root"
echo "日志：$log_file"
echo "可以关闭此终端窗口。"
