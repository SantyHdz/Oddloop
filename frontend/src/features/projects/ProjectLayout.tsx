import { useState } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/useMe";
import { CreateTaskDialog } from "@/features/tasks/CreateTaskDialog";
import { TaskSheet } from "@/features/tasks/TaskSheet";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { messages } from "@/messages";
import { useProject } from "./queries";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "border-b-2 px-3 py-2 text-sm transition-colors",
    isActive ? "border-primary text-foreground" : "text-muted-foreground hover:text-foreground border-transparent",
  );

// /p/:key (board, list, settings) and /t/:taskKey (the same board with the task panel open).
export function ProjectLayout() {
  const params = useParams();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const key = (params.key ?? params.taskKey?.split("-")[0] ?? "").toUpperCase();
  const { data, error, isPending } = useProject(key);
  const [creating, setCreating] = useState(false);

  if (isPending) return <p className="text-muted-foreground">{messages.loading}</p>;
  if (error || !data) {
    const text = error instanceof ApiError && error.status !== 404 ? messages.errors.unknown : messages.projects.notFound;
    return <p role="alert">{text}</p>;
  }

  const staff = me?.role === "admin" || me?.role === "leader";
  const { project } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-2xl font-semibold">{project.name}</h1>
          <Badge variant="secondary">{project.key}</Badge>
          {project.archived && <Badge variant="outline">{messages.projects.archived}</Badge>}
        </div>
        {!project.archived && <Button onClick={() => setCreating(true)}>{messages.board.newTask}</Button>}
      </div>

      {project.archived && <p className="text-muted-foreground text-sm">{messages.projects.archivedNotice}</p>}

      <nav aria-label={messages.projects.tabs.nav} className="flex border-b">
        <NavLink to={`/p/${key}`} end className={tabClass}>
          {messages.projects.tabs.board}
        </NavLink>
        <NavLink to={`/p/${key}/lista`} className={tabClass}>
          {messages.projects.tabs.list}
        </NavLink>
        {staff && (
          <NavLink to={`/p/${key}/ajustes`} className={tabClass}>
            {messages.projects.tabs.settings}
          </NavLink>
        )}
      </nav>

      <Outlet context={data} />

      <CreateTaskDialog project={data} open={creating} onClose={() => setCreating(false)} />
      {params.taskKey && <TaskSheet taskKey={params.taskKey.toUpperCase()} project={data} onClose={() => navigate(`/p/${key}`)} />}
    </div>
  );
}
