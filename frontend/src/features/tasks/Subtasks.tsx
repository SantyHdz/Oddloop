import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { refreshTasks } from "@/features/projects/queries";
import { api } from "@/lib/api";
import { useFeedback } from "@/lib/feedback";
import type { ProjectDetail, TaskDetail } from "@/lib/types";
import { messages } from "@/messages";
import { PriorityBadge } from "./Badges";

export function Subtasks({ detail, project, readOnly }: { detail: TaskDetail; project: ProjectDetail; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [title, setTitle] = useState("");
  const { task, subtasks, parent } = detail;
  const stateName = (id: number) => project.states.find((s) => s.id === id)?.name ?? "";

  const add = useMutation({
    mutationFn: () => api(`/api/projects/${project.project.key}/tasks`, { method: "POST", body: { title, parentId: task.id } }),
    onSuccess: async () => {
      setTitle("");
      await refreshTasks(queryClient, project.project.key, task.key);
    },
    onError: feedback.fail,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate();
  }

  return (
    <section aria-labelledby="subtasks-title" className="space-y-2">
      <h3 id="subtasks-title" className="text-sm font-semibold">
        {messages.task.subtasks}
      </h3>
      {parent && (
        <p className="text-muted-foreground text-sm">
          {messages.task.parent}{" "}
          <Link className="text-primary underline" to={`/t/${parent.key}`}>
            {parent.key}
          </Link>{" "}
          {parent.title}
        </p>
      )}
      <ul className="space-y-1">
        {subtasks.map((s) => (
          <li key={s.id} className="bg-card flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
            <Link className="min-w-0 truncate hover:underline" to={`/t/${s.key}`}>
              <span className="text-muted-foreground mr-2">{s.key}</span>
              {s.title}
            </Link>
            <span className="flex shrink-0 items-center gap-3">
              <PriorityBadge priority={s.priority} />
              <span className="text-muted-foreground text-xs">{stateName(s.stateId)}</span>
            </span>
          </li>
        ))}
      </ul>
      {/* One level only: a subtask cannot have subtasks. */}
      {!readOnly && !parent && (
        <form onSubmit={submit} className="flex gap-2">
          <Input aria-label={messages.task.addSubtask} placeholder={messages.task.subtaskPlaceholder} maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={add.isPending || !title.trim()}>
            {messages.task.addSubtask}
          </Button>
        </form>
      )}
    </section>
  );
}
