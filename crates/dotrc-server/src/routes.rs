//! HTTP route handlers for the dotrc API.
//!
//! Mirrors the Cloudflare Workers endpoints using axum.

use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use dotrc_core::commands::{self, LinkGrants};
use dotrc_core::policy::AuthContext;
use dotrc_core::types::{DotDraft, DotId, LinkType, ScopeId, TenantId, UserId};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::storage::PgStorage;

/// Shared application state.
#[derive(Clone)]
pub struct AppState {
    pub storage: PgStorage,
}

/// Clock implementation using real system time.
struct SystemClock;
impl dotrc_core::types::Clock for SystemClock {
    fn now(&self) -> String {
        chrono_now()
    }
}

/// ID generator using UUIDs.
struct UuidIdGen;
impl dotrc_core::types::IdGen for UuidIdGen {
    fn generate_dot_id(&self) -> DotId {
        DotId::new(format!("dot-{}", uuid::Uuid::new_v4()))
    }
    fn generate_attachment_id(&self) -> String {
        format!("att-{}", uuid::Uuid::new_v4())
    }
}

fn chrono_now() -> String {
    // Use a simple UTC timestamp
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    // Format as ISO 8601 — simplified version
    let secs_per_day = 86400u64;
    let days = now / secs_per_day;
    let remaining = now % secs_per_day;
    let hours = remaining / 3600;
    let minutes = (remaining % 3600) / 60;
    let seconds = remaining % 60;

    // Calculate year/month/day from days since epoch
    let mut y = 1970i64;
    let mut d = days as i64;
    loop {
        let days_in_year = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) {
            366
        } else {
            365
        };
        if d < days_in_year {
            break;
        }
        d -= days_in_year;
        y += 1;
    }
    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let month_days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let mut m = 0;
    for &md in &month_days {
        if d < md {
            break;
        }
        d -= md;
        m += 1;
    }

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y,
        m + 1,
        d + 1,
        hours,
        minutes,
        seconds
    )
}

/// Extract auth context from request headers.
/// For self-hosted, uses x-tenant-id and x-user-id headers (trusted proxy).
fn extract_auth(headers: &HeaderMap) -> Result<(String, AuthContext), AppError> {
    let tenant_id = headers
        .get("x-tenant-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(AppError::unauthorized)?;
    let user_id = headers
        .get("x-user-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(AppError::unauthorized)?;

    Ok((
        tenant_id.to_string(),
        AuthContext::new(UserId::new(user_id), vec![]),
    ))
}

// --- Request/Response types ---

#[derive(Deserialize)]
pub struct CreateDotRequest {
    title: String,
    body: Option<String>,
    scope_id: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    visible_to_users: Vec<String>,
    #[serde(default)]
    visible_to_scopes: Vec<String>,
}

#[derive(Serialize)]
struct CreateDotResponse {
    dot_id: String,
    created_at: String,
    grants_count: usize,
    links_count: usize,
}

#[derive(Deserialize)]
pub struct GrantAccessRequest {
    #[serde(default)]
    user_ids: Vec<String>,
    #[serde(default)]
    scope_ids: Vec<String>,
}

#[derive(Deserialize)]
pub struct CreateLinkRequest {
    to_dot_id: String,
    link_type: String,
}

#[derive(Deserialize)]
pub struct PaginationParams {
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Serialize)]
struct ListDotsResponse {
    dots: Vec<serde_json::Value>,
    total: usize,
    has_more: bool,
    limit: i64,
    offset: i64,
}

#[derive(Serialize)]
pub struct HealthResponse {
    status: &'static str,
    service: &'static str,
}

// --- Handlers ---

/// GET / — Health check
pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "dotrc-server",
    })
}

/// POST /dots — Create a dot
pub async fn create_dot(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<CreateDotRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (tenant_id, auth) = extract_auth(&headers)?;

    let visible_to_users = if req.visible_to_users.is_empty() {
        vec![auth.requesting_user.clone()]
    } else {
        req.visible_to_users
            .into_iter()
            .map(|u| UserId::new(&u))
            .collect()
    };

    let draft = DotDraft {
        title: req.title,
        body: req.body,
        created_by: auth.requesting_user.clone(),
        tenant_id: TenantId::new(&tenant_id),
        scope_id: req.scope_id.map(|s| ScopeId::new(&s)),
        tags: req.tags,
        visible_to_users,
        visible_to_scopes: req
            .visible_to_scopes
            .into_iter()
            .map(|s| ScopeId::new(&s))
            .collect(),
        attachments: vec![],
    };

    let result = commands::create_dot(draft, &SystemClock, &UuidIdGen)?;

    let now = chrono_now();
    state
        .storage
        .ensure_entities(&result.dot, &result.grants, &now)
        .await?;
    state
        .storage
        .store_dot(&result.dot, &result.grants, &result.links)
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(CreateDotResponse {
            dot_id: result.dot.id.as_str().to_string(),
            created_at: result.dot.created_at.clone(),
            grants_count: result.grants.len(),
            links_count: result.links.len(),
        }),
    ))
}

/// GET /dots/:dotId — Get a dot
pub async fn get_dot(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(dot_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (tenant_id, auth) = extract_auth(&headers)?;

    let dot = state
        .storage
        .get_dot(&tenant_id, &dot_id)
        .await?
        .ok_or_else(|| AppError::not_found("Dot not found"))?;

    let grants = state.storage.get_grants(&tenant_id, &dot_id).await?;
    let can_view = dot.created_by == auth.requesting_user
        || grants
            .iter()
            .any(|g| g.user_id.as_ref() == Some(&auth.requesting_user));

    if !can_view {
        return Err(AppError::forbidden(
            "You do not have permission to view this dot",
        ));
    }

    Ok(Json(serde_json::to_value(&dot).unwrap()))
}

/// GET /dots — List dots
pub async fn list_dots(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<PaginationParams>,
) -> Result<impl IntoResponse, AppError> {
    let (tenant_id, auth) = extract_auth(&headers)?;

    let limit = params.limit.unwrap_or(50).clamp(1, 100);
    let offset = params.offset.unwrap_or(0).max(0);

    let (dots, has_more) = state
        .storage
        .list_dots_for_user(&tenant_id, auth.requesting_user.as_str(), limit, offset)
        .await?;

    let dot_values: Vec<serde_json::Value> = dots
        .iter()
        .map(|d| serde_json::to_value(d).unwrap())
        .collect();

    Ok(Json(ListDotsResponse {
        total: dot_values.len(),
        dots: dot_values,
        has_more,
        limit,
        offset,
    }))
}

/// POST /dots/:dotId/grants — Grant access
pub async fn grant_access(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(dot_id): Path<String>,
    Json(req): Json<GrantAccessRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (tenant_id, auth) = extract_auth(&headers)?;

    if req.user_ids.is_empty() && req.scope_ids.is_empty() {
        return Err(AppError::bad_request(
            "At least one entry in user_ids or scope_ids is required",
        ));
    }

    let dot = state
        .storage
        .get_dot(&tenant_id, &dot_id)
        .await?
        .ok_or_else(|| AppError::not_found("Dot not found"))?;

    let existing_grants = state.storage.get_grants(&tenant_id, &dot_id).await?;

    let result = commands::grant_access(
        &dot,
        &existing_grants,
        req.user_ids.into_iter().map(|u| UserId::new(&u)).collect(),
        req.scope_ids
            .into_iter()
            .map(|s| ScopeId::new(&s))
            .collect(),
        &auth,
        &SystemClock,
    )?;

    // Ensure new grantees exist
    let now = chrono_now();
    for grant in &result.grants {
        if let Some(ref uid) = grant.user_id {
            state
                .storage
                .ensure_user(uid.as_str(), &tenant_id, &now)
                .await?;
        }
        if let Some(ref sid) = grant.scope_id {
            state
                .storage
                .ensure_scope(sid.as_str(), &tenant_id, &now)
                .await?;
        }
    }

    state.storage.store_grants(&result.grants).await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "grants": serde_json::to_value(&result.grants).unwrap(),
            "grants_count": result.grants.len(),
        })),
    ))
}

/// GET /dots/:dotId/grants — List grants
pub async fn get_grants(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(dot_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (tenant_id, auth) = extract_auth(&headers)?;

    let dot = state
        .storage
        .get_dot(&tenant_id, &dot_id)
        .await?
        .ok_or_else(|| AppError::not_found("Dot not found"))?;

    let grants = state.storage.get_grants(&tenant_id, &dot_id).await?;
    let can_view = dot.created_by == auth.requesting_user
        || grants
            .iter()
            .any(|g| g.user_id.as_ref() == Some(&auth.requesting_user));

    if !can_view {
        return Err(AppError::forbidden(
            "You do not have permission to view grants for this dot",
        ));
    }

    Ok(Json(serde_json::json!({ "grants": grants })))
}

/// POST /dots/:dotId/links — Create a link
pub async fn create_link(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(from_dot_id): Path<String>,
    Json(req): Json<CreateLinkRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (tenant_id, auth) = extract_auth(&headers)?;

    let valid_types = ["followup", "corrects", "supersedes", "related"];
    if !valid_types.contains(&req.link_type.as_str()) {
        return Err(AppError::bad_request(format!(
            "Invalid link_type '{}'. Must be one of: {}",
            req.link_type,
            valid_types.join(", ")
        )));
    }

    let from_dot = state
        .storage
        .get_dot(&tenant_id, &from_dot_id)
        .await?
        .ok_or_else(|| AppError::not_found("Source dot not found"))?;

    let to_dot = state
        .storage
        .get_dot(&tenant_id, &req.to_dot_id)
        .await?
        .ok_or_else(|| AppError::not_found("Target dot not found"))?;

    let from_grants = state.storage.get_grants(&tenant_id, &from_dot_id).await?;
    let to_grants = state.storage.get_grants(&tenant_id, &req.to_dot_id).await?;
    let existing_links = state.storage.get_links(&tenant_id, &from_dot_id).await?;

    let link_type: LinkType = match req.link_type.as_str() {
        "followup" => LinkType::Followup,
        "corrects" => LinkType::Corrects,
        "supersedes" => LinkType::Supersedes,
        _ => LinkType::Related,
    };

    let result = commands::create_link(
        &from_dot,
        &to_dot,
        link_type,
        LinkGrants {
            from: &from_grants,
            to: &to_grants,
        },
        &existing_links,
        &auth,
        &SystemClock,
    )?;

    state.storage.store_link(&result.link, &tenant_id).await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "link": result.link })),
    ))
}

/// GET /dots/:dotId/links — List links
pub async fn get_links(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(dot_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (tenant_id, auth) = extract_auth(&headers)?;

    let dot = state
        .storage
        .get_dot(&tenant_id, &dot_id)
        .await?
        .ok_or_else(|| AppError::not_found("Dot not found"))?;

    let grants = state.storage.get_grants(&tenant_id, &dot_id).await?;
    let can_view = dot.created_by == auth.requesting_user
        || grants
            .iter()
            .any(|g| g.user_id.as_ref() == Some(&auth.requesting_user));

    if !can_view {
        return Err(AppError::forbidden(
            "You do not have permission to view this dot",
        ));
    }

    let links = state.storage.get_links(&tenant_id, &dot_id).await?;
    Ok(Json(serde_json::json!({ "links": links })))
}
