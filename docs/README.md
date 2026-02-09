# DotRC Documentation

This directory contains **intentional, low-churn documentation** for DotRC.
If a document exists here, it should describe _rules, invariants, or models_ —
not implementation details that change frequently.

## Philosophy

- Fewer docs, written clearly
- Prefer invariants over tutorials
- If a rule isn't written down, it isn't stable
- If a doc keeps changing, it probably doesn't belong here

## Invariants & Architecture

These documents describe _why_ DotRC works the way it does:

- **[overview.md](./overview.md)** — What DotRC is, what it is not, and the core mental model
- **[core-architecture.md](./core-architecture.md)** — The architectural contract for `dotrc-core` and its adapters
- **[data-model.md](./data-model.md)** — Conceptual domain entities (Dot, Scope, Link, ACL, etc.)
- **[visibility-and-security.md](./visibility-and-security.md)** — How access control, immutability, and safe sharing work
- **[integrations.md](./integrations.md)** — Adapter model for external systems (Slack, future providers)
- **[design-decisions.md](./design-decisions.md)** — A log of intentional tradeoffs and why they were made
- **[glossary.md](./glossary.md)** — Shared vocabulary for DotRC concepts
- **[wasm-implementation.md](./wasm-implementation.md)** — WASM bridge design and conventions

## Guides

These documents describe _how_ to use DotRC:

- **[Getting Started](./guides/getting-started.md)** — Deploy the worker and create your first dot
- **[API Reference](./guides/api-reference.md)** — All endpoints with request/response schemas
- **[Authentication](./guides/authentication.md)** — Provider chain: Cloudflare Access, JWT, Trusted Headers, Development
- **[SDK Usage](./guides/sdk-usage.md)** — TypeScript SDK examples
- **[Embedded Usage](./guides/embedded-usage.md)** — Using `packages/dotrc` for local-first apps
- **[Deployment](./guides/deployment.md)** — Cloudflare Worker deployment (D1, R2, wrangler)
- **[Self-Hosting](./guides/self-hosting.md)** — dotrc-server setup with Postgres
- **[Slack Integration](./guides/slack-integration.md)** — Slack app setup, slash commands, events
- **[Error Reference](./guides/error-reference.md)** — Error kinds, codes, and troubleshooting

## API Specification

- **[openapi.yaml](./openapi.yaml)** — OpenAPI 3.1 specification for all worker endpoints

## Contributing

- **[contributing.md](./contributing.md)** — Dev setup, testing, PR process, architecture overview

## Rule of thumb

If you are about to ask:

> "Why does DotRC work this way?"

The answer should live somewhere in the invariants section.

> "How do I use DotRC?"

The answer should live somewhere in the guides section.
