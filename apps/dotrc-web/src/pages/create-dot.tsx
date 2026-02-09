import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateDot } from "@/hooks/use-dots";

export function CreateDotPage() {
  const navigate = useNavigate();
  const mutation = useCreateDot();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [scopeId, setScopeId] = useState("");
  const [visibleToUsers, setVisibleToUsers] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(
      {
        title: title.trim(),
        body: body.trim() || undefined,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        scope_id: scopeId.trim() || undefined,
        visible_to_users: visibleToUsers
          .split(",")
          .map((u) => u.trim())
          .filter(Boolean),
      },
      {
        onSuccess: (res) => {
          navigate(`/dots/${res.dot_id}`);
        },
      },
    );
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold mb-6">Create Dot</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-1.5">
            Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
            required
          />
        </div>

        <div>
          <label htmlFor="body" className="block text-sm font-medium mb-1.5">
            Body
          </label>
          <textarea
            id="body"
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 resize-y"
          />
        </div>

        <div>
          <label htmlFor="tags" className="block text-sm font-medium mb-1.5">
            Tags
          </label>
          <input
            id="tags"
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tag1, tag2, tag3"
            className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Comma-separated list of tags
          </p>
        </div>

        <div>
          <label
            htmlFor="scopeId"
            className="block text-sm font-medium mb-1.5"
          >
            Scope ID (optional)
          </label>
          <input
            id="scopeId"
            type="text"
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
          />
        </div>

        <div>
          <label
            htmlFor="visibleTo"
            className="block text-sm font-medium mb-1.5"
          >
            Visible to Users (optional)
          </label>
          <input
            id="visibleTo"
            type="text"
            value={visibleToUsers}
            onChange={(e) => setVisibleToUsers(e.target.value)}
            placeholder="user1, user2"
            className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Comma-separated list of user IDs (defaults to you)
          </p>
        </div>

        {mutation.error && (
          <div className="p-3 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-200 text-sm">
            {mutation.error.message}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-4 py-2 text-sm font-medium rounded-md bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {mutation.isPending ? "Creating..." : "Create Dot"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
