//! WASM bindings for dotrc-core
//!
//! JSON-based interface with explicit dependency injection.
//! Adapters provide timestamps and IDs; core remains pure.

use dotrc_core::{
    commands::{
        create_dot, create_link, grant_access, CreateDotResult, CreateLinkResult,
        GrantAccessResult, LinkGrants,
    },
    policy::{can_view_dot, filter_visible_dots, AuthContext},
    types::{
        Clock, Dot, DotDraft, DotId, IdGen, Link, LinkType, ScopeId, Timestamp, UserId,
        VisibilityGrant,
    },
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn core_version() -> String {
    "0.1.0".to_string()
}

// ============================================================================
// Dependency Injection Implementations (Adapter-Provided)
// ============================================================================

/// Clock implementation that uses an injected timestamp
struct InjectedClock {
    timestamp: Timestamp,
}

impl Clock for InjectedClock {
    fn now(&self) -> Timestamp {
        self.timestamp.clone()
    }
}

/// ID generator that uses pre-generated IDs from the adapter
struct InjectedIdGen {
    dot_id: DotId,
    attachment_id: String,
}

impl IdGen for InjectedIdGen {
    fn generate_dot_id(&self) -> DotId {
        self.dot_id.clone()
    }

    fn generate_attachment_id(&self) -> String {
        self.attachment_id.clone()
    }
}

// ============================================================================
// Result Types (JSON-serializable)
// ============================================================================

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum WasmResult<T> {
    Ok { data: T },
    Err { kind: String, message: String },
}

impl<T: Serialize> WasmResult<T> {
    fn ok(data: T) -> String {
        serde_json::to_string(&WasmResult::Ok { data }).unwrap()
    }

    fn err(error: &dotrc_core::errors::DotrcError) -> String {
        let (kind, message) = match error {
            dotrc_core::errors::DotrcError::Validation(e) => ("validation", format!("{}", e)),
            dotrc_core::errors::DotrcError::Authorization(e) => ("authorization", format!("{}", e)),
            dotrc_core::errors::DotrcError::InvalidLink(e) => ("invalid_link", format!("{}", e)),
            dotrc_core::errors::DotrcError::NotImplemented => {
                ("not_implemented", "Not implemented".to_string())
            }
        };

        serde_json::to_string(&WasmResult::<()>::Err {
            kind: kind.to_string(),
            message,
        })
        .unwrap()
    }
}

// ============================================================================
// Serialization Types (match core types for JSON transport)
// ============================================================================

#[derive(Serialize)]
struct CreateDotOutput {
    dot: Dot,
    grants: Vec<VisibilityGrant>,
    links: Vec<Link>,
}

#[derive(Serialize)]
struct GrantAccessOutput {
    grants: Vec<VisibilityGrant>,
}

#[derive(Serialize)]
struct CreateLinkOutput {
    link: Link,
}

#[derive(Serialize)]
struct CanViewDotOutput {
    can_view: bool,
}

#[derive(Serialize)]
struct FilterVisibleDotsOutput {
    dots: Vec<Dot>,
}

#[derive(Deserialize)]
struct LinkGrantsInput {
    from: Vec<VisibilityGrant>,
    to: Vec<VisibilityGrant>,
}

// ============================================================================
// WASM Exports
// ============================================================================

/// Create a new dot
///
/// # Arguments
/// * `draft_json` - JSON string of DotDraft
/// * `now` - RFC3339 timestamp string
/// * `dot_id` - Unique ID for the dot
///
/// # Returns
/// JSON string with { type: "ok", data: { dot, grants, links } } or { type: "err", kind, message }
#[wasm_bindgen]
pub fn wasm_create_dot(draft_json: &str, now: &str, dot_id: &str) -> String {
    let draft: DotDraft = match serde_json::from_str(draft_json) {
        Ok(d) => d,
        Err(e) => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Failed to parse draft: {}", e),
            })
            .unwrap()
        }
    };

    let clock = InjectedClock {
        timestamp: now.to_string(),
    };

    let id_gen = InjectedIdGen {
        dot_id: DotId::new(dot_id),
        attachment_id: String::new(), // Not used in create_dot
    };

    match create_dot(draft, &clock, &id_gen) {
        Ok(CreateDotResult { dot, grants, links }) => {
            WasmResult::ok(CreateDotOutput { dot, grants, links })
        }
        Err(e) => WasmResult::<CreateDotOutput>::err(&e),
    }
}

/// Grant access to an existing dot
///
/// # Arguments
/// * `dot_json` - JSON string of Dot
/// * `existing_grants_json` - JSON array of VisibilityGrant
/// * `target_users_json` - JSON array of user ID strings
/// * `target_scopes_json` - JSON array of scope ID strings
/// * `context_json` - JSON string of AuthContext { requesting_user, user_scope_memberships }
/// * `now` - RFC3339 timestamp string
///
/// # Returns
/// JSON string with { type: "ok", data: { grants } } or { type: "err", kind, message }
#[wasm_bindgen]
pub fn wasm_grant_access(
    dot_json: &str,
    existing_grants_json: &str,
    target_users_json: &str,
    target_scopes_json: &str,
    context_json: &str,
    now: &str,
) -> String {
    let dot: Dot = match serde_json::from_str(dot_json) {
        Ok(d) => d,
        Err(e) => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Failed to parse dot: {}", e),
            })
            .unwrap()
        }
    };

    let existing_grants: Vec<VisibilityGrant> = match serde_json::from_str(existing_grants_json) {
        Ok(g) => g,
        Err(e) => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Failed to parse existing grants: {}", e),
            })
            .unwrap()
        }
    };

    let target_user_ids: Vec<String> = match serde_json::from_str(target_users_json) {
        Ok(u) => u,
        Err(e) => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Failed to parse target users: {}", e),
            })
            .unwrap()
        }
    };

    let target_scope_ids: Vec<String> = match serde_json::from_str(target_scopes_json) {
        Ok(s) => s,
        Err(e) => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Failed to parse target scopes: {}", e),
            })
            .unwrap()
        }
    };

    #[derive(Deserialize)]
    struct AuthContextInput {
        requesting_user: String,
        user_scope_memberships: Vec<String>,
    }

    let context_input: AuthContextInput = match serde_json::from_str(context_json) {
        Ok(c) => c,
        Err(e) => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Failed to parse context: {}", e),
            })
            .unwrap()
        }
    };

    let context = AuthContext::new(
        UserId::new(context_input.requesting_user),
        context_input
            .user_scope_memberships
            .into_iter()
            .map(ScopeId::new)
            .collect(),
    );

    let target_users = target_user_ids.into_iter().map(UserId::new).collect();
    let target_scopes = target_scope_ids.into_iter().map(ScopeId::new).collect();

    let clock = InjectedClock {
        timestamp: now.to_string(),
    };

    match grant_access(
        &dot,
        &existing_grants,
        target_users,
        target_scopes,
        &context,
        &clock,
    ) {
        Ok(GrantAccessResult { grants }) => WasmResult::ok(GrantAccessOutput { grants }),
        Err(e) => WasmResult::<GrantAccessOutput>::err(&e),
    }
}

/// Create a link between two dots
///
/// # Arguments
/// * `from_dot_json` - JSON string of source Dot
/// * `to_dot_json` - JSON string of target Dot
/// * `link_type` - Link type: "followup", "corrects", "supersedes", "related"
/// * `grants_json` - JSON string of { from: [...], to: [...] } grants
/// * `existing_links_json` - JSON array of existing Links
/// * `context_json` - JSON string of AuthContext
/// * `now` - RFC3339 timestamp string
///
/// # Returns
/// JSON string with { type: "ok", data: { link } } or { type: "err", kind, message }
#[wasm_bindgen]
pub fn wasm_create_link(
    from_dot_json: &str,
    to_dot_json: &str,
    link_type: &str,
    grants_json: &str,
    existing_links_json: &str,
    context_json: &str,
    now: &str,
) -> String {
    let from_dot: Dot = match serde_json::from_str(from_dot_json) {
        Ok(d) => d,
        Err(e) => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Failed to parse from_dot: {}", e),
            })
            .unwrap()
        }
    };

    let to_dot: Dot = match serde_json::from_str(to_dot_json) {
        Ok(d) => d,
        Err(e) => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Failed to parse to_dot: {}", e),
            })
            .unwrap()
        }
    };

    let link_type_enum = match link_type {
        "followup" => LinkType::Followup,
        "corrects" => LinkType::Corrects,
        "supersedes" => LinkType::Supersedes,
        "related" => LinkType::Related,
        _ => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Invalid link type: {}", link_type),
            })
            .unwrap()
        }
    };

    let grants_input: LinkGrantsInput = match serde_json::from_str(grants_json) {
        Ok(g) => g,
        Err(e) => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Failed to parse grants: {}", e),
            })
            .unwrap()
        }
    };

    let existing_links: Vec<Link> = match serde_json::from_str(existing_links_json) {
        Ok(l) => l,
        Err(e) => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Failed to parse existing links: {}", e),
            })
            .unwrap()
        }
    };

    #[derive(Deserialize)]
    struct AuthContextInput {
        requesting_user: String,
        user_scope_memberships: Vec<String>,
    }

    let context_input: AuthContextInput = match serde_json::from_str(context_json) {
        Ok(c) => c,
        Err(e) => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Failed to parse context: {}", e),
            })
            .unwrap()
        }
    };

    let context = AuthContext::new(
        UserId::new(context_input.requesting_user),
        context_input
            .user_scope_memberships
            .into_iter()
            .map(ScopeId::new)
            .collect(),
    );

    let clock = InjectedClock {
        timestamp: now.to_string(),
    };

    let link_grants = LinkGrants {
        from: &grants_input.from,
        to: &grants_input.to,
    };

    match create_link(
        &from_dot,
        &to_dot,
        link_type_enum,
        link_grants,
        &existing_links,
        &context,
        &clock,
    ) {
        Ok(CreateLinkResult { link }) => WasmResult::ok(CreateLinkOutput { link }),
        Err(e) => WasmResult::<CreateLinkOutput>::err(&e),
    }
}

/// Check if a user can view a dot
///
/// # Arguments
/// * `dot_json` - JSON string of Dot
/// * `grants_json` - JSON array of VisibilityGrant
/// * `context_json` - JSON string of AuthContext
///
/// # Returns
/// JSON string with { type: "ok", data: { can_view: bool } } or { type: "err", kind, message }
#[wasm_bindgen]
pub fn wasm_can_view_dot(dot_json: &str, grants_json: &str, context_json: &str) -> String {
    let dot: Dot = match serde_json::from_str(dot_json) {
        Ok(d) => d,
        Err(e) => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Failed to parse dot: {}", e),
            })
            .unwrap()
        }
    };

    let grants: Vec<VisibilityGrant> = match serde_json::from_str(grants_json) {
        Ok(g) => g,
        Err(e) => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Failed to parse grants: {}", e),
            })
            .unwrap()
        }
    };

    #[derive(Deserialize)]
    struct AuthContextInput {
        requesting_user: String,
        user_scope_memberships: Vec<String>,
    }

    let context_input: AuthContextInput = match serde_json::from_str(context_json) {
        Ok(c) => c,
        Err(e) => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Failed to parse context: {}", e),
            })
            .unwrap()
        }
    };

    let context = AuthContext::new(
        UserId::new(context_input.requesting_user),
        context_input
            .user_scope_memberships
            .into_iter()
            .map(ScopeId::new)
            .collect(),
    );

    let can_view = can_view_dot(&dot, &grants, &context).is_ok();
    WasmResult::ok(CanViewDotOutput { can_view })
}

/// Filter dots to only those visible to the user
///
/// # Arguments
/// * `dots_json` - JSON array of Dot
/// * `grants_json` - JSON array of VisibilityGrant
/// * `context_json` - JSON string of AuthContext
///
/// # Returns
/// JSON string with { type: "ok", data: { dots: [...] } } or { type: "err", kind, message }
#[wasm_bindgen]
pub fn wasm_filter_visible_dots(dots_json: &str, grants_json: &str, context_json: &str) -> String {
    let dots: Vec<Dot> = match serde_json::from_str(dots_json) {
        Ok(d) => d,
        Err(e) => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Failed to parse dots: {}", e),
            })
            .unwrap()
        }
    };

    let grants: Vec<VisibilityGrant> = match serde_json::from_str(grants_json) {
        Ok(g) => g,
        Err(e) => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Failed to parse grants: {}", e),
            })
            .unwrap()
        }
    };

    #[derive(Deserialize)]
    struct AuthContextInput {
        requesting_user: String,
        user_scope_memberships: Vec<String>,
    }

    let context_input: AuthContextInput = match serde_json::from_str(context_json) {
        Ok(c) => c,
        Err(e) => {
            return serde_json::to_string(&WasmResult::<()>::Err {
                kind: "parse_error".to_string(),
                message: format!("Failed to parse context: {}", e),
            })
            .unwrap()
        }
    };

    let context = AuthContext::new(
        UserId::new(context_input.requesting_user),
        context_input
            .user_scope_memberships
            .into_iter()
            .map(ScopeId::new)
            .collect(),
    );

    let visible_dots = filter_visible_dots(dots, &grants, &context);
    WasmResult::ok(FilterVisibleDotsOutput { dots: visible_dots })
}
