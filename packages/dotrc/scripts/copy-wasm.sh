#!/bin/bash
set -e

# Copy WASM artifacts from the core build output to this package
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_DIR="$SCRIPT_DIR/.."
WASM_PKG="$PKG_DIR/../../crates/dotrc-core-wasm/pkg"

if [ ! -d "$WASM_PKG" ]; then
  echo "Error: WASM package not found at $WASM_PKG"
  echo "Run 'make build-wasm' first."
  exit 1
fi

mkdir -p "$PKG_DIR/wasm"
cp "$WASM_PKG/dotrc_core_wasm_bg.wasm" "$PKG_DIR/wasm/"
cp "$WASM_PKG/dotrc_core_wasm.js" "$PKG_DIR/wasm/"
cp "$WASM_PKG/dotrc_core_wasm_bg.js" "$PKG_DIR/wasm/"
cp "$WASM_PKG/dotrc_core_wasm.d.ts" "$PKG_DIR/wasm/"
cp "$WASM_PKG/dotrc_core_wasm_bg.wasm.d.ts" "$PKG_DIR/wasm/"

echo "WASM artifacts copied to packages/dotrc/wasm/"
