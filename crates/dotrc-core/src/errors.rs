#[cfg(feature = "std")]
use thiserror::Error;

#[cfg(not(feature = "std"))]
use alloc::string::String;

#[cfg(not(feature = "std"))]
use core::fmt;

/// Core error types for DotRC operations
#[cfg_attr(feature = "std", derive(Error))]
#[derive(Debug, PartialEq, Eq)]
pub enum DotrcError {
    #[cfg_attr(feature = "std", error("validation error: {0}"))]
    Validation(ValidationError),

    #[cfg_attr(feature = "std", error("authorization error: {0}"))]
    Authorization(AuthorizationError),

    #[cfg_attr(feature = "std", error("invalid link: {0}"))]
    InvalidLink(InvalidLinkError),

    #[cfg_attr(feature = "std", error("not implemented"))]
    NotImplemented,
}

/// Validation errors for dot content
#[cfg_attr(feature = "std", derive(Error))]
#[derive(Debug, PartialEq, Eq)]
pub enum ValidationError {
    #[cfg_attr(feature = "std", error("title is required"))]
    TitleRequired,

    #[cfg_attr(
        feature = "std",
        error("title too long: {length} characters (max: {max})")
    )]
    TitleTooLong { length: usize, max: usize },

    #[cfg_attr(feature = "std", error("title is empty after normalization"))]
    TitleEmpty,

    #[cfg_attr(
        feature = "std",
        error("body too long: {length} characters (max: {max})")
    )]
    BodyTooLong { length: usize, max: usize },

    #[cfg_attr(feature = "std", error("tag is empty"))]
    TagEmpty,

    #[cfg_attr(
        feature = "std",
        error("tag too long: {length} characters (max: {max})")
    )]
    TagTooLong { length: usize, max: usize },

    #[cfg_attr(feature = "std", error("tag contains invalid characters: {tag}"))]
    TagInvalidCharacters { tag: String },

    #[cfg_attr(feature = "std", error("too many tags: {count} (max: {max})"))]
    TooManyTags { count: usize, max: usize },

    #[cfg_attr(feature = "std", error("too many attachments: {count} (max: {max})"))]
    TooManyAttachments { count: usize, max: usize },

    #[cfg_attr(feature = "std", error("attachment filename is empty"))]
    AttachmentFilenameEmpty,

    #[cfg_attr(
        feature = "std",
        error("attachment size exceeds limit: {size} bytes (max: {max} bytes)")
    )]
    AttachmentTooLarge { size: u64, max: u64 },

    #[cfg_attr(feature = "std", error("invalid content hash format: {hash}"))]
    InvalidContentHash { hash: String },

    #[cfg_attr(
        feature = "std",
        error("visibility grants required: must specify at least one user or scope")
    )]
    VisibilityRequired,
}

/// Authorization/permission errors
#[cfg_attr(feature = "std", derive(Error))]
#[derive(Debug, PartialEq, Eq)]
pub enum AuthorizationError {
    #[cfg_attr(feature = "std", error("user {user_id} cannot view dot {dot_id}"))]
    CannotViewDot { user_id: String, dot_id: String },

    #[cfg_attr(
        feature = "std",
        error("user {user_id} cannot grant access to dot {dot_id}")
    )]
    CannotGrantAccess { user_id: String, dot_id: String },

    #[cfg_attr(
        feature = "std",
        error("user {user_id} cannot create links for dot {dot_id}")
    )]
    CannotCreateLink { user_id: String, dot_id: String },

    #[cfg_attr(
        feature = "std",
        error("user {user_id} is not a member of scope {scope_id}")
    )]
    NotScopeMember { user_id: String, scope_id: String },

    #[cfg_attr(feature = "std", error("permission denied"))]
    PermissionDenied,
}

/// Link validation errors
#[cfg_attr(feature = "std", derive(Error))]
#[derive(Debug, PartialEq, Eq)]
pub enum InvalidLinkError {
    #[cfg_attr(feature = "std", error("cannot link dot to itself: {dot_id}"))]
    SelfReference { dot_id: String },

    #[cfg_attr(feature = "std", error("source dot {from_dot_id} does not exist"))]
    SourceDotNotFound { from_dot_id: String },

    #[cfg_attr(feature = "std", error("target dot {to_dot_id} does not exist"))]
    TargetDotNotFound { to_dot_id: String },

    #[cfg_attr(
        feature = "std",
        error("link already exists: {from_dot_id} -> {to_dot_id} ({link_type})")
    )]
    LinkAlreadyExists {
        from_dot_id: String,
        to_dot_id: String,
        link_type: String,
    },

    #[cfg_attr(
        feature = "std",
        error("cannot create {link_type} link across different tenants")
    )]
    CrossTenantLink { link_type: String },
}

pub type Result<T> = core::result::Result<T, DotrcError>;

// Manual From implementations (thiserror doesn't auto-generate these without #[from])
impl From<ValidationError> for DotrcError {
    fn from(e: ValidationError) -> Self {
        DotrcError::Validation(e)
    }
}

impl From<AuthorizationError> for DotrcError {
    fn from(e: AuthorizationError) -> Self {
        DotrcError::Authorization(e)
    }
}

impl From<InvalidLinkError> for DotrcError {
    fn from(e: InvalidLinkError) -> Self {
        DotrcError::InvalidLink(e)
    }
}

// Manual Display implementations for no_std
#[cfg(not(feature = "std"))]
impl fmt::Display for DotrcError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DotrcError::Validation(e) => write!(f, "validation error: {}", e),
            DotrcError::Authorization(e) => write!(f, "authorization error: {}", e),
            DotrcError::InvalidLink(e) => write!(f, "invalid link: {}", e),
            DotrcError::NotImplemented => write!(f, "not implemented"),
        }
    }
}

#[cfg(not(feature = "std"))]
impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::TitleRequired => write!(f, "title is required"),
            ValidationError::TitleTooLong { length, max } => {
                write!(f, "title too long: {} characters (max: {})", length, max)
            }
            ValidationError::TitleEmpty => write!(f, "title is empty after normalization"),
            ValidationError::BodyTooLong { length, max } => {
                write!(f, "body too long: {} characters (max: {})", length, max)
            }
            ValidationError::TagEmpty => write!(f, "tag is empty"),
            ValidationError::TagTooLong { length, max } => {
                write!(f, "tag too long: {} characters (max: {})", length, max)
            }
            ValidationError::TagInvalidCharacters { tag } => {
                write!(f, "tag contains invalid characters: {}", tag)
            }
            ValidationError::TooManyTags { count, max } => {
                write!(f, "too many tags: {} (max: {})", count, max)
            }
            ValidationError::TooManyAttachments { count, max } => {
                write!(f, "too many attachments: {} (max: {})", count, max)
            }
            ValidationError::AttachmentFilenameEmpty => write!(f, "attachment filename is empty"),
            ValidationError::AttachmentTooLarge { size, max } => write!(
                f,
                "attachment size exceeds limit: {} bytes (max: {} bytes)",
                size, max
            ),
            ValidationError::InvalidContentHash { hash } => {
                write!(f, "invalid content hash format: {}", hash)
            }
            ValidationError::VisibilityRequired => write!(
                f,
                "visibility grants required: must specify at least one user or scope"
            ),
        }
    }
}

#[cfg(not(feature = "std"))]
impl fmt::Display for AuthorizationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AuthorizationError::CannotViewDot { user_id, dot_id } => {
                write!(f, "user {} cannot view dot {}", user_id, dot_id)
            }
            AuthorizationError::CannotGrantAccess { user_id, dot_id } => {
                write!(f, "user {} cannot grant access to dot {}", user_id, dot_id)
            }
            AuthorizationError::CannotCreateLink { user_id, dot_id } => {
                write!(f, "user {} cannot create links for dot {}", user_id, dot_id)
            }
            AuthorizationError::NotScopeMember { user_id, scope_id } => {
                write!(f, "user {} is not a member of scope {}", user_id, scope_id)
            }
            AuthorizationError::PermissionDenied => write!(f, "permission denied"),
        }
    }
}

#[cfg(not(feature = "std"))]
impl fmt::Display for InvalidLinkError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            InvalidLinkError::SelfReference { dot_id } => {
                write!(f, "cannot link dot to itself: {}", dot_id)
            }
            InvalidLinkError::SourceDotNotFound { from_dot_id } => {
                write!(f, "source dot {} does not exist", from_dot_id)
            }
            InvalidLinkError::TargetDotNotFound { to_dot_id } => {
                write!(f, "target dot {} does not exist", to_dot_id)
            }
            InvalidLinkError::LinkAlreadyExists {
                from_dot_id,
                to_dot_id,
                link_type,
            } => write!(
                f,
                "link already exists: {} -> {} ({})",
                from_dot_id, to_dot_id, link_type
            ),
            InvalidLinkError::CrossTenantLink { link_type } => write!(
                f,
                "cannot create {} link across different tenants",
                link_type
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validation_error_title_required() {
        let err = ValidationError::TitleRequired;
        assert_eq!(err.to_string(), "title is required");
    }

    #[test]
    fn test_validation_error_title_too_long() {
        let err = ValidationError::TitleTooLong {
            length: 300,
            max: 200,
        };
        assert_eq!(err.to_string(), "title too long: 300 characters (max: 200)");
    }

    #[test]
    fn test_validation_error_tag_invalid() {
        let err = ValidationError::TagInvalidCharacters {
            tag: "invalid tag!".to_string(),
        };
        assert!(err.to_string().contains("invalid characters"));
    }

    #[test]
    fn test_authorization_error_cannot_view() {
        let err = AuthorizationError::CannotViewDot {
            user_id: "user-1".to_string(),
            dot_id: "dot-1".to_string(),
        };
        assert!(err.to_string().contains("cannot view"));
        assert!(err.to_string().contains("user-1"));
        assert!(err.to_string().contains("dot-1"));
    }

    #[test]
    fn test_authorization_error_cannot_grant() {
        let err = AuthorizationError::CannotGrantAccess {
            user_id: "user-1".to_string(),
            dot_id: "dot-1".to_string(),
        };
        assert!(err.to_string().contains("cannot grant access"));
    }

    #[test]
    fn test_invalid_link_self_reference() {
        let err = InvalidLinkError::SelfReference {
            dot_id: "dot-1".to_string(),
        };
        assert!(err.to_string().contains("cannot link dot to itself"));
    }

    #[test]
    fn test_invalid_link_already_exists() {
        let err = InvalidLinkError::LinkAlreadyExists {
            from_dot_id: "dot-1".to_string(),
            to_dot_id: "dot-2".to_string(),
            link_type: "followup".to_string(),
        };
        assert!(err.to_string().contains("already exists"));
    }

    #[test]
    fn test_dotrc_error_from_validation() {
        let validation_err = ValidationError::TitleRequired;
        let dotrc_err: DotrcError = validation_err.into();
        assert!(matches!(dotrc_err, DotrcError::Validation(_)));
    }

    #[test]
    fn test_dotrc_error_from_authorization() {
        let auth_err = AuthorizationError::PermissionDenied;
        let dotrc_err: DotrcError = auth_err.into();
        assert!(matches!(dotrc_err, DotrcError::Authorization(_)));
    }

    #[test]
    fn test_dotrc_error_from_link() {
        let link_err = InvalidLinkError::SelfReference {
            dot_id: "dot-1".to_string(),
        };
        let dotrc_err: DotrcError = link_err.into();
        assert!(matches!(dotrc_err, DotrcError::InvalidLink(_)));
    }

    #[test]
    fn test_result_type_ok() {
        let result: Result<i32> = Ok(42);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
    }

    #[test]
    fn test_result_type_err() {
        let result: Result<i32> = Err(DotrcError::Validation(ValidationError::TitleRequired));
        assert!(result.is_err());
    }

    #[test]
    fn test_error_equality() {
        let err1 = ValidationError::TitleRequired;
        let err2 = ValidationError::TitleRequired;
        assert_eq!(err1, err2);
    }
}
