import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useGetDot } from "@/hooks/use-dots";
import { useGetGrants, useGrantAccess } from "@/hooks/use-grants";
import { useGetLinks, useCreateLink } from "@/hooks/use-links";
import { useAuth } from "@/context/auth";
import { formatDate, formatBytes } from "@/lib/utils";
import { TagBadge } from "@/components/tag-badge";
import { LinkBadge } from "@/components/link-badge";
import type { LinkType } from "dotrc-sdk";

export function DotDetailPage() {
  const { dotId } = useParams<{ dotId: string }>();
  const { auth } = useAuth();
  const { data: dot, isLoading, error } = useGetDot(dotId);
  const { data: grantsData } = useGetGrants(dotId);
  const { data: linksData } = useGetLinks(dotId);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-neutral-100 dark:bg-neutral-800" />
        <div className="h-32 rounded-lg bg-neutral-100 dark:bg-neutral-800" />
      </div>
    );
  }

  if (error || !dot) {
    return (
      <div className="p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 text-sm">
        {error ? `Failed to load dot: ${error.message}` : "Dot not found"}
      </div>
    );
  }

  const isCreator = dot.created_by === auth?.userId;
  const grants = grantsData?.grants ?? [];
  const links = linksData?.links ?? [];
  const outgoing = links.filter((l) => l.from_dot_id === dotId);
  const incoming = links.filter((l) => l.to_dot_id === dotId);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold">{dot.title}</h1>
          {isCreator && (
            <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 flex-shrink-0">
              Creator
            </span>
          )}
        </div>
        <div className="mt-2 text-sm text-neutral-500 dark:text-neutral-400 flex items-center gap-2 flex-wrap">
          <span>{dot.created_by}</span>
          <span>&middot;</span>
          <span>{formatDate(dot.created_at)}</span>
          {dot.scope_id && (
            <>
              <span>&middot;</span>
              <span>Scope: {dot.scope_id}</span>
            </>
          )}
        </div>
        {dot.tags.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            {dot.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        )}
      </div>

      {dot.body && (
        <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <p className="text-sm whitespace-pre-wrap">{dot.body}</p>
        </div>
      )}

      {dot.attachments.length > 0 && (
        <section>
          <h2 className="text-base font-medium mb-3">Attachments</h2>
          <div className="space-y-2">
            {dot.attachments.map((att) => {
              const isImage = att.mime_type.startsWith("image/");
              return (
                <div
                  key={att.id}
                  className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800"
                >
                  {isImage && (
                    <img
                      src={`/api/attachments/${att.id}`}
                      alt={att.filename}
                      className="max-h-48 rounded mb-2"
                    />
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{att.filename}</p>
                      <p className="text-xs text-neutral-500">
                        {att.mime_type} &middot; {formatBytes(att.size_bytes)}
                      </p>
                    </div>
                    <a
                      href={`/api/attachments/${att.id}`}
                      download={att.filename}
                      className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Download
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(outgoing.length > 0 || incoming.length > 0) && (
        <section>
          <h2 className="text-base font-medium mb-3">Links</h2>
          <div className="space-y-2">
            {outgoing.map((link, i) => (
              <div
                key={`out-${i}`}
                className="flex items-center gap-2 text-sm"
              >
                <LinkBadge type={link.link_type} />
                <span className="text-neutral-500">&rarr;</span>
                <Link
                  to={`/dots/${link.to_dot_id}`}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline truncate"
                >
                  {link.to_dot_id}
                </Link>
              </div>
            ))}
            {incoming.map((link, i) => (
              <div key={`in-${i}`} className="flex items-center gap-2 text-sm">
                <Link
                  to={`/dots/${link.from_dot_id}`}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline truncate"
                >
                  {link.from_dot_id}
                </Link>
                <span className="text-neutral-500">&rarr;</span>
                <LinkBadge type={link.link_type} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-base font-medium mb-3">Access Grants</h2>
        {grants.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No grants recorded.
          </p>
        ) : (
          <div className="space-y-1">
            {grants.map((g, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-sm py-1.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0"
              >
                {g.user_id && (
                  <span className="px-2 py-0.5 rounded text-xs bg-neutral-100 dark:bg-neutral-800">
                    User: {g.user_id}
                  </span>
                )}
                {g.scope_id && (
                  <span className="px-2 py-0.5 rounded text-xs bg-neutral-100 dark:bg-neutral-800">
                    Scope: {g.scope_id}
                  </span>
                )}
                <span className="text-neutral-400 text-xs ml-auto">
                  {formatDate(g.granted_at)}
                </span>
              </div>
            ))}
          </div>
        )}
        <GrantForm dotId={dotId!} />
      </section>

      <section>
        <h2 className="text-base font-medium mb-3">Create Link</h2>
        <LinkForm fromDotId={dotId!} />
      </section>
    </div>
  );
}

function GrantForm({ dotId }: { dotId: string }) {
  const [userId, setUserId] = useState("");
  const mutation = useGrantAccess(dotId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim()) return;
    mutation.mutate(
      { user_ids: [userId.trim()] },
      { onSuccess: () => setUserId("") },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
      <input
        type="text"
        placeholder="Grant access to user ID..."
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="flex-1 px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
      />
      <button
        type="submit"
        disabled={mutation.isPending}
        className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        Grant
      </button>
    </form>
  );
}

function LinkForm({ fromDotId }: { fromDotId: string }) {
  const [toDotId, setToDotId] = useState("");
  const [linkType, setLinkType] = useState<LinkType>("related");
  const mutation = useCreateLink(fromDotId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toDotId.trim()) return;
    mutation.mutate(
      { to_dot_id: toDotId.trim(), link_type: linkType },
      { onSuccess: () => setToDotId("") },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 flex-wrap">
      <input
        type="text"
        placeholder="Target dot ID..."
        value={toDotId}
        onChange={(e) => setToDotId(e.target.value)}
        className="flex-1 min-w-[200px] px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
      />
      <select
        value={linkType}
        onChange={(e) => setLinkType(e.target.value as LinkType)}
        className="px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
      >
        <option value="related">Related</option>
        <option value="followup">Follow-up</option>
        <option value="corrects">Corrects</option>
        <option value="supersedes">Supersedes</option>
      </select>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        Link
      </button>
    </form>
  );
}
