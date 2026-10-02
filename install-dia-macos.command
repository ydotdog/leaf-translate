#!/bin/zsh
set -eu
cd -- "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  print '请先安装 Node.js 22 或更新版本：https://nodejs.org/'
  read '?按回车退出。'
  exit 1
fi
node scripts/install-host.mjs --browser dia
read '?按回车关闭窗口。'
