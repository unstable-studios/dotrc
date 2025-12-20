//! # dotrc-core
//!
//! Pure domain + policy engine for DotRC.
//!
//! This crate is **portable, pure, and integration-agnostic**:
//! - No I/O operations
//! - No database access
//! - No external service calls
//! - No async runtime required
//! - No platform-specific dependencies
//!
//! ## Architecture
//!
//! dotrc-core is built around the **command → write-set** pattern:
//! 1. Adapters gather necessary data (dots, grants, memberships)
//! 2. Core validates inputs and makes policy decisions
//! 3. Core returns records to persist - adapters handle persistence
//!
//! ## Core Principles
//!
//! ### Immutability
//! Dots are **never edited or deleted**. All changes create new dots.
//! Corrections and updates are expressed via links (`corrects`, `supersedes`).
//!
//! ### Explicit ACLs
//! Visibility is **snapshotted at creation time**. Access grants are
//! append-only. No retroactive changes to who can see what.
//!
//! ### No Side Effects
//! All functions are pure. Core never:
//! - Queries databases
//! - Calls external APIs
//! - Performs I/O
//! - Mutates global state
//!
//! ## Example Usage
//!
//! ```rust
//! use dotrc_core::{
//!     commands::create_dot,
//!     types::{Clock, IdGen, DotDraft, DotId, UserId, TenantId, Timestamp},
//! };
//!
//! // Implement minimal traits without external crates
//! struct MyClock;
//! impl Clock for MyClock {
//!     fn now(&self) -> Timestamp {
//!         "2025-01-01T00:00:00Z".to_string()
//!     }
//! }
//!
//! struct MyIdGen;
//! impl IdGen for MyIdGen {
//!     fn generate_dot_id(&self) -> DotId {
//!         DotId::new("dot-123")
//!     }
//!     fn generate_attachment_id(&self) -> String {
//!         "att-123".to_string()
//!     }
//! }
//!
//! // Create a dot
//! let draft = DotDraft {
//!     title: "Meeting Notes".to_string(),
//!     body: Some("Discussed Q1 roadmap".to_string()),
//!     created_by: UserId::new("user-123"),
//!     tenant_id: TenantId::new("company-1"),
//!     scope_id: None,
//!     tags: vec!["meeting".to_string()],
//!     visible_to_users: vec![UserId::new("user-123")],
//!     visible_to_scopes: vec![],
//!     attachments: vec![],
//! };
//!
//! let result = create_dot(draft, &MyClock, &MyIdGen).unwrap();
//!
//! // Persist the results (adapter responsibility)
//! // db.insert_dot(&result.dot);
//! // db.insert_grants(&result.grants);
//! ```
//!
//! ## Modules
//!
//! - [`types`] - Core domain types (Dot, Link, VisibilityGrant, etc.)
//! - [`errors`] - Error types for validation and authorization
//! - [`normalize`] - Pure validation and normalization functions
//! - [`policy`] - Authorization and visibility policy decisions
//! - [`commands`] - Command handlers that return write-sets

pub mod commands;
pub mod errors;
pub mod normalize;
pub mod policy;
pub mod types;
