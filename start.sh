#!/bin/bash
set -e

cd "$(dirname "$0")"

# Add Claude Code binary to PATH
CLAUDE_BIN_DIR="/home/devayan/.vscode/extensions/anthropic.claude-code-2.1.81-linux-x64/resources/native-binary"
export PATH="$CLAUDE_BIN_DIR:$PATH"

if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

echo "🚀 Starting Ideas Workflow Watcher..."
node src/watcher.js
