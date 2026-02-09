import { linkTypeLabel, linkTypeColor } from "@/lib/utils";

export function LinkBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${linkTypeColor(type)}`}
    >
      {linkTypeLabel(type)}
    </span>
  );
}
