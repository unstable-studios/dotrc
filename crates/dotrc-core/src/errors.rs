use thiserror::Error;

/// Core error types for DotRC operations
#[derive(Debug, Error, PartialEq, Eq)]
pub enum DotrcError {
    #[error("validation error: {0}")]
    Validation(#[from] ValidationError),

    #[error("authorization error: {0}")]
    Authorization(#[from] AuthorizationError),

    #[error("invalid link: {0}")]
    InvalidLink(#[from] InvalidLinkError),

    #[error("not implemented")]
    NotImplemented,
}

/// Validation errors for dot content
#[derive(Debug, Error, PartialEq, Eq)]
pub enum ValidationError {
    #[error("title is required")]
    TitleRequired,

    #[error("title too long: {length} characters (max: {max})")]
    TitleTooLong { length: usize, max: usize },

    #[error("title is empty after normalization")]
    TitleEmpty,

    #[error("body too long: {length} characters (max: {max})")]
    BodyTooLong { length: usize, max: usize },

    #[error("tag is empty")]
    TagEmpty,

    #[error("tag too long: {length} characters (max: {max})")]
    TagTooLong { length: usize, max: usize },

    #[error("tag contains invalid characters: {tag}")]
    TagInvalidCharacters { tag: String },

    #[error("too many tags: {count} (max: {max})")]
    TooManyTags { count: usize, max: usize },

    #[error("too many attachments: {count} (max: {max})")]
    TooManyAttachments { count: usize, max: usize },

    #[error("attachment filename is empty")]
    AttachmentFilenameEmpty,

    #[error("attachment size exceeds limit: {size} bytes (max: {max} bytes)")]
    AttachmentTooLarge { size: u64, max: u64 },

    #[error("invalid content hash format: {hash}")]
    InvalidContentHash { hash: String },

    #[error("visibility grants required: must specify at least one user or scope")]
    VisibilityRequired,
}

/// Authorization/permission errors
#[derive(Debug, Error, PartialEq, Eq)]
pub enum AuthorizationError {
    #[error("user {user_id} cannot view dot {dot_id}")]
    CannotViewDot { user_id: String, dot_id: String },

    #[error("user {user_id} cannot grant access to dot {dot_id}")]
    CannotGrantAccess { user_id: String, dot_id: String },

    #[error("user {user_id} cannot create links for dot {dot_id}")]
    CannotCreateLink { user_id: String, dot_id: String },

    #[error("user {user_id} is not a member of scope {scope_id}")]
    NotScopeMember { user_id: String, scope_id: String },

    #[error("permission denied")]
    PermissionDenied,
}

/// Link validation errors
#[derive(Debug, Error, PartialEq, Eq)]
pub enum InvalidLinkError {
    #[error("cannot link dot to itself: {dot_id}")]
    SelfReference { dot_id: String },

    #[error("source dot {from_dot_id} does not exist")]
    SourceDotNotFound { from_dot_id: String },

    #[error("target dot {to_dot_id} does not exist")]
    TargetDotNotFound { to_dot_id: String },

    #[error("link already exists: {from_dot_id} -> {to_dot_id} ({link_type})")]
    LinkAlreadyExists {
        from_dot_id: String,
        to_dot_id: String,
        link_type: String,
    },

    #[error("cannot create {link_type} link across different tenants")]
    CrossTenantLink { link_type: String },
}

pub type Result<T> = std::result::Result<T, DotrcError>;

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
