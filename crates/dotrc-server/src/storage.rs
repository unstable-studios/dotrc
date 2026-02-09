//! PostgreSQL storage adapter for dotrc-server.
//!
//! Mirrors the D1 adapter in dotrc-worker, adapted for Postgres/sqlx.

use dotrc_core::types::{
    AttachmentRef, Dot, DotId, Link, LinkType, ScopeId, Tag, TenantId, UserId, VisibilityGrant,
};
use sqlx::PgPool;

/// PostgreSQL storage adapter.
#[derive(Clone)]
pub struct PgStorage {
    pool: PgPool,
}

impl PgStorage {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Ensure a tenant exists (idempotent).
    pub async fn ensure_tenant(&self, tenant_id: &str, now: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO tenants (id, name, created_at) VALUES ($1, $1, $2) ON CONFLICT (id) DO NOTHING",
        )
        .bind(tenant_id)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Ensure a user exists within a tenant (idempotent).
    pub async fn ensure_user(
        &self,
        user_id: &str,
        tenant_id: &str,
        now: &str,
    ) -> Result<(), sqlx::Error> {
        self.ensure_tenant(tenant_id, now).await?;
        sqlx::query(
            "INSERT INTO users (id, tenant_id, display_name, created_at) VALUES ($1, $2, $1, $3) ON CONFLICT (id) DO NOTHING",
        )
        .bind(user_id)
        .bind(tenant_id)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Ensure a scope exists within a tenant (idempotent).
    pub async fn ensure_scope(
        &self,
        scope_id: &str,
        tenant_id: &str,
        now: &str,
    ) -> Result<(), sqlx::Error> {
        self.ensure_tenant(tenant_id, now).await?;
        sqlx::query(
            "INSERT INTO scopes (id, tenant_id, name, type, created_at) VALUES ($1, $2, $1, 'auto', $3) ON CONFLICT (id) DO NOTHING",
        )
        .bind(scope_id)
        .bind(tenant_id)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Ensure all entities referenced by a dot write-set exist.
    pub async fn ensure_entities(
        &self,
        dot: &Dot,
        grants: &[VisibilityGrant],
        now: &str,
    ) -> Result<(), sqlx::Error> {
        let tenant_id = dot.tenant_id.as_str();
        self.ensure_tenant(tenant_id, now).await?;
        self.ensure_user(dot.created_by.as_str(), tenant_id, now)
            .await?;
        if let Some(ref scope_id) = dot.scope_id {
            self.ensure_scope(scope_id.as_str(), tenant_id, now).await?;
        }
        for grant in grants {
            if let Some(ref uid) = grant.user_id {
                self.ensure_user(uid.as_str(), tenant_id, now).await?;
            }
            if let Some(ref sid) = grant.scope_id {
                self.ensure_scope(sid.as_str(), tenant_id, now).await?;
            }
            if let Some(ref gby) = grant.granted_by {
                self.ensure_user(gby.as_str(), tenant_id, now).await?;
            }
        }
        Ok(())
    }

    /// Store a dot with grants and links.
    pub async fn store_dot(
        &self,
        dot: &Dot,
        grants: &[VisibilityGrant],
        links: &[Link],
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            "INSERT INTO dots (id, tenant_id, title, body, created_by, scope_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(dot.id.as_str())
        .bind(dot.tenant_id.as_str())
        .bind(&dot.title)
        .bind(&dot.body)
        .bind(dot.created_by.as_str())
        .bind(dot.scope_id.as_ref().map(|s| s.as_str()))
        .bind(&dot.created_at)
        .execute(&mut *tx)
        .await?;

        for tag in &dot.tags {
            sqlx::query("INSERT INTO tags (dot_id, tag) VALUES ($1, $2)")
                .bind(dot.id.as_str())
                .bind(tag.as_str())
                .execute(&mut *tx)
                .await?;
        }

        for grant in grants {
            sqlx::query(
                "INSERT INTO visibility_grants (dot_id, user_id, scope_id, granted_at, granted_by)
                 VALUES ($1, $2, $3, $4, $5)",
            )
            .bind(grant.dot_id.as_str())
            .bind(grant.user_id.as_ref().map(|u| u.as_str()))
            .bind(grant.scope_id.as_ref().map(|s| s.as_str()))
            .bind(&grant.granted_at)
            .bind(grant.granted_by.as_ref().map(|u| u.as_str()))
            .execute(&mut *tx)
            .await?;
        }

        for link in links {
            sqlx::query(
                "INSERT INTO links (from_dot_id, to_dot_id, link_type, tenant_id, created_at)
                 VALUES ($1, $2, $3, $4, $5)",
            )
            .bind(link.from_dot_id.as_str())
            .bind(link.to_dot_id.as_str())
            .bind(link.link_type.to_string())
            .bind(dot.tenant_id.as_str())
            .bind(&link.created_at)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    /// Retrieve a dot by ID within a tenant.
    pub async fn get_dot(&self, tenant_id: &str, dot_id: &str) -> Result<Option<Dot>, sqlx::Error> {
        let row = sqlx::query_as::<_, DotRow>(
            "SELECT id, tenant_id, title, body, created_by, scope_id, created_at
             FROM dots WHERE tenant_id = $1 AND id = $2",
        )
        .bind(tenant_id)
        .bind(dot_id)
        .fetch_optional(&self.pool)
        .await?;

        let Some(row) = row else { return Ok(None) };

        let tags = sqlx::query_scalar::<_, String>("SELECT tag FROM tags WHERE dot_id = $1")
            .bind(dot_id)
            .fetch_all(&self.pool)
            .await?;

        let attachments = sqlx::query_as::<_, AttachmentRow>(
            "SELECT id, filename, mime_type, size_bytes, content_hash, storage_key, created_at
             FROM attachment_refs WHERE dot_id = $1",
        )
        .bind(dot_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(Some(row.into_dot(tags, attachments)))
    }

    /// Retrieve grants for a dot.
    pub async fn get_grants(
        &self,
        tenant_id: &str,
        dot_id: &str,
    ) -> Result<Vec<VisibilityGrant>, sqlx::Error> {
        let rows = sqlx::query_as::<_, GrantRow>(
            "SELECT vg.dot_id, vg.user_id, vg.scope_id, vg.granted_at, vg.granted_by
             FROM visibility_grants vg
             JOIN dots d ON vg.dot_id = d.id
             WHERE d.tenant_id = $1 AND vg.dot_id = $2",
        )
        .bind(tenant_id)
        .bind(dot_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into_grant()).collect())
    }

    /// Store additional grants (append-only).
    pub async fn store_grants(&self, grants: &[VisibilityGrant]) -> Result<(), sqlx::Error> {
        for grant in grants {
            sqlx::query(
                "INSERT INTO visibility_grants (dot_id, user_id, scope_id, granted_at, granted_by)
                 VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
            )
            .bind(grant.dot_id.as_str())
            .bind(grant.user_id.as_ref().map(|u| u.as_str()))
            .bind(grant.scope_id.as_ref().map(|s| s.as_str()))
            .bind(&grant.granted_at)
            .bind(grant.granted_by.as_ref().map(|u| u.as_str()))
            .execute(&self.pool)
            .await?;
        }
        Ok(())
    }

    /// Store a link.
    pub async fn store_link(&self, link: &Link, tenant_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO links (from_dot_id, to_dot_id, link_type, tenant_id, created_at)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(link.from_dot_id.as_str())
        .bind(link.to_dot_id.as_str())
        .bind(link.link_type.to_string())
        .bind(tenant_id)
        .bind(&link.created_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Retrieve links for a dot.
    pub async fn get_links(&self, tenant_id: &str, dot_id: &str) -> Result<Vec<Link>, sqlx::Error> {
        let rows = sqlx::query_as::<_, LinkRow>(
            "SELECT from_dot_id, to_dot_id, link_type, created_at
             FROM links
             WHERE tenant_id = $1 AND (from_dot_id = $2 OR to_dot_id = $2)",
        )
        .bind(tenant_id)
        .bind(dot_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into_link()).collect())
    }

    /// List dots visible to a user (paginated).
    pub async fn list_dots_for_user(
        &self,
        tenant_id: &str,
        user_id: &str,
        limit: i64,
        offset: i64,
    ) -> Result<(Vec<Dot>, bool), sqlx::Error> {
        let rows = sqlx::query_as::<_, DotRow>(
            "SELECT DISTINCT d.id, d.tenant_id, d.title, d.body, d.created_by, d.scope_id, d.created_at
             FROM dots d
             JOIN visibility_grants vg ON d.id = vg.dot_id
             WHERE d.tenant_id = $1 AND (vg.user_id = $2 OR d.created_by = $2)
             ORDER BY d.created_at DESC
             LIMIT $3 OFFSET $4",
        )
        .bind(tenant_id)
        .bind(user_id)
        .bind(limit + 1)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        let has_more = rows.len() as i64 > limit;
        let rows: Vec<DotRow> = rows.into_iter().take(limit as usize).collect();

        let mut dots = Vec::with_capacity(rows.len());
        for row in rows {
            let dot_id = row.id.clone();
            let tags = sqlx::query_scalar::<_, String>("SELECT tag FROM tags WHERE dot_id = $1")
                .bind(&dot_id)
                .fetch_all(&self.pool)
                .await?;
            let attachments = sqlx::query_as::<_, AttachmentRow>(
                "SELECT id, filename, mime_type, size_bytes, content_hash, storage_key, created_at
                 FROM attachment_refs WHERE dot_id = $1",
            )
            .bind(&dot_id)
            .fetch_all(&self.pool)
            .await?;
            dots.push(row.into_dot(tags, attachments));
        }

        Ok((dots, has_more))
    }

    /// Store an attachment reference (metadata only).
    #[allow(dead_code)]
    pub async fn store_attachment_ref(
        &self,
        dot_id: &str,
        attachment: &AttachmentRef,
        storage_key: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO attachment_refs (id, dot_id, filename, mime_type, size_bytes, content_hash, storage_key, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(&attachment.id)
        .bind(dot_id)
        .bind(&attachment.filename)
        .bind(&attachment.mime_type)
        .bind(attachment.size_bytes as i64)
        .bind(&attachment.content_hash)
        .bind(storage_key)
        .bind(&attachment.created_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Get an attachment reference by ID, scoped to tenant.
    #[allow(dead_code)]
    pub async fn get_attachment_ref(
        &self,
        attachment_id: &str,
        tenant_id: &str,
    ) -> Result<Option<AttachmentRefWithDot>, sqlx::Error> {
        let row = sqlx::query_as::<_, AttachmentRefRow>(
            "SELECT ar.id, ar.dot_id, ar.filename, ar.mime_type, ar.size_bytes, ar.content_hash, ar.storage_key, ar.created_at
             FROM attachment_refs ar
             JOIN dots d ON ar.dot_id = d.id
             WHERE ar.id = $1 AND d.tenant_id = $2",
        )
        .bind(attachment_id)
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| AttachmentRefWithDot {
            dot_id: r.dot_id,
            ref_: AttachmentRef {
                id: r.id,
                filename: r.filename,
                mime_type: r.mime_type,
                size_bytes: r.size_bytes as u64,
                content_hash: r.content_hash,
                created_at: r.created_at,
            },
            storage_key: r.storage_key,
        }))
    }
}

#[allow(dead_code)]
pub struct AttachmentRefWithDot {
    pub dot_id: String,
    pub ref_: AttachmentRef,
    pub storage_key: Option<String>,
}

// --- sqlx row types ---

#[derive(sqlx::FromRow)]
struct DotRow {
    id: String,
    tenant_id: String,
    title: String,
    body: Option<String>,
    created_by: String,
    scope_id: Option<String>,
    created_at: String,
}

impl DotRow {
    fn into_dot(self, tags: Vec<String>, attachment_rows: Vec<AttachmentRow>) -> Dot {
        Dot {
            id: DotId::new(&self.id),
            tenant_id: TenantId::new(&self.tenant_id),
            title: self.title,
            body: self.body,
            created_by: UserId::new(&self.created_by),
            created_at: self.created_at,
            scope_id: self.scope_id.map(|s| ScopeId::new(&s)),
            tags: tags.into_iter().map(|t| Tag::new(&t)).collect(),
            attachments: attachment_rows
                .into_iter()
                .map(|a| AttachmentRef {
                    id: a.id,
                    filename: a.filename,
                    mime_type: a.mime_type,
                    size_bytes: a.size_bytes as u64,
                    content_hash: a.content_hash,
                    created_at: a.created_at,
                })
                .collect(),
        }
    }
}

#[derive(sqlx::FromRow)]
struct AttachmentRow {
    id: String,
    filename: String,
    mime_type: String,
    size_bytes: i64,
    content_hash: String,
    #[allow(dead_code)]
    storage_key: Option<String>,
    created_at: String,
}

#[allow(dead_code)]
#[derive(sqlx::FromRow)]
struct AttachmentRefRow {
    id: String,
    dot_id: String,
    filename: String,
    mime_type: String,
    size_bytes: i64,
    content_hash: String,
    storage_key: Option<String>,
    created_at: String,
}

#[derive(sqlx::FromRow)]
struct GrantRow {
    dot_id: String,
    user_id: Option<String>,
    scope_id: Option<String>,
    granted_at: String,
    granted_by: Option<String>,
}

impl GrantRow {
    fn into_grant(self) -> VisibilityGrant {
        VisibilityGrant {
            dot_id: DotId::new(&self.dot_id),
            user_id: self.user_id.map(|u| UserId::new(&u)),
            scope_id: self.scope_id.map(|s| ScopeId::new(&s)),
            granted_at: self.granted_at,
            granted_by: self.granted_by.map(|u| UserId::new(&u)),
        }
    }
}

#[derive(sqlx::FromRow)]
struct LinkRow {
    from_dot_id: String,
    to_dot_id: String,
    link_type: String,
    created_at: String,
}

impl LinkRow {
    fn into_link(self) -> Link {
        let lt = match self.link_type.as_str() {
            "followup" => LinkType::Followup,
            "corrects" => LinkType::Corrects,
            "supersedes" => LinkType::Supersedes,
            _ => LinkType::Related,
        };
        Link {
            from_dot_id: DotId::new(&self.from_dot_id),
            to_dot_id: DotId::new(&self.to_dot_id),
            link_type: lt,
            created_at: self.created_at,
        }
    }
}
