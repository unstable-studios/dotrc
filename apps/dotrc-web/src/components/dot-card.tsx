import { Link } from "react-router-dom";
import type { Dot } from "dotrc-sdk";
import { formatDate } from "@/lib/utils";
import { TagBadge } from "./tag-badge";
import { useAuth } from "@/context/auth";

export function DotCard({ dot }: { dot: Dot }) {
  const { auth } = useAuth();
  const isCreator = dot.created_by === auth?.userId;

  return (
    <Link
      to={`/dots/${dot.id}`}
      className="block p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium truncate">{dot.title}</h3>
          {dot.body && (
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400 line-clamp-2">
              {dot.body}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center gap-1.5">
          {isCreator && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              Creator
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          {dot.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
        </div>
        <div className="text-xs text-neutral-400 dark:text-neutral-500 flex-shrink-0">
          {dot.created_by} &middot; {formatDate(dot.created_at)}
        </div>
      </div>
    </Link>
  );
}
