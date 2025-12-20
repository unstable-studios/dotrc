use serde::{Deserialize, Serialize};
use std::fmt;

/// Timestamp in RFC3339 format (UTC)
pub type Timestamp = String;

/// Unique identifier for a tenant (multi-tenancy)
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TenantId(pub String);

impl TenantId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for TenantId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Unique identifier for a user (internal UUID)
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct UserId(pub String);

impl UserId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for UserId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Unique identifier for a scope (channel, project, team, etc.)
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ScopeId(pub String);

impl ScopeId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for ScopeId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Unique identifier for a dot
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct DotId(pub String);

impl DotId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for DotId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Types of directed links between dots
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LinkType {
    /// This dot follows up on the target dot
    Followup,
    /// This dot corrects information in the target dot
    Corrects,
    /// This dot supersedes the target dot (most recent version)
    Supersedes,
    /// This dot is related to the target dot
    Related,
}

impl fmt::Display for LinkType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LinkType::Followup => write!(f, "followup"),
            LinkType::Corrects => write!(f, "corrects"),
            LinkType::Supersedes => write!(f, "supersedes"),
            LinkType::Related => write!(f, "related"),
        }
    }
}

/// A directed link from one dot to another
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Link {
    /// Source dot (this dot)
    pub from_dot_id: DotId,
    /// Target dot
    pub to_dot_id: DotId,
    /// Type of relationship
    pub link_type: LinkType,
    /// When this link was created
    pub created_at: Timestamp,
}

/// A sparse, optional tag for grouping dots
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Tag(pub String);

impl Tag {
    pub fn new(tag: impl Into<String>) -> Self {
        Self(tag.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Tag {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Reference to an attachment (metadata only, not content)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AttachmentRef {
    /// Unique identifier for this attachment
    pub id: String,
    /// Original filename
    pub filename: String,
    /// MIME type
    pub mime_type: String,
    /// Size in bytes
    pub size_bytes: u64,
    /// Content hash (for integrity)
    pub content_hash: String,
    /// When this attachment was added
    pub created_at: Timestamp,
}

/// Visibility grant - either snapshot at creation or explicit grant
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VisibilityGrant {
    /// Which dot this grant applies to
    pub dot_id: DotId,
    /// User being granted access (if user-specific)
    pub user_id: Option<UserId>,
    /// Scope being granted access (if scope-based)
    pub scope_id: Option<ScopeId>,
    /// When this grant was created
    pub granted_at: Timestamp,
    /// Who granted this access (None for initial snapshot)
    pub granted_by: Option<UserId>,
}

/// An immutable dot - the core fact record
/// NEVER edited or deleted after creation
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Dot {
    /// Unique identifier
    pub id: DotId,
    /// Which tenant owns this dot
    pub tenant_id: TenantId,
    /// Title (required, normalized)
    pub title: String,
    /// Optional body content
    pub body: Option<String>,
    /// Who created this dot
    pub created_by: UserId,
    /// When this dot was created (immutable timestamp)
    pub created_at: Timestamp,
    /// Scope this dot was created in (optional)
    pub scope_id: Option<ScopeId>,
    /// Sparse tags for grouping
    pub tags: Vec<Tag>,
    /// References to attachments
    pub attachments: Vec<AttachmentRef>,
}

/// Draft input for creating a dot (pre-validation)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DotDraft {
    /// Title (will be normalized)
    pub title: String,
    /// Optional body
    pub body: Option<String>,
    /// Creator
    pub created_by: UserId,
    /// Tenant
    pub tenant_id: TenantId,
    /// Optional scope
    pub scope_id: Option<ScopeId>,
    /// Initial tags
    pub tags: Vec<String>,
    /// Initial visibility: user IDs who can see this
    pub visible_to_users: Vec<UserId>,
    /// Initial visibility: scope IDs where this is visible
    pub visible_to_scopes: Vec<ScopeId>,
    /// Attachment references (already uploaded/validated elsewhere)
    pub attachments: Vec<AttachmentRef>,
}

/// Trait for generating timestamps (dependency injection)
pub trait Clock {
    fn now(&self) -> Timestamp;
}

/// Trait for generating unique IDs (dependency injection)
pub trait IdGen {
    fn generate_dot_id(&self) -> DotId;
    fn generate_attachment_id(&self) -> String;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tenant_id_creation() {
        let id = TenantId::new("tenant-123");
        assert_eq!(id.as_str(), "tenant-123");
        assert_eq!(id.to_string(), "tenant-123");
    }

    #[test]
    fn test_user_id_creation() {
        let id = UserId::new("user-abc");
        assert_eq!(id.as_str(), "user-abc");
        assert_eq!(id.to_string(), "user-abc");
    }

    #[test]
    fn test_scope_id_creation() {
        let id = ScopeId::new("scope-xyz");
        assert_eq!(id.as_str(), "scope-xyz");
        assert_eq!(id.to_string(), "scope-xyz");
    }

    #[test]
    fn test_dot_id_creation() {
        let id = DotId::new("dot-001");
        assert_eq!(id.as_str(), "dot-001");
        assert_eq!(id.to_string(), "dot-001");
    }

    #[test]
    fn test_tag_creation() {
        let tag = Tag::new("important");
        assert_eq!(tag.as_str(), "important");
        assert_eq!(tag.to_string(), "important");
    }

    #[test]
    fn test_link_type_display() {
        assert_eq!(LinkType::Followup.to_string(), "followup");
        assert_eq!(LinkType::Corrects.to_string(), "corrects");
        assert_eq!(LinkType::Supersedes.to_string(), "supersedes");
        assert_eq!(LinkType::Related.to_string(), "related");
    }

    #[test]
    fn test_link_creation() {
        let link = Link {
            from_dot_id: DotId::new("dot-1"),
            to_dot_id: DotId::new("dot-2"),
            link_type: LinkType::Followup,
            created_at: "2025-12-20T12:00:00Z".to_string(),
        };
        assert_eq!(link.from_dot_id.as_str(), "dot-1");
        assert_eq!(link.to_dot_id.as_str(), "dot-2");
        assert_eq!(link.link_type, LinkType::Followup);
    }

    #[test]
    fn test_attachment_ref_creation() {
        let attachment = AttachmentRef {
            id: "att-123".to_string(),
            filename: "document.pdf".to_string(),
            mime_type: "application/pdf".to_string(),
            size_bytes: 1024,
            content_hash: "sha256:abc123".to_string(),
            created_at: "2025-12-20T12:00:00Z".to_string(),
        };
        assert_eq!(attachment.filename, "document.pdf");
        assert_eq!(attachment.size_bytes, 1024);
    }

    #[test]
    fn test_visibility_grant_user_only() {
        let grant = VisibilityGrant {
            dot_id: DotId::new("dot-1"),
            user_id: Some(UserId::new("user-1")),
            scope_id: None,
            granted_at: "2025-12-20T12:00:00Z".to_string(),
            granted_by: None,
        };
        assert!(grant.user_id.is_some());
        assert!(grant.scope_id.is_none());
        assert!(grant.granted_by.is_none()); // Initial snapshot
    }

    #[test]
    fn test_visibility_grant_scope_only() {
        let grant = VisibilityGrant {
            dot_id: DotId::new("dot-1"),
            user_id: None,
            scope_id: Some(ScopeId::new("scope-1")),
            granted_at: "2025-12-20T12:00:00Z".to_string(),
            granted_by: None,
        };
        assert!(grant.user_id.is_none());
        assert!(grant.scope_id.is_some());
    }

    #[test]
    fn test_visibility_grant_explicit() {
        let grant = VisibilityGrant {
            dot_id: DotId::new("dot-1"),
            user_id: Some(UserId::new("user-2")),
            scope_id: None,
            granted_at: "2025-12-20T12:00:00Z".to_string(),
            granted_by: Some(UserId::new("user-1")), // Explicit grant by someone
        };
        assert!(grant.granted_by.is_some());
    }

    #[test]
    fn test_dot_immutability_structure() {
        // Dot has no mutable fields - this test verifies the structure
        let dot = Dot {
            id: DotId::new("dot-1"),
            tenant_id: TenantId::new("tenant-1"),
            title: "Test Dot".to_string(),
            body: Some("Body content".to_string()),
            created_by: UserId::new("user-1"),
            created_at: "2025-12-20T12:00:00Z".to_string(),
            scope_id: Some(ScopeId::new("scope-1")),
            tags: vec![Tag::new("test")],
            attachments: vec![],
        };

        // Verify immutable fields exist
        assert_eq!(dot.id.as_str(), "dot-1");
        assert_eq!(dot.title, "Test Dot");
        // Note: No updated_at, no status, no is_deleted - these violate immutability
    }

    #[test]
    fn test_dot_draft_creation() {
        let draft = DotDraft {
            title: "Draft title".to_string(),
            body: Some("Draft body".to_string()),
            created_by: UserId::new("user-1"),
            tenant_id: TenantId::new("tenant-1"),
            scope_id: Some(ScopeId::new("scope-1")),
            tags: vec!["tag1".to_string(), "tag2".to_string()],
            visible_to_users: vec![UserId::new("user-1"), UserId::new("user-2")],
            visible_to_scopes: vec![ScopeId::new("scope-1")],
            attachments: vec![],
        };

        assert_eq!(draft.title, "Draft title");
        assert_eq!(draft.tags.len(), 2);
        assert_eq!(draft.visible_to_users.len(), 2);
    }

    #[test]
    fn test_ids_are_hashable() {
        use std::collections::HashSet;

        let mut set = HashSet::new();
        set.insert(DotId::new("dot-1"));
        set.insert(DotId::new("dot-2"));
        set.insert(DotId::new("dot-1")); // Duplicate

        assert_eq!(set.len(), 2); // Only unique IDs
    }

    #[test]
    fn test_ids_equality() {
        let id1 = DotId::new("dot-1");
        let id2 = DotId::new("dot-1");
        let id3 = DotId::new("dot-2");

        assert_eq!(id1, id2);
        assert_ne!(id1, id3);
    }
}
