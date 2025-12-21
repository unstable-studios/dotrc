#!/bin/bash
set -e

echo "Building dotrc-core-wasm..."

cd "$(dirname "$0")/../crates/dotrc-core-wasm"

# Build WASM module
cargo build --target wasm32-unknown-unknown --release

# Generate bindings
mkdir -p pkg
wasm-bindgen ../../target/wasm32-unknown-unknown/release/dotrc_core_wasm.wasm \
  --out-dir pkg \
  --target web

echo "✓ WASM build complete at crates/dotrc-core-wasm/pkg/"
echo "  Run tests: node crates/dotrc-core-wasm/tests/integration.mjs"
