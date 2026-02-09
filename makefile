.PHONY: help bootstrap fmt lint test test-rust test-wasm test-core test-worker test-sdk test-web test-dotrc dev-worker dev-web build-wasm build-dotrc clean

help:
	@echo "dotrc make targets:"
	@echo "  make bootstrap    Install JS deps (pnpm)"
	@echo "  make fmt          Format Rust code"
	@echo "  make lint         Run clippy + type checks"
	@echo "  make test         Run all tests (rust + wasm + worker + sdk + web)"
	@echo "  make test-sdk     Run SDK tests"
	@echo "  make test-dotrc   Run embeddable package tests"
	@echo "  make test-web     Run web UI tests"
	@echo "  make test-rust    Run Rust tests"
	@echo "  make test-wasm    Run WASM integration tests"
	@echo "  make test-core    Run dotrc-core tests only"
	@echo "  make dev-worker   Run Cloudflare Worker locally"
	@echo "  make dev-web      Run web UI locally"
	@echo "  make build-dotrc  Build embeddable package"
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
	cd packages/dotrc-sdk && pnpm tsc --noEmit
	cd packages/dotrc && pnpm tsc --noEmit
	cd apps/dotrc-web && pnpm typecheck

test: test-rust test-wasm test-worker test-sdk test-dotrc test-web
	@echo "✓ All tests passed"

test-rust:
	@echo "Running Rust tests..."
	cargo test --workspace

test-wasm: build-wasm
	@echo "Running WASM integration tests..."
	node --no-warnings=ExperimentalWarning crates/dotrc-core-wasm/tests/integration.mjs

test-worker:
	@echo "Running worker tests..."
	cd apps/dotrc-worker && pnpm test

test-sdk:
	@echo "Running SDK tests..."
	cd packages/dotrc-sdk && pnpm test

test-dotrc:
	@echo "Running embeddable package tests..."
	cd packages/dotrc && pnpm test

test-web:
	@echo "Running web UI tests..."
	cd apps/dotrc-web && pnpm test

test-core:
	cargo test -p dotrc-core

dev-worker:
	cd apps/dotrc-worker && pnpm dev

dev-web:
	cd apps/dotrc-web && pnpm dev

build-dotrc:
	@echo "Building embeddable package..."
	cd packages/dotrc && pnpm build

build-wasm:
	@echo "Building WASM..."
	./scripts/build-wasm.sh

clean:
	cargo clean
	rm -rf crates/dotrc-core-wasm/pkg