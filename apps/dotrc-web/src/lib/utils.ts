export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function linkTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    followup: "Follow-up",
    corrects: "Corrects",
    supersedes: "Supersedes",
    related: "Related",
  };
  return labels[type] ?? type;
}

export function linkTypeColor(type: string): string {
  const colors: Record<string, string> = {
    followup: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    corrects:
      "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    supersedes: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    related:
      "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
  };
  return (
    colors[type] ??
    "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
  );
}
