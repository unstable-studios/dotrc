use crate::errors::{ValidationError, Result};
use crate::types::Tag;

/// Maximum title length (characters)
pub const MAX_TITLE_LENGTH: usize = 200;

/// Maximum body length (characters)
pub const MAX_BODY_LENGTH: usize = 50_000;

/// Maximum tag length (characters)
pub const MAX_TAG_LENGTH: usize = 50;

/// Maximum number of tags per dot
pub const MAX_TAGS: usize = 20;

/// Maximum number of attachments per dot
pub const MAX_ATTACHMENTS: usize = 10;

/// Maximum attachment size (bytes) - 50MB
pub const MAX_ATTACHMENT_SIZE: u64 = 50 * 1024 * 1024;

/// Normalize and validate a title
/// - Trims whitespace
/// - Ensures non-empty after trim
/// - Enforces length limit
pub fn normalize_title(title: &str) -> Result<String> {
    let normalized = title.trim();
    
    if normalized.is_empty() {
        return Err(ValidationError::TitleEmpty.into());
    }
    
    if normalized.len() > MAX_TITLE_LENGTH {
        return Err(ValidationError::TitleTooLong {
            length: normalized.len(),
            max: MAX_TITLE_LENGTH,
        }.into());
    }
    
    Ok(normalized.to_string())
}

/// Normalize and validate a body (optional)
/// - Trims whitespace if present
/// - Enforces length limit
/// - Returns None if empty after trim
pub fn normalize_body(body: Option<&str>) -> Result<Option<String>> {
    match body {
        None => Ok(None),
        Some(text) => {
            let normalized = text.trim();
            
            if normalized.is_empty() {
                return Ok(None);
            }
            
            if normalized.len() > MAX_BODY_LENGTH {
                return Err(ValidationError::BodyTooLong {
                    length: normalized.len(),
                    max: MAX_BODY_LENGTH,
                }.into());
            }
            
            Ok(Some(normalized.to_string()))
        }
    }
}

/// Normalize and validate a tag
/// - Converts to lowercase
/// - Trims whitespace
/// - Validates format (alphanumeric, hyphens, underscores only)
/// - Enforces length limit
pub fn normalize_tag(tag: &str) -> Result<Tag> {
    let normalized = tag.trim().to_lowercase();
    
    if normalized.is_empty() {
        return Err(ValidationError::TagEmpty.into());
    }
    
    if normalized.len() > MAX_TAG_LENGTH {
        return Err(ValidationError::TagTooLong {
            length: normalized.len(),
            max: MAX_TAG_LENGTH,
        }.into());
    }
    
    // Tags must be alphanumeric with optional hyphens/underscores
    if !normalized.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(ValidationError::TagInvalidCharacters {
            tag: tag.to_string(),
        }.into());
    }
    
    Ok(Tag::new(normalized))
}

/// Normalize and validate a list of tags
/// - Normalizes each tag
/// - Removes duplicates
/// - Enforces maximum count
pub fn normalize_tags(tags: &[String]) -> Result<Vec<Tag>> {
    if tags.len() > MAX_TAGS {
        return Err(ValidationError::TooManyTags {
            count: tags.len(),
            max: MAX_TAGS,
        }.into());
    }
    
    let mut normalized = Vec::new();
    let mut seen = std::collections::HashSet::new();
    
    for tag in tags {
        let normalized_tag = normalize_tag(tag)?;
        
        // Skip duplicates (case-insensitive)
        if seen.insert(normalized_tag.as_str().to_string()) {
            normalized.push(normalized_tag);
        }
    }
    
    Ok(normalized)
}

/// Validate attachment filename
/// - Must not be empty
/// - No directory separators
pub fn validate_attachment_filename(filename: &str) -> Result<()> {
    let trimmed = filename.trim();
    
    if trimmed.is_empty() {
        return Err(ValidationError::AttachmentFilenameEmpty.into());
    }
    
    // Prevent directory traversal
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err(ValidationError::AttachmentFilenameEmpty.into());
    }
    
    Ok(())
}

/// Validate attachment size
pub fn validate_attachment_size(size_bytes: u64) -> Result<()> {
    if size_bytes > MAX_ATTACHMENT_SIZE {
        return Err(ValidationError::AttachmentTooLarge {
            size: size_bytes,
            max: MAX_ATTACHMENT_SIZE,
        }.into());
    }
    Ok(())
}

/// Validate content hash format
/// Expected format: "algorithm:hash" (e.g., "sha256:abc123...")
pub fn validate_content_hash(hash: &str) -> Result<()> {
    if !hash.contains(':') {
        return Err(ValidationError::InvalidContentHash {
            hash: hash.to_string(),
        }.into());
    }
    
    let parts: Vec<&str> = hash.split(':').collect();
    if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() {
        return Err(ValidationError::InvalidContentHash {
            hash: hash.to_string(),
        }.into());
    }
    
    Ok(())
}

/// Validate that at least one visibility target is provided
pub fn validate_visibility_required(user_count: usize, scope_count: usize) -> Result<()> {
    if user_count == 0 && scope_count == 0 {
        return Err(ValidationError::VisibilityRequired.into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_title_valid() {
        let result = normalize_title("  Hello World  ");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Hello World");
    }

    #[test]
    fn test_normalize_title_empty() {
        let result = normalize_title("   ");
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), 
            crate::errors::DotrcError::Validation(ValidationError::TitleEmpty)));
    }

    #[test]
    fn test_normalize_title_too_long() {
        let long_title = "a".repeat(MAX_TITLE_LENGTH + 1);
        let result = normalize_title(&long_title);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), 
            crate::errors::DotrcError::Validation(ValidationError::TitleTooLong { .. })));
    }

    #[test]
    fn test_normalize_title_at_limit() {
        let title = "a".repeat(MAX_TITLE_LENGTH);
        let result = normalize_title(&title);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), MAX_TITLE_LENGTH);
    }

    #[test]
    fn test_normalize_body_none() {
        let result = normalize_body(None);
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_normalize_body_empty_string() {
        let result = normalize_body(Some("   "));
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_normalize_body_valid() {
        let result = normalize_body(Some("  Body content  "));
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), Some("Body content".to_string()));
    }

    #[test]
    fn test_normalize_body_too_long() {
        let long_body = "a".repeat(MAX_BODY_LENGTH + 1);
        let result = normalize_body(Some(&long_body));
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), 
            crate::errors::DotrcError::Validation(ValidationError::BodyTooLong { .. })));
    }

    #[test]
    fn test_normalize_tag_valid() {
        let result = normalize_tag("  Important  ");
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), "important");
    }

    #[test]
    fn test_normalize_tag_with_hyphen() {
        let result = normalize_tag("high-priority");
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), "high-priority");
    }

    #[test]
    fn test_normalize_tag_with_underscore() {
        let result = normalize_tag("bug_fix");
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), "bug_fix");
    }

    #[test]
    fn test_normalize_tag_empty() {
        let result = normalize_tag("   ");
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), 
            crate::errors::DotrcError::Validation(ValidationError::TagEmpty)));
    }

    #[test]
    fn test_normalize_tag_too_long() {
        let long_tag = "a".repeat(MAX_TAG_LENGTH + 1);
        let result = normalize_tag(&long_tag);
        assert!(result.is_err());
    }

    #[test]
    fn test_normalize_tag_invalid_characters() {
        let result = normalize_tag("invalid tag!");
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), 
            crate::errors::DotrcError::Validation(ValidationError::TagInvalidCharacters { .. })));
    }

    #[test]
    fn test_normalize_tag_spaces_invalid() {
        let result = normalize_tag("two words");
        assert!(result.is_err());
    }

    #[test]
    fn test_normalize_tags_valid() {
        let tags = vec!["important".to_string(), "bug".to_string()];
        let result = normalize_tags(&tags);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 2);
    }

    #[test]
    fn test_normalize_tags_removes_duplicates() {
        let tags = vec![
            "Important".to_string(),
            "important".to_string(),
            "IMPORTANT".to_string(),
            "bug".to_string(),
        ];
        let result = normalize_tags(&tags);
        assert!(result.is_ok());
        let normalized = result.unwrap();
        assert_eq!(normalized.len(), 2); // Only unique tags
    }

    #[test]
    fn test_normalize_tags_too_many() {
        let tags: Vec<String> = (0..=MAX_TAGS).map(|i| format!("tag{}", i)).collect();
        let result = normalize_tags(&tags);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), 
            crate::errors::DotrcError::Validation(ValidationError::TooManyTags { .. })));
    }

    #[test]
    fn test_normalize_tags_at_limit() {
        let tags: Vec<String> = (0..MAX_TAGS).map(|i| format!("tag{}", i)).collect();
        let result = normalize_tags(&tags);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), MAX_TAGS);
    }

    #[test]
    fn test_validate_attachment_filename_valid() {
        let result = validate_attachment_filename("document.pdf");
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_attachment_filename_empty() {
        let result = validate_attachment_filename("   ");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_attachment_filename_with_slash() {
        let result = validate_attachment_filename("../secret.txt");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_attachment_filename_with_backslash() {
        let result = validate_attachment_filename("..\\secret.txt");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_attachment_size_valid() {
        let result = validate_attachment_size(1024);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_attachment_size_at_limit() {
        let result = validate_attachment_size(MAX_ATTACHMENT_SIZE);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_attachment_size_too_large() {
        let result = validate_attachment_size(MAX_ATTACHMENT_SIZE + 1);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_content_hash_valid() {
        let result = validate_content_hash("sha256:abc123def456");
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_content_hash_no_colon() {
        let result = validate_content_hash("sha256abc123");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_content_hash_empty_algorithm() {
        let result = validate_content_hash(":abc123");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_content_hash_empty_hash() {
        let result = validate_content_hash("sha256:");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_visibility_required_both_empty() {
        let result = validate_visibility_required(0, 0);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_visibility_required_users_only() {
        let result = validate_visibility_required(1, 0);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_visibility_required_scopes_only() {
        let result = validate_visibility_required(0, 1);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_visibility_required_both() {
        let result = validate_visibility_required(1, 1);
        assert!(result.is_ok());
    }
}
