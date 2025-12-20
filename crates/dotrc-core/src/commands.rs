use crate::errors::{InvalidLinkError, Result};
use crate::normalize::{
    normalize_title, normalize_body, normalize_tags, 
    validate_visibility_required, validate_attachment_filename,
    validate_attachment_size, validate_content_hash,
};
use crate::policy::{AuthContext, can_grant_access, can_create_link};
use crate::types::{
    Clock, IdGen, Dot, DotDraft, Link, LinkType, 
    VisibilityGrant, UserId, ScopeId,
};

/// Write-set result from creating a dot
#[derive(Debug, Clone)]
pub struct CreateDotResult {
    pub dot: Dot,
    pub grants: Vec<VisibilityGrant>,
    pub links: Vec<Link>,
}

/// Write-set result from granting access
#[derive(Debug, Clone)]
pub struct GrantAccessResult {
    pub grants: Vec<VisibilityGrant>,
}

/// Write-set result from creating a link
#[derive(Debug, Clone)]
pub struct CreateLinkResult {
    pub link: Link,
}

/// Create a new dot from a draft
/// Returns the dot and associated records to persist
/// Validates and normalizes all inputs
pub fn create_dot<C: Clock, I: IdGen>(
    draft: DotDraft,
    clock: &C,
    id_gen: &I,
) -> Result<CreateDotResult> {
    // Validate visibility
    validate_visibility_required(
        draft.visible_to_users.len(),
        draft.visible_to_scopes.len(),
    )?;
    
    // Normalize inputs
    let title = normalize_title(&draft.title)?;
    let body = normalize_body(draft.body.as_deref())?;
    let tags = normalize_tags(&draft.tags)?;
    
    // Validate attachments
    for attachment in &draft.attachments {
        validate_attachment_filename(&attachment.filename)?;
        validate_attachment_size(attachment.size_bytes)?;
        validate_content_hash(&attachment.content_hash)?;
    }
    
    // Generate ID and timestamp
    let dot_id = id_gen.generate_dot_id();
    let now = clock.now();
    
    // Create the dot
    let dot = Dot {
        id: dot_id.clone(),
        tenant_id: draft.tenant_id,
        title,
        body,
        created_by: draft.created_by.clone(),
        created_at: now.clone(),
        scope_id: draft.scope_id,
        tags,
        attachments: draft.attachments,
    };
    
    // Create visibility grants (ACL snapshot at creation)
    let mut grants = Vec::new();
    
    for user_id in draft.visible_to_users {
        grants.push(VisibilityGrant {
            dot_id: dot_id.clone(),
            user_id: Some(user_id),
            scope_id: None,
            granted_at: now.clone(),
            granted_by: None, // Initial snapshot, not an explicit grant
        });
    }
    
    for scope_id in draft.visible_to_scopes {
        grants.push(VisibilityGrant {
            dot_id: dot_id.clone(),
            user_id: None,
            scope_id: Some(scope_id),
            granted_at: now.clone(),
            granted_by: None,
        });
    }
    
    Ok(CreateDotResult {
        dot,
        grants,
        links: vec![], // No links on creation
    })
}

/// Grant access to an existing dot
/// Returns new visibility grant records to persist
pub fn grant_access<C: Clock>(
    dot: &Dot,
    existing_grants: &[VisibilityGrant],
    target_users: Vec<UserId>,
    target_scopes: Vec<ScopeId>,
    context: &AuthContext,
    clock: &C,
) -> Result<GrantAccessResult> {
    // Verify the requesting user can grant access
    can_grant_access(dot, existing_grants, context)?;
    
    // Validate at least one target
    validate_visibility_required(target_users.len(), target_scopes.len())?;
    
    let now = clock.now();
    let mut grants = Vec::new();
    
    // Create user grants
    for user_id in target_users {
        // Skip if already granted
        let already_granted = existing_grants.iter().any(|g| {
            g.dot_id == dot.id && g.user_id.as_ref() == Some(&user_id)
        });
        
        if !already_granted {
            grants.push(VisibilityGrant {
                dot_id: dot.id.clone(),
                user_id: Some(user_id),
                scope_id: None,
                granted_at: now.clone(),
                granted_by: Some(context.requesting_user.clone()),
            });
        }
    }
    
    // Create scope grants
    for scope_id in target_scopes {
        let already_granted = existing_grants.iter().any(|g| {
            g.dot_id == dot.id && g.scope_id.as_ref() == Some(&scope_id)
        });
        
        if !already_granted {
            grants.push(VisibilityGrant {
                dot_id: dot.id.clone(),
                user_id: None,
                scope_id: Some(scope_id),
                granted_at: now.clone(),
                granted_by: Some(context.requesting_user.clone()),
            });
        }
    }
    
    Ok(GrantAccessResult { grants })
}

/// Create a link between two dots
/// Returns the link record to persist
pub fn create_link<C: Clock>(
    from_dot: &Dot,
    to_dot: &Dot,
    link_type: LinkType,
    from_grants: &[VisibilityGrant],
    to_grants: &[VisibilityGrant],
    existing_links: &[Link],
    context: &AuthContext,
    clock: &C,
) -> Result<CreateLinkResult> {
    // Validate not self-referential
    if from_dot.id == to_dot.id {
        return Err(InvalidLinkError::SelfReference {
            dot_id: from_dot.id.as_str().to_string(),
        }.into());
    }
    
    // Validate same tenant (no cross-tenant links)
    if from_dot.tenant_id != to_dot.tenant_id {
        return Err(InvalidLinkError::CrossTenantLink {
            link_type: link_type.to_string(),
        }.into());
    }
    
    // Check authorization
    can_create_link(from_dot, to_dot, from_grants, to_grants, context)?;
    
    // Check if link already exists
    let link_exists = existing_links.iter().any(|l| {
        l.from_dot_id == from_dot.id 
            && l.to_dot_id == to_dot.id 
            && l.link_type == link_type
    });
    
    if link_exists {
        return Err(InvalidLinkError::LinkAlreadyExists {
            from_dot_id: from_dot.id.as_str().to_string(),
            to_dot_id: to_dot.id.as_str().to_string(),
            link_type: link_type.to_string(),
        }.into());
    }
    
    // Create the link
    let link = Link {
        from_dot_id: from_dot.id.clone(),
        to_dot_id: to_dot.id.clone(),
        link_type,
        created_at: clock.now(),
    };
    
    Ok(CreateLinkResult { link })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{DotId, TenantId, Timestamp};
    
    // Test implementations of Clock and IdGen
    struct TestClock {
        time: String,
    }
    
    impl Clock for TestClock {
        fn now(&self) -> Timestamp {
            self.time.clone()
        }
    }
    
    struct TestIdGen {
        next_id: std::cell::RefCell<u32>,
    }
    
    impl TestIdGen {
        fn new() -> Self {
            Self { next_id: std::cell::RefCell::new(1) }
        }
    }
    
    impl IdGen for TestIdGen {
        fn generate_dot_id(&self) -> DotId {
            let id = *self.next_id.borrow();
            *self.next_id.borrow_mut() += 1;
            DotId::new(format!("dot-{}", id))
        }
        
        fn generate_attachment_id(&self) -> String {
            let id = *self.next_id.borrow();
            *self.next_id.borrow_mut() += 1;
            format!("att-{}", id)
        }
    }

    #[test]
    fn test_create_dot_valid() {
        let draft = DotDraft {
            title: "Test Dot".to_string(),
            body: Some("Body content".to_string()),
            created_by: UserId::new("user-1"),
            tenant_id: TenantId::new("tenant-1"),
            scope_id: Some(ScopeId::new("scope-1")),
            tags: vec!["important".to_string()],
            visible_to_users: vec![UserId::new("user-1")],
            visible_to_scopes: vec![ScopeId::new("scope-1")],
            attachments: vec![],
        };
        
        let clock = TestClock { time: "2025-12-20T12:00:00Z".to_string() };
        let id_gen = TestIdGen::new();
        
        let result = create_dot(draft, &clock, &id_gen);
        assert!(result.is_ok());
        
        let created = result.unwrap();
        assert_eq!(created.dot.title, "Test Dot");
        assert_eq!(created.dot.body, Some("Body content".to_string()));
        assert_eq!(created.grants.len(), 2); // 1 user + 1 scope
    }

    #[test]
    fn test_create_dot_normalizes_title() {
        let draft = DotDraft {
            title: "  Whitespace Title  ".to_string(),
            body: None,
            created_by: UserId::new("user-1"),
            tenant_id: TenantId::new("tenant-1"),
            scope_id: None,
            tags: vec![],
            visible_to_users: vec![UserId::new("user-1")],
            visible_to_scopes: vec![],
            attachments: vec![],
        };
        
        let clock = TestClock { time: "2025-12-20T12:00:00Z".to_string() };
        let id_gen = TestIdGen::new();
        
        let result = create_dot(draft, &clock, &id_gen);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().dot.title, "Whitespace Title");
    }

    #[test]
    fn test_create_dot_empty_title_fails() {
        let draft = DotDraft {
            title: "   ".to_string(),
            body: None,
            created_by: UserId::new("user-1"),
            tenant_id: TenantId::new("tenant-1"),
            scope_id: None,
            tags: vec![],
            visible_to_users: vec![UserId::new("user-1")],
            visible_to_scopes: vec![],
            attachments: vec![],
        };
        
        let clock = TestClock { time: "2025-12-20T12:00:00Z".to_string() };
        let id_gen = TestIdGen::new();
        
        let result = create_dot(draft, &clock, &id_gen);
        assert!(result.is_err());
    }

    #[test]
    fn test_create_dot_no_visibility_fails() {
        let draft = DotDraft {
            title: "Test".to_string(),
            body: None,
            created_by: UserId::new("user-1"),
            tenant_id: TenantId::new("tenant-1"),
            scope_id: None,
            tags: vec![],
            visible_to_users: vec![],
            visible_to_scopes: vec![],
            attachments: vec![],
        };
        
        let clock = TestClock { time: "2025-12-20T12:00:00Z".to_string() };
        let id_gen = TestIdGen::new();
        
        let result = create_dot(draft, &clock, &id_gen);
        assert!(result.is_err());
    }

    #[test]
    fn test_create_dot_normalizes_tags() {
        let draft = DotDraft {
            title: "Test".to_string(),
            body: None,
            created_by: UserId::new("user-1"),
            tenant_id: TenantId::new("tenant-1"),
            scope_id: None,
            tags: vec!["Important".to_string(), "URGENT".to_string()],
            visible_to_users: vec![UserId::new("user-1")],
            visible_to_scopes: vec![],
            attachments: vec![],
        };
        
        let clock = TestClock { time: "2025-12-20T12:00:00Z".to_string() };
        let id_gen = TestIdGen::new();
        
        let result = create_dot(draft, &clock, &id_gen);
        assert!(result.is_ok());
        
        let dot = result.unwrap().dot;
        assert_eq!(dot.tags[0].as_str(), "important");
        assert_eq!(dot.tags[1].as_str(), "urgent");
    }

    #[test]
    fn test_grant_access_creator() {
        let dot = Dot {
            id: DotId::new("dot-1"),
            tenant_id: TenantId::new("tenant-1"),
            title: "Test".to_string(),
            body: None,
            created_by: UserId::new("user-1"),
            created_at: "2025-12-20T12:00:00Z".to_string(),
            scope_id: None,
            tags: vec![],
            attachments: vec![],
        };
        
        let context = AuthContext::new(UserId::new("user-1"), vec![]);
        let clock = TestClock { time: "2025-12-20T13:00:00Z".to_string() };
        
        let result = grant_access(
            &dot,
            &[],
            vec![UserId::new("user-2")],
            vec![],
            &context,
            &clock,
        );
        
        assert!(result.is_ok());
        let grants = result.unwrap().grants;
        assert_eq!(grants.len(), 1);
        assert_eq!(grants[0].user_id, Some(UserId::new("user-2")));
        assert_eq!(grants[0].granted_by, Some(UserId::new("user-1")));
    }

    #[test]
    fn test_grant_access_unauthorized() {
        let dot = Dot {
            id: DotId::new("dot-1"),
            tenant_id: TenantId::new("tenant-1"),
            title: "Test".to_string(),
            body: None,
            created_by: UserId::new("user-1"),
            created_at: "2025-12-20T12:00:00Z".to_string(),
            scope_id: None,
            tags: vec![],
            attachments: vec![],
        };
        
        let context = AuthContext::new(UserId::new("user-3"), vec![]);
        let clock = TestClock { time: "2025-12-20T13:00:00Z".to_string() };
        
        let result = grant_access(
            &dot,
            &[],
            vec![UserId::new("user-2")],
            vec![],
            &context,
            &clock,
        );
        
        assert!(result.is_err());
    }

    #[test]
    fn test_grant_access_skips_duplicates() {
        let dot = Dot {
            id: DotId::new("dot-1"),
            tenant_id: TenantId::new("tenant-1"),
            title: "Test".to_string(),
            body: None,
            created_by: UserId::new("user-1"),
            created_at: "2025-12-20T12:00:00Z".to_string(),
            scope_id: None,
            tags: vec![],
            attachments: vec![],
        };
        
        let existing = vec![
            VisibilityGrant {
                dot_id: DotId::new("dot-1"),
                user_id: Some(UserId::new("user-2")),
                scope_id: None,
                granted_at: "2025-12-20T12:00:00Z".to_string(),
                granted_by: None,
            },
        ];
        
        let context = AuthContext::new(UserId::new("user-1"), vec![]);
        let clock = TestClock { time: "2025-12-20T13:00:00Z".to_string() };
        
        let result = grant_access(
            &dot,
            &existing,
            vec![UserId::new("user-2")], // Already granted
            vec![],
            &context,
            &clock,
        );
        
        assert!(result.is_ok());
        assert_eq!(result.unwrap().grants.len(), 0); // No new grants
    }

    #[test]
    fn test_create_link_valid() {
        let from_dot = Dot {
            id: DotId::new("dot-1"),
            tenant_id: TenantId::new("tenant-1"),
            title: "From".to_string(),
            body: None,
            created_by: UserId::new("user-1"),
            created_at: "2025-12-20T12:00:00Z".to_string(),
            scope_id: None,
            tags: vec![],
            attachments: vec![],
        };
        
        let to_dot = Dot {
            id: DotId::new("dot-2"),
            tenant_id: TenantId::new("tenant-1"),
            title: "To".to_string(),
            body: None,
            created_by: UserId::new("user-1"),
            created_at: "2025-12-20T12:00:00Z".to_string(),
            scope_id: None,
            tags: vec![],
            attachments: vec![],
        };
        
        let context = AuthContext::new(UserId::new("user-1"), vec![]);
        let clock = TestClock { time: "2025-12-20T13:00:00Z".to_string() };
        
        let result = create_link(
            &from_dot,
            &to_dot,
            LinkType::Followup,
            &[],
            &[],
            &[],
            &context,
            &clock,
        );
        
        assert!(result.is_ok());
        let link = result.unwrap().link;
        assert_eq!(link.from_dot_id, DotId::new("dot-1"));
        assert_eq!(link.to_dot_id, DotId::new("dot-2"));
        assert_eq!(link.link_type, LinkType::Followup);
    }

    #[test]
    fn test_create_link_self_reference_fails() {
        let dot = Dot {
            id: DotId::new("dot-1"),
            tenant_id: TenantId::new("tenant-1"),
            title: "Test".to_string(),
            body: None,
            created_by: UserId::new("user-1"),
            created_at: "2025-12-20T12:00:00Z".to_string(),
            scope_id: None,
            tags: vec![],
            attachments: vec![],
        };
        
        let context = AuthContext::new(UserId::new("user-1"), vec![]);
        let clock = TestClock { time: "2025-12-20T13:00:00Z".to_string() };
        
        let result = create_link(
            &dot,
            &dot,
            LinkType::Followup,
            &[],
            &[],
            &[],
            &context,
            &clock,
        );
        
        assert!(result.is_err());
    }

    #[test]
    fn test_create_link_cross_tenant_fails() {
        let from_dot = Dot {
            id: DotId::new("dot-1"),
            tenant_id: TenantId::new("tenant-1"),
            title: "From".to_string(),
            body: None,
            created_by: UserId::new("user-1"),
            created_at: "2025-12-20T12:00:00Z".to_string(),
            scope_id: None,
            tags: vec![],
            attachments: vec![],
        };
        
        let to_dot = Dot {
            id: DotId::new("dot-2"),
            tenant_id: TenantId::new("tenant-2"), // Different tenant
            title: "To".to_string(),
            body: None,
            created_by: UserId::new("user-2"),
            created_at: "2025-12-20T12:00:00Z".to_string(),
            scope_id: None,
            tags: vec![],
            attachments: vec![],
        };
        
        let context = AuthContext::new(UserId::new("user-1"), vec![]);
        let clock = TestClock { time: "2025-12-20T13:00:00Z".to_string() };
        
        let result = create_link(
            &from_dot,
            &to_dot,
            LinkType::Followup,
            &[],
            &[],
            &[],
            &context,
            &clock,
        );
        
        assert!(result.is_err());
    }

    #[test]
    fn test_create_link_duplicate_fails() {
        let from_dot = Dot {
            id: DotId::new("dot-1"),
            tenant_id: TenantId::new("tenant-1"),
            title: "From".to_string(),
            body: None,
            created_by: UserId::new("user-1"),
            created_at: "2025-12-20T12:00:00Z".to_string(),
            scope_id: None,
            tags: vec![],
            attachments: vec![],
        };
        
        let to_dot = Dot {
            id: DotId::new("dot-2"),
            tenant_id: TenantId::new("tenant-1"),
            title: "To".to_string(),
            body: None,
            created_by: UserId::new("user-1"),
            created_at: "2025-12-20T12:00:00Z".to_string(),
            scope_id: None,
            tags: vec![],
            attachments: vec![],
        };
        
        let existing_links = vec![
            Link {
                from_dot_id: DotId::new("dot-1"),
                to_dot_id: DotId::new("dot-2"),
                link_type: LinkType::Followup,
                created_at: "2025-12-20T12:00:00Z".to_string(),
            },
        ];
        
        let context = AuthContext::new(UserId::new("user-1"), vec![]);
        let clock = TestClock { time: "2025-12-20T13:00:00Z".to_string() };
        
        let result = create_link(
            &from_dot,
            &to_dot,
            LinkType::Followup,
            &[],
            &[],
            &existing_links,
            &context,
            &clock,
        );
        
        assert!(result.is_err());
    }
}
