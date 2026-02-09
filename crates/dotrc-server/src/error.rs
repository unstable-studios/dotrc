use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use dotrc_core::errors::{DotrcError, DotrcErrorKind};
use serde::Serialize;

/// JSON error body returned by the API.
#[derive(Debug, Serialize)]
pub struct ApiError {
    pub error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    pub detail: String,
}

impl ApiError {
    pub fn new(error: impl Into<String>, detail: impl Into<String>) -> Self {
        Self {
            error: error.into(),
            kind: None,
            detail: detail.into(),
        }
    }

    pub fn with_kind(mut self, kind: impl Into<String>) -> Self {
        self.kind = Some(kind.into());
        self
    }
}

/// Application error type that converts to HTTP responses.
pub struct AppError {
    pub status: StatusCode,
    pub body: ApiError,
}

impl AppError {
    pub fn bad_request(detail: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            body: ApiError::new("invalid_body", detail),
        }
    }

    pub fn unauthorized() -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            body: ApiError::new("unauthorized", "No valid authentication provided"),
        }
    }

    pub fn not_found(detail: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            body: ApiError::new("not_found", detail),
        }
    }

    pub fn forbidden(detail: impl Into<String>) -> Self {
        Self {
            status: StatusCode::FORBIDDEN,
            body: ApiError::new("forbidden", detail),
        }
    }

    pub fn internal(detail: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            body: ApiError::new("internal_error", detail),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (self.status, Json(self.body)).into_response()
    }
}

/// Convert a dotrc-core error into an AppError.
impl From<DotrcError> for AppError {
    fn from(err: DotrcError) -> Self {
        let kind = err.kind();
        let message = err.to_string();

        let (status, error_code) = match kind {
            DotrcErrorKind::Validation => (StatusCode::BAD_REQUEST, "validation_failed"),
            DotrcErrorKind::Authorization => (StatusCode::FORBIDDEN, "forbidden"),
            DotrcErrorKind::Link => (StatusCode::CONFLICT, "link_error"),
            DotrcErrorKind::ServerError => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
        };

        let detail = if status.is_server_error() {
            "Request processing failed".to_string()
        } else {
            message
        };

        Self {
            status,
            body: ApiError::new(error_code, detail).with_kind(format!("{kind:?}")),
        }
    }
}

/// Convert sqlx errors into AppError.
impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        tracing::error!(error = %err, "Database error");
        Self::internal("Database operation failed")
    }
}
