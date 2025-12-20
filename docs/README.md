# DotRC Documentation

This directory contains **intentional, low-churn documentation** for DotRC.
If a document exists here, it should describe _rules, invariants, or models_ —
not implementation details that change frequently.

## Philosophy

- Fewer docs, written clearly
- Prefer invariants over tutorials
- If a rule isn’t written down, it isn’t stable
- If a doc keeps changing, it probably doesn’t belong here

## Documents

- **overview.md**  
  What DotRC is, what it is not, and the core mental model.

- **core-architecture.md**  
  The architectural contract for `dotrc-core` and its adapters.

- **data-model.md**  
  Conceptual domain entities (Dot, Scope, Link, ACL, etc.).  
  This is _not_ a database schema.

- **visibility-and-security.md**  
  How access control, immutability, and safe sharing work.

- **integrations.md**  
  Adapter model for external systems (Slack, future providers).

- **design-decisions.md**  
  A log of intentional tradeoffs and why they were made.

- **glossary.md**  
  Shared vocabulary for DotRC concepts.

## What does NOT belong here

- API reference docs
- Slack command usage
- UI behavior details
- Database schemas

Those belong with code, not with invariants.

## Rule of thumb

If you are about to ask:

> “Why does DotRC work this way?”

The answer should live somewhere in this folder.
