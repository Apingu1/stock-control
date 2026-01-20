#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT/web"

NODE_VERSION="20.19.5"

echo "=== Setup frontend (match working Codespace) ==="
echo "Node target: $NODE_VERSION"
echo "Web dir: $WEB_DIR"

if [ ! -d "$WEB_DIR" ]; then
  echo "ERROR: web/ folder not found at $WEB_DIR"
  exit 1
fi

# Ensure curl exists
command -v curl >/dev/null 2>&1 || (sudo apt-get update && sudo apt-get install -y curl)

# Install nvm if missing
if [ ! -d "$HOME/.nvm" ]; then
  echo "Installing nvm..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi

export NVM_DIR="$HOME/.nvm"
# Load nvm in this script process
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

if ! command -v nvm >/dev/null 2>&1; then
  echo "ERROR: nvm not available after install. Try: source ~/.bashrc (or reopen terminal)."
  exit 1
fi

echo "Installing/using Node $NODE_VERSION..."
nvm install "$NODE_VERSION"
nvm use "$NODE_VERSION"

echo "Node: $(node -v)"
echo "npm:  $(npm -v)"

cd "$WEB_DIR"

if [ -f package-lock.json ]; then
  echo "Installing deps via npm ci..."
  npm ci
else
  echo "ERROR: package-lock.json missing. Refusing to proceed (reproducibility)."
  exit 1
fi

echo "Vite:"
npm ls vite --depth=0 || true

echo
echo "SUCCESS."
echo "To ensure npm/node are available in NEW terminals, reopen terminal or run:"
echo "  export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\" && nvm use $NODE_VERSION"
echo
echo "Run dev server:"
echo "  cd $WEB_DIR && npm run dev"
