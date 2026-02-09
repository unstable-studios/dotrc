import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/auth";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/dots", label: "Dots" },
  { to: "/dots/new", label: "Create" },
];

export function Layout() {
  const { auth, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="text-lg font-semibold tracking-tight"
            >
              DotRC
            </Link>
            <nav className="hidden sm:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === item.to
                      ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          {auth && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">
                {auth.userId}
              </span>
              <button
                onClick={logout}
                className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto px-4 py-6 w-full">
        <Outlet />
      </main>
    </div>
  );
}
