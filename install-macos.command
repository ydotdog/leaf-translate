#!/bin/zsh
set -eu
cd -- "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  print 'Install Node.js 22 or newer first: https://nodejs.org/'
  read '?Press Return to exit.'
  exit 1
fi
node scripts/install-host.mjs
read '?Press Return to close this window.'
