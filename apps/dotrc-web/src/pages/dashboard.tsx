import { useNavigate } from "react-router-dom";
import { useListDots } from "@/hooks/use-dots";
import { useAuth } from "@/context/auth";
import { DotCard } from "@/components/dot-card";
import { EmptyState } from "@/components/empty-state";

export function DashboardPage() {
  const navigate = useNavigate();
  const { auth } = useAuth();
  const { data, isLoading, error } = useListDots({ limit: 5 });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-lg bg-neutral-100 dark:bg-neutral-800"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 text-sm">
        Failed to load dots: {error.message}
      </div>
    );
  }

  const dots = data?.dots ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Welcome, {auth?.userId}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800">
          <p className="text-2xl font-semibold">{total}</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Visible Dots
          </p>
        </div>
        <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800">
          <p className="text-2xl font-semibold">
            {dots.filter((d) => d.created_by === auth?.userId).length}
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Created by You
          </p>
        </div>
        <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800">
          <p className="text-2xl font-semibold">
            {new Set(dots.flatMap((d) => d.tags)).size}
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Unique Tags
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-medium">Recent Dots</h2>
          <button
            onClick={() => navigate("/dots")}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          >
            View all
          </button>
        </div>
        {dots.length === 0 ? (
          <EmptyState
            title="No dots yet"
            description="Create your first dot to get started."
            action={{
              label: "Create Dot",
              onClick: () => navigate("/dots/new"),
            }}
          />
        ) : (
          <div className="space-y-3">
            {dots.map((dot) => (
              <DotCard key={dot.id} dot={dot} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
