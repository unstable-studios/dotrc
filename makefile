.PHONY: help bootstrap fmt lint test test-rust test-wasm test-core dev-worker dev-web build-wasm clean

help:
	@echo "dotrc make targets:"
	@echo "  make bootstrap    Install JS deps (pnpm)"
	@echo "  make fmt          Format Rust code"
	@echo "  make lint         Run clippy + type checks"
	@echo "  make test         Run all tests (rust + wasm)"
	@echo "  make test-rust    Run Rust tests"
	@echo "  make test-wasm    Run WASM integration tests"
	@echo "  make test-core    Run dotrc-core tests only"
	@echo "  make dev-worker   Run Cloudflare Worker locally"
	@echo "  make dev-web      Run web UI locally"
	@echo "  make build-wasm   Build WASM core"
	@echo "  make clean        Clean build artifacts"

bootstrap:
	pnpm install

fmt:
	cargo fmt --all

lint:
	cargo clippy --all-targets --all-features -- -D warnings || true
	@echo "Type-checking TypeScript..."
	cd apps/dotrc-worker && pnpm tsc --noEmit

test: test-rust test-wasm
	@echo "✓ All tests passed"

test-rust:
	@echo "Running Rust tests..."
	cargo test --workspace

test-wasm: build-wasm
	@echo "Running WASM integration tests..."
	node crates/dotrc-core-wasm/tests/integration.mjs

test-core:
	cargo test -p dotrc-core

dev-worker:
	cd apps/dotrc-worker && pnpm dev

dev-web:
	cd apps/dotrc-web && pnpm dev

build-wasm:
	@echo "Building WASM..."
	./scripts/build-wasm.sh

clean:
	cargo clean
	rm -rf crates/dotrc-core-wasm/pkg