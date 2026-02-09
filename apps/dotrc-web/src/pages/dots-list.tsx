import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useListDots } from "@/hooks/use-dots";
import { DotCard } from "@/components/dot-card";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/empty-state";

const PAGE_SIZE = 20;

export function DotsListPage() {
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const [tagFilter, setTagFilter] = useState("");

  const { data, isLoading, error } = useListDots({
    limit: PAGE_SIZE,
    offset,
  });

  const dots = data?.dots ?? [];
  const filtered = tagFilter
    ? dots.filter((d) => d.tags.some((t) => t.includes(tagFilter)))
    : dots;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dots</h1>
        <button
          onClick={() => navigate("/dots/new")}
          className="px-4 py-2 text-sm font-medium rounded-md bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:opacity-90 transition-opacity"
        >
          Create Dot
        </button>
      </div>

      <div>
        <input
          type="text"
          placeholder="Filter by tag..."
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="w-full sm:w-64 px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
        />
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-20 rounded-lg bg-neutral-100 dark:bg-neutral-800"
            />
          ))}
        </div>
      ) : error ? (
        <div className="p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 text-sm">
          Failed to load dots: {error.message}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={tagFilter ? "No dots match that filter" : "No dots yet"}
          description={
            tagFilter ? "Try a different tag filter." : "Create your first dot."
          }
          action={
            !tagFilter
              ? {
                  label: "Create Dot",
                  onClick: () => navigate("/dots/new"),
                }
              : undefined
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {filtered.map((dot) => (
              <DotCard key={dot.id} dot={dot} />
            ))}
          </div>
          <Pagination
            offset={offset}
            limit={PAGE_SIZE}
            hasMore={data?.has_more ?? false}
            onPrev={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            onNext={() => setOffset(offset + PAGE_SIZE)}
          />
        </>
      )}
    </div>
  );
}
