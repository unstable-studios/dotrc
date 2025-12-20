.PHONY: help bootstrap fmt lint test test-core dev-worker dev-web build-core clean

help:
	@echo "dotrc make targets:"
	@echo "  make bootstrap    Install JS deps (pnpm)"
	@echo "  make fmt          Format Rust code"
	@echo "  make lint         Run clippy (JS lint stub)"
	@echo "  make test         Run all Rust tests"
	@echo "  make test-core    Run dotrc-core tests only"
	@echo "  make dev-worker   Run Cloudflare Worker locally"
	@echo "  make dev-web      Run web UI locally"
	@echo "  make build-core   Build WASM core (stub)"
	@echo "  make clean        Clean build artifacts"

bootstrap:
	pnpm install

fmt:
	cargo fmt --all

lint:
	cargo clippy --all-targets --all-features -- -D warnings || true

test:
	cargo test --workspace

test-core:
	cargo test -p dotrc-core

dev-worker:
	cd apps/dotrc-worker && pnpm dev

dev-web:
	cd apps/dotrc-web && pnpm dev

build-core:
	@echo "TODO: build dotrc-core-wasm"

clean:
	cargo clean