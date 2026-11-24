import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { meKey, useMe } from "@/features/auth/useMe";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { messages } from "@/messages";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-md px-3 py-2 text-sm transition-colors",
    isActive ? "bg-accent text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
  );

export function AppLayout() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const logout = useMutation({
    mutationFn: () => api("/api/auth/logout", { method: "POST" }),
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(meKey, null);
      navigate("/login", { replace: true });
    },
  });

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="bg-card flex flex-col gap-3 border-b p-4 md:min-h-screen md:w-60 md:border-r md:border-b-0">
        <p className="text-xl font-semibold tracking-tight">
          Odd <span className="text-primary">Loop</span>
        </p>
        <nav aria-label={messages.nav.main} className="flex flex-wrap gap-1 md:flex-col">
          <NavLink to="/" end className={linkClass}>
            {messages.nav.home}
          </NavLink>
          {me?.role === "admin" && (
            <NavLink to="/equipo" className={linkClass}>
              {messages.nav.team}
            </NavLink>
          )}
          <NavLink to="/cuenta" className={linkClass}>
            {messages.nav.account}
          </NavLink>
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 md:flex-col md:items-start">
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{me?.name}</p>
            <p className="text-muted-foreground truncate text-xs">{me ? messages.roles[me.role] : null}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => logout.mutate()}>
            {messages.nav.logout}
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-6">
        {/* The content fades in when you change page: shows that something changed. */}
        <motion.div key={pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
