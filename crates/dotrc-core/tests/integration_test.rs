use dotrc_core::commands::{create_dot, create_link, grant_access, LinkGrants};
use dotrc_core::policy::{can_view_dot, filter_visible_dots, AuthContext};
use dotrc_core::types::{
    Clock, DotDraft, DotId, IdGen, LinkType, ScopeId, TenantId, Timestamp, UserId,
};

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
        Self {
            next_id: std::cell::RefCell::new(1),
        }
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
fn test_full_workflow_create_and_view() {
    // Setup
    let clock = TestClock {
        time: "2025-12-20T12:00:00Z".to_string(),
    };
    let id_gen = TestIdGen::new();

    // Create a dot
    let draft = DotDraft {
        title: "Meeting Notes".to_string(),
        body: Some("Discussed project timeline".to_string()),
        created_by: UserId::new("alice"),
        tenant_id: TenantId::new("company-1"),
        scope_id: Some(ScopeId::new("engineering-channel")),
        tags: vec!["meeting".to_string(), "important".to_string()],
        visible_to_users: vec![
            UserId::new("alice"),
            UserId::new("bob"),
            UserId::new("charlie"),
        ],
        visible_to_scopes: vec![ScopeId::new("engineering-channel")],
        attachments: vec![],
    };

    let result = create_dot(draft, &clock, &id_gen).unwrap();
    let dot = result.dot;
    let grants = result.grants;

    // Verify dot was created correctly
    assert_eq!(dot.title, "Meeting Notes");
    assert_eq!(dot.created_by, UserId::new("alice"));
    assert_eq!(grants.len(), 4); // alice, bob, charlie, and engineering-channel

    // Alice (creator) can view
    let alice_context = AuthContext::new(UserId::new("alice"), vec![]);
    assert!(can_view_dot(&dot, &grants, &alice_context).is_ok());

    // Bob (granted) can view
    let bob_context = AuthContext::new(UserId::new("bob"), vec![]);
    assert!(can_view_dot(&dot, &grants, &bob_context).is_ok());

    // Charlie is explicitly granted (scope grant is provenance only)
    let charlie_context = AuthContext::new(
        UserId::new("charlie"),
        vec![ScopeId::new("engineering-channel")],
    );
    assert!(can_view_dot(&dot, &grants, &charlie_context).is_ok());

    // Dave (no access) cannot view
    let dave_context = AuthContext::new(UserId::new("dave"), vec![]);
    assert!(can_view_dot(&dot, &grants, &dave_context).is_err());
}

#[test]
fn test_full_workflow_grant_access() {
    let clock = TestClock {
        time: "2025-12-20T12:00:00Z".to_string(),
    };
    let id_gen = TestIdGen::new();

    // Create initial dot
    let draft = DotDraft {
        title: "Private Note".to_string(),
        body: None,
        created_by: UserId::new("alice"),
        tenant_id: TenantId::new("company-1"),
        scope_id: None,
        tags: vec![],
        visible_to_users: vec![UserId::new("alice")],
        visible_to_scopes: vec![],
        attachments: vec![],
    };

    let result = create_dot(draft, &clock, &id_gen).unwrap();
    let dot = result.dot;
    let mut all_grants = result.grants;

    // Initially, only alice can see it
    let bob_context = AuthContext::new(UserId::new("bob"), vec![]);
    assert!(can_view_dot(&dot, &all_grants, &bob_context).is_err());

    // Alice grants access to Bob
    let alice_context = AuthContext::new(UserId::new("alice"), vec![]);
    let clock2 = TestClock {
        time: "2025-12-20T13:00:00Z".to_string(),
    };

    let grant_result = grant_access(
        &dot,
        &all_grants,
        vec![UserId::new("bob")],
        vec![],
        &alice_context,
        &clock2,
    )
    .unwrap();

    // Append new grants
    all_grants.extend(grant_result.grants);

    // Now Bob can view
    assert!(can_view_dot(&dot, &all_grants, &bob_context).is_ok());
}

#[test]
fn test_full_workflow_links_and_superseding() {
    let clock = TestClock {
        time: "2025-12-20T12:00:00Z".to_string(),
    };
    let id_gen = TestIdGen::new();

    // Create first dot
    let draft1 = DotDraft {
        title: "Initial Proposal".to_string(),
        body: Some("First version".to_string()),
        created_by: UserId::new("alice"),
        tenant_id: TenantId::new("company-1"),
        scope_id: None,
        tags: vec![],
        visible_to_users: vec![UserId::new("alice")],
        visible_to_scopes: vec![],
        attachments: vec![],
    };

    let result1 = create_dot(draft1, &clock, &id_gen).unwrap();
    let dot1 = result1.dot;
    let grants1 = result1.grants;

    // Create second dot that supersedes the first
    let clock2 = TestClock {
        time: "2025-12-20T13:00:00Z".to_string(),
    };
    let draft2 = DotDraft {
        title: "Updated Proposal".to_string(),
        body: Some("Second version with corrections".to_string()),
        created_by: UserId::new("alice"),
        tenant_id: TenantId::new("company-1"),
        scope_id: None,
        tags: vec![],
        visible_to_users: vec![UserId::new("alice")],
        visible_to_scopes: vec![],
        attachments: vec![],
    };

    let result2 = create_dot(draft2, &clock2, &id_gen).unwrap();
    let dot2 = result2.dot;
    let grants2 = result2.grants;

    // Create supersedes link
    let alice_context = AuthContext::new(UserId::new("alice"), vec![]);
    let clock3 = TestClock {
        time: "2025-12-20T13:01:00Z".to_string(),
    };

    let link_result = create_link(
        &dot2,
        &dot1,
        LinkType::Supersedes,
        LinkGrants {
            from: &grants2,
            to: &grants1,
        },
        &[],
        &alice_context,
        &clock3,
    )
    .unwrap();

    let link = link_result.link;

    // Verify link was created
    assert_eq!(link.from_dot_id, dot2.id);
    assert_eq!(link.to_dot_id, dot1.id);
    assert_eq!(link.link_type, LinkType::Supersedes);

    // Both dots still exist independently (immutability)
    assert_eq!(dot1.title, "Initial Proposal");
    assert_eq!(dot2.title, "Updated Proposal");
}

#[test]
fn test_full_workflow_filter_visible_dots() {
    let clock = TestClock {
        time: "2025-12-20T12:00:00Z".to_string(),
    };
    let id_gen = TestIdGen::new();

    // Create multiple dots with different visibility
    let draft1 = DotDraft {
        title: "Public Announcement".to_string(),
        body: None,
        created_by: UserId::new("alice"),
        tenant_id: TenantId::new("company-1"),
        scope_id: None,
        tags: vec![],
        visible_to_users: vec![
            UserId::new("alice"),
            UserId::new("bob"),
            UserId::new("charlie"),
        ],
        visible_to_scopes: vec![],
        attachments: vec![],
    };

    let draft2 = DotDraft {
        title: "Team Update".to_string(),
        body: None,
        created_by: UserId::new("bob"),
        tenant_id: TenantId::new("company-1"),
        scope_id: Some(ScopeId::new("eng-team")),
        tags: vec![],
        visible_to_users: vec![UserId::new("bob")],
        visible_to_scopes: vec![ScopeId::new("eng-team")],
        attachments: vec![],
    };

    let draft3 = DotDraft {
        title: "Private Note".to_string(),
        body: None,
        created_by: UserId::new("alice"),
        tenant_id: TenantId::new("company-1"),
        scope_id: None,
        tags: vec![],
        visible_to_users: vec![UserId::new("alice")],
        visible_to_scopes: vec![],
        attachments: vec![],
    };

    let result1 = create_dot(draft1, &clock, &id_gen).unwrap();
    let result2 = create_dot(draft2, &clock, &id_gen).unwrap();
    let result3 = create_dot(draft3, &clock, &id_gen).unwrap();

    let all_dots = vec![
        result1.dot.clone(),
        result2.dot.clone(),
        result3.dot.clone(),
    ];
    let mut all_grants = result1.grants;
    all_grants.extend(result2.grants);
    all_grants.extend(result3.grants);

    // Bob can see public announcement and team update (explicit grant + creator)
    let bob_context = AuthContext::new(UserId::new("bob"), vec![ScopeId::new("eng-team")]);
    let bob_visible = filter_visible_dots(all_dots.clone(), &all_grants, &bob_context);
    assert_eq!(bob_visible.len(), 2);

    // Charlie can only see public announcement
    let charlie_context = AuthContext::new(UserId::new("charlie"), vec![]);
    let charlie_visible = filter_visible_dots(all_dots.clone(), &all_grants, &charlie_context);
    assert_eq!(charlie_visible.len(), 1);
    assert_eq!(charlie_visible[0].title, "Public Announcement");

    // Alice can see her own dots (creator of 2) and any dots she is explicitly granted.
    // She is NOT a member of "eng-team", so she cannot see Bob's team update.
    let alice_context = AuthContext::new(UserId::new("alice"), vec![]);
    let alice_visible = filter_visible_dots(all_dots, &all_grants, &alice_context);
    assert_eq!(alice_visible.len(), 2);
}

#[test]
fn test_immutability_principle() {
    let clock = TestClock {
        time: "2025-12-20T12:00:00Z".to_string(),
    };
    let id_gen = TestIdGen::new();

    // Create a dot
    let draft = DotDraft {
        title: "Original Title".to_string(),
        body: Some("Original body".to_string()),
        created_by: UserId::new("alice"),
        tenant_id: TenantId::new("company-1"),
        scope_id: None,
        tags: vec!["original".to_string()],
        visible_to_users: vec![UserId::new("alice")],
        visible_to_scopes: vec![],
        attachments: vec![],
    };

    let result = create_dot(draft, &clock, &id_gen).unwrap();
    let original_dot = result.dot;

    // To "change" the dot, we create a new one with corrections link
    let clock2 = TestClock {
        time: "2025-12-20T13:00:00Z".to_string(),
    };
    let corrected_draft = DotDraft {
        title: "Corrected Title".to_string(),
        body: Some("Corrected body".to_string()),
        created_by: UserId::new("alice"),
        tenant_id: TenantId::new("company-1"),
        scope_id: None,
        tags: vec!["corrected".to_string()],
        visible_to_users: vec![UserId::new("alice")],
        visible_to_scopes: vec![],
        attachments: vec![],
    };

    let result2 = create_dot(corrected_draft, &clock2, &id_gen).unwrap();
    let corrected_dot = result2.dot;

    // Original dot is unchanged
    assert_eq!(original_dot.title, "Original Title");
    assert_eq!(original_dot.body, Some("Original body".to_string()));
    assert_eq!(original_dot.created_at, "2025-12-20T12:00:00Z");

    // New dot has corrections
    assert_eq!(corrected_dot.title, "Corrected Title");
    assert_eq!(corrected_dot.created_at, "2025-12-20T13:00:00Z");

    // Both dots exist independently - no mutation occurred
    assert_ne!(original_dot.id, corrected_dot.id);
}

#[test]
fn test_acl_snapshot_immutability() {
    let clock = TestClock {
        time: "2025-12-20T12:00:00Z".to_string(),
    };
    let id_gen = TestIdGen::new();

    // Create dot with scope provenance only (no explicit user grants)
    let draft = DotDraft {
        title: "Engineering Memo".to_string(),
        body: None,
        created_by: UserId::new("alice"),
        tenant_id: TenantId::new("company-1"),
        scope_id: Some(ScopeId::new("engineering")),
        tags: vec![],
        visible_to_users: vec![],
        visible_to_scopes: vec![ScopeId::new("engineering")],
        attachments: vec![],
    };

    let result = create_dot(draft, &clock, &id_gen).unwrap();
    let dot = result.dot;
    let grants = result.grants;

    // Bob is a member of engineering scope, but without explicit grant
    let bob_context = AuthContext::new(UserId::new("bob"), vec![ScopeId::new("engineering")]);

    // Bob CANNOT see it: enforcement uses explicit principal grants only
    assert!(can_view_dot(&dot, &grants, &bob_context).is_err());

    // The key point: adapters should expand scope membership to explicit
    // user grants at creation time. Grants are immutable write-sets.
    assert_eq!(grants.len(), 1);
}
