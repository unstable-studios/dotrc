//! Authorization and visibility policy for dotrc-core.
//!
//! Enforcement is based on immutable facts provided by adapters:
//! - The requesting principal (`UserId`)
//! - Explicit visibility grants (`VisibilityGrant{ user_id: Some(..) }`)
//! - Optional scope memberships (for adapter logic), but core does not
//!   infer access from scope grants alone.
//!
//! This module answers: can a user view a dot, grant access, or create links?

#[cfg(not(feature = "std"))]
use alloc::{string::ToString, vec::Vec};

use crate::errors::{AuthorizationError, Result};
use crate::types::{Dot, UserId, ScopeId, VisibilityGrant};

#[cfg(feature = "std")]
use std::collections::HashSet;

#[cfg(not(feature = "std"))]
use alloc::collections::BTreeSet as HashSet;

/// Context for authorization decisions
/// Adapters provide this data - core never fetches it
#[derive(Debug, Clone)]
pub struct AuthContext {
    /// The user making the request
    pub requesting_user: UserId,
    /// Scopes the requesting user is a member of
    pub user_scope_memberships: HashSet<ScopeId>,
}

impl AuthContext {
    pub fn new(user: UserId, memberships: Vec<ScopeId>) -> Self {
        Self {
            requesting_user: user,
            user_scope_memberships: memberships.into_iter().collect(),
        }
    }
}

/// Check if a user can view a dot
/// Based on provided visibility grants and scope memberships
/// Returns Ok(()) if allowed, Err otherwise
pub fn can_view_dot(
    dot: &Dot,
    grants: &[VisibilityGrant],
    context: &AuthContext,
) -> Result<()> {
    // Creator can always view their own dot
    if dot.created_by == context.requesting_user {
        return Ok(());
    }
    
    // Check direct user grants
    let has_user_grant = grants.iter().any(|g| {
        g.dot_id == dot.id && g.user_id.as_ref() == Some(&context.requesting_user)
    });
    
    if has_user_grant {
        return Ok(());
    }

    Err(AuthorizationError::CannotViewDot {
        user_id: context.requesting_user.as_str().to_string(),
        dot_id: dot.id.as_str().to_string(),
    }.into())
}

/// Check if a user can grant access to a dot
/// Only the creator or existing viewers with permission can grant access
pub fn can_grant_access(
    dot: &Dot,
    grants: &[VisibilityGrant],
    context: &AuthContext,
) -> Result<()> {
    // Creator can always grant access
    if dot.created_by == context.requesting_user {
        return Ok(());
    }
    
    // Must be able to view the dot to grant access
    can_view_dot(dot, grants, context).map_err(|_| {
        AuthorizationError::CannotGrantAccess {
            user_id: context.requesting_user.as_str().to_string(),
            dot_id: dot.id.as_str().to_string(),
        }
    })?;
    
    Ok(())
}

/// Check if a user can create a link from a dot
/// Must be able to view both source and target dots
pub fn can_create_link(
    source_dot: &Dot,
    target_dot: &Dot,
    source_grants: &[VisibilityGrant],
    target_grants: &[VisibilityGrant],
    context: &AuthContext,
) -> Result<()> {
    // Must be able to view the source dot
    can_view_dot(source_dot, source_grants, context).map_err(|_| {
        AuthorizationError::CannotCreateLink {
            user_id: context.requesting_user.as_str().to_string(),
            dot_id: source_dot.id.as_str().to_string(),
        }
    })?;
    
    // Must be able to view the target dot
    can_view_dot(target_dot, target_grants, context).map_err(|_| {
        AuthorizationError::CannotCreateLink {
            user_id: context.requesting_user.as_str().to_string(),
            dot_id: target_dot.id.as_str().to_string(),
        }
    })?;
    
    Ok(())
}

/// Check if a user is a member of a scope
pub fn is_scope_member(scope_id: &ScopeId, context: &AuthContext) -> bool {
    context.user_scope_memberships.contains(scope_id)
}

/// Filter dots to only those visible to the user
pub fn filter_visible_dots(
    dots: Vec<Dot>,
    grants: &[VisibilityGrant],
    context: &AuthContext,
) -> Vec<Dot> {
    dots.into_iter()
        .filter(|dot| can_view_dot(dot, grants, context).is_ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{DotId, TenantId};

    fn create_test_dot(id: &str, created_by: &str, scope_id: Option<&str>) -> Dot {
        Dot {
            id: DotId::new(id),
            tenant_id: TenantId::new("tenant-1"),
            title: "Test Dot".to_string(),
            body: None,
            created_by: UserId::new(created_by),
            created_at: "2025-12-20T12:00:00Z".to_string(),
            scope_id: scope_id.map(ScopeId::new),
            tags: vec![],
            attachments: vec![],
        }
    }

    fn create_user_grant(dot_id: &str, user_id: &str) -> VisibilityGrant {
        VisibilityGrant {
            dot_id: DotId::new(dot_id),
            user_id: Some(UserId::new(user_id)),
            scope_id: None,
            granted_at: "2025-12-20T12:00:00Z".to_string(),
            granted_by: None,
        }
    }

    fn create_scope_grant(dot_id: &str, scope_id: &str) -> VisibilityGrant {
        VisibilityGrant {
            dot_id: DotId::new(dot_id),
            user_id: None,
            scope_id: Some(ScopeId::new(scope_id)),
            granted_at: "2025-12-20T12:00:00Z".to_string(),
            granted_by: None,
        }
    }

    #[test]
    fn test_creator_can_view_own_dot() {
        let dot = create_test_dot("dot-1", "user-1", None);
        let context = AuthContext::new(UserId::new("user-1"), vec![]);
        let grants = vec![];
        
        let result = can_view_dot(&dot, &grants, &context);
        assert!(result.is_ok());
    }

    #[test]
    fn test_user_with_grant_can_view() {
        let dot = create_test_dot("dot-1", "user-1", None);
        let context = AuthContext::new(UserId::new("user-2"), vec![]);
        let grants = vec![create_user_grant("dot-1", "user-2")];
        
        let result = can_view_dot(&dot, &grants, &context);
        assert!(result.is_ok());
    }

    #[test]
    fn test_user_without_grant_cannot_view() {
        let dot = create_test_dot("dot-1", "user-1", None);
        let context = AuthContext::new(UserId::new("user-3"), vec![]);
        let grants = vec![create_user_grant("dot-1", "user-2")];
        
        let result = can_view_dot(&dot, &grants, &context);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), 
            crate::errors::DotrcError::Authorization(
                AuthorizationError::CannotViewDot { .. }
            )));
    }

    #[test]
    fn test_scope_member_requires_explicit_grant() {
        let dot = create_test_dot("dot-1", "user-1", Some("scope-1"));
        let context = AuthContext::new(
            UserId::new("user-2"),
            vec![ScopeId::new("scope-1")],
        );
        let grants = vec![create_scope_grant("dot-1", "scope-1")];
        
        let result = can_view_dot(&dot, &grants, &context);
        assert!(result.is_err());
    }

    #[test]
    fn test_non_scope_member_cannot_view() {
        let dot = create_test_dot("dot-1", "user-1", Some("scope-1"));
        let context = AuthContext::new(
            UserId::new("user-2"),
            vec![ScopeId::new("scope-2")],
        );
        let grants = vec![create_scope_grant("dot-1", "scope-1")];
        
        let result = can_view_dot(&dot, &grants, &context);
        assert!(result.is_err());
    }

    #[test]
    fn test_multiple_grants() {
        let dot = create_test_dot("dot-1", "user-1", None);
        let context = AuthContext::new(UserId::new("user-3"), vec![]);
        let grants = vec![
            create_user_grant("dot-1", "user-2"),
            create_user_grant("dot-1", "user-3"),
        ];
        
        let result = can_view_dot(&dot, &grants, &context);
        assert!(result.is_ok());
    }

    #[test]
    fn test_creator_can_grant_access() {
        let dot = create_test_dot("dot-1", "user-1", None);
        let context = AuthContext::new(UserId::new("user-1"), vec![]);
        let grants = vec![];
        
        let result = can_grant_access(&dot, &grants, &context);
        assert!(result.is_ok());
    }

    #[test]
    fn test_viewer_can_grant_access() {
        let dot = create_test_dot("dot-1", "user-1", None);
        let context = AuthContext::new(UserId::new("user-2"), vec![]);
        let grants = vec![create_user_grant("dot-1", "user-2")];
        
        let result = can_grant_access(&dot, &grants, &context);
        assert!(result.is_ok());
    }

    #[test]
    fn test_non_viewer_cannot_grant_access() {
        let dot = create_test_dot("dot-1", "user-1", None);
        let context = AuthContext::new(UserId::new("user-3"), vec![]);
        let grants = vec![create_user_grant("dot-1", "user-2")];
        
        let result = can_grant_access(&dot, &grants, &context);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), 
            crate::errors::DotrcError::Authorization(
                AuthorizationError::CannotGrantAccess { .. }
            )));
    }

    #[test]
    fn test_can_create_link_both_visible() {
        let source = create_test_dot("dot-1", "user-1", None);
        let target = create_test_dot("dot-2", "user-2", None);
        let context = AuthContext::new(UserId::new("user-3"), vec![]);
        let source_grants = vec![create_user_grant("dot-1", "user-3")];
        let target_grants = vec![create_user_grant("dot-2", "user-3")];
        
        let result = can_create_link(&source, &target, &source_grants, &target_grants, &context);
        assert!(result.is_ok());
    }

    #[test]
    fn test_cannot_create_link_source_not_visible() {
        let source = create_test_dot("dot-1", "user-1", None);
        let target = create_test_dot("dot-2", "user-2", None);
        let context = AuthContext::new(UserId::new("user-3"), vec![]);
        let source_grants = vec![]; // No grant for source
        let target_grants = vec![create_user_grant("dot-2", "user-3")];
        
        let result = can_create_link(&source, &target, &source_grants, &target_grants, &context);
        assert!(result.is_err());
    }

    #[test]
    fn test_cannot_create_link_target_not_visible() {
        let source = create_test_dot("dot-1", "user-1", None);
        let target = create_test_dot("dot-2", "user-2", None);
        let context = AuthContext::new(UserId::new("user-3"), vec![]);
        let source_grants = vec![create_user_grant("dot-1", "user-3")];
        let target_grants = vec![]; // No grant for target
        
        let result = can_create_link(&source, &target, &source_grants, &target_grants, &context);
        assert!(result.is_err());
    }

    #[test]
    fn test_is_scope_member_true() {
        let context = AuthContext::new(
            UserId::new("user-1"),
            vec![ScopeId::new("scope-1"), ScopeId::new("scope-2")],
        );
        
        assert!(is_scope_member(&ScopeId::new("scope-1"), &context));
        assert!(is_scope_member(&ScopeId::new("scope-2"), &context));
    }

    #[test]
    fn test_is_scope_member_false() {
        let context = AuthContext::new(
            UserId::new("user-1"),
            vec![ScopeId::new("scope-1")],
        );
        
        assert!(!is_scope_member(&ScopeId::new("scope-2"), &context));
    }

    #[test]
    fn test_filter_visible_dots() {
        let dot1 = create_test_dot("dot-1", "user-1", None);
        let dot2 = create_test_dot("dot-2", "user-2", None);
        let dot3 = create_test_dot("dot-3", "user-3", None);
        
        let context = AuthContext::new(UserId::new("user-1"), vec![]);
        let grants = vec![
            create_user_grant("dot-2", "user-1"), // Can see dot-2
            // Cannot see dot-3
        ];
        
        let visible = filter_visible_dots(vec![dot1, dot2, dot3], &grants, &context);
        
        assert_eq!(visible.len(), 2); // Own dot + dot-2
        assert!(visible.iter().any(|d| d.id.as_str() == "dot-1"));
        assert!(visible.iter().any(|d| d.id.as_str() == "dot-2"));
    }

    #[test]
    fn test_filter_visible_dots_empty() {
        let dot1 = create_test_dot("dot-1", "user-1", None);
        let dot2 = create_test_dot("dot-2", "user-2", None);
        
        let context = AuthContext::new(UserId::new("user-3"), vec![]);
        let grants = vec![]; // No grants
        
        let visible = filter_visible_dots(vec![dot1, dot2], &grants, &context);
        
        assert_eq!(visible.len(), 0);
    }

    #[test]
    fn test_auth_context_creation() {
        let context = AuthContext::new(
            UserId::new("user-1"),
            vec![ScopeId::new("scope-1"), ScopeId::new("scope-2")],
        );
        
        assert_eq!(context.requesting_user.as_str(), "user-1");
        assert_eq!(context.user_scope_memberships.len(), 2);
    }
}
