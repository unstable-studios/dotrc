interface PaginationProps {
  offset: number;
  limit: number;
  hasMore: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export function Pagination({
  offset,
  limit,
  hasMore,
  onPrev,
  onNext,
}: PaginationProps) {
  const page = Math.floor(offset / limit) + 1;

  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-neutral-500 dark:text-neutral-400">
        Page {page}
      </span>
      <div className="flex gap-2">
        <button
          onClick={onPrev}
          disabled={offset === 0}
          className="px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          Previous
        </button>
        <button
          onClick={onNext}
          disabled={!hasMore}
          className="px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
