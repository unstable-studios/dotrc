import { useState } from "react";
import { useAuth } from "@/context/auth";

export function LoginPage() {
  const { login } = useAuth();
  const [tenantId, setTenantId] = useState("dev-tenant");
  const [userId, setUserId] = useState("dev-user");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tenantId.trim() && userId.trim()) {
      login(tenantId.trim(), userId.trim());
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-center mb-8">DotRC</h1>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 p-6 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
        >
          <div>
            <label
              htmlFor="tenantId"
              className="block text-sm font-medium mb-1.5"
            >
              Tenant ID
            </label>
            <input
              id="tenantId"
              type="text"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
              required
            />
          </div>
          <div>
            <label
              htmlFor="userId"
              className="block text-sm font-medium mb-1.5"
            >
              User ID
            </label>
            <input
              id="userId"
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 rounded-md bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Sign In
          </button>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 text-center">
            Development mode &mdash; uses trusted header auth
          </p>
        </form>
      </div>
    </div>
  );
}
