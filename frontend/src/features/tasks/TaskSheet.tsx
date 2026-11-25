import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { refreshTasks, useTaskDetail } from "@/features/projects/queries";
import { api, ApiError } from "@/lib/api";
import { useFeedback } from "@/lib/feedback";
import type { Priority, ProjectDetail, TaskDetail, TaskSummary, TaskType } from "@/lib/types";
import { messages } from "@/messages";
import { Attachments } from "./Attachments";
import { Comments } from "./Comments";
import { History } from "./History";
import { LabelToggles } from "./LabelToggles";
import { Relations } from "./Relations";
import { Subtasks } from "./Subtasks";

const types: TaskType[] = ["task", "story", "bug", "epic"];
const priorities: Priority[] = ["low", "medium", "high", "urgent"];

interface Form {
  title: string;
  description: string;
  type: TaskType;
  priority: Priority;
  dueDate: string;
  labelIds: number[];
}

const formFrom = (d: TaskDetail): Form => ({
  title: d.task.title,
  description: d.task.description,
  type: d.task.type,
  priority: d.task.priority,
  dueDate: d.task.dueDate ?? "",
  labelIds: [...d.task.labelIds].sort((a, b) => a - b),
});

function Editor({
  detail, project, baseVersion, setBaseVersion, onSaved, onReload,
}: {
  detail: TaskDetail;
  project: ProjectDetail;
  baseVersion: number;
  setBaseVersion: (v: number) => void;
  onSaved: () => void;
  onReload: () => void;
}) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const key = detail.task.key;
  const projectKey = project.project.key;
  const readOnly = project.project.archived;

  // The form starts from the task as it was when the panel opened and is not overwritten by later
  // refreshes: unsaved typing is never lost silently, and a clash is reported when saving (RN-13).
  const [initial] = useState(() => formFrom(detail));
  const [form, setForm] = useState(initial);
  const [conflict, setConflict] = useState(false);
  const dirty = JSON.stringify({ ...form, labelIds: [...form.labelIds].sort((a, b) => a - b) }) !== JSON.stringify(initial);

  const save = useMutation({
    mutationFn: () =>
      api<TaskDetail>(`/api/tasks/${key}`, {
        method: "PATCH",
        body: { version: baseVersion, ...form, dueDate: form.dueDate || null },
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(["task", key], updated);
      await refreshTasks(queryClient, projectKey);
      feedback.success(messages.task.saved);
      setBaseVersion(updated.task.version);
      onSaved();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "version_conflict") setConflict(true);
      feedback.fail(error);
    },
  });

  const move = useMutation({
    mutationFn: (stateId: number) =>
      api<{ task: TaskSummary }>(`/api/tasks/${key}/move`, { method: "POST", body: { version: baseVersion, stateId, index: 9999 } }),
    onSuccess: async ({ task }) => {
      setBaseVersion(task.version);
      await refreshTasks(queryClient, projectKey, key);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "version_conflict") setConflict(true);
      feedback.fail(error);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {conflict && (
        <div role="alert" className="border-destructive bg-card space-y-2 rounded-md border p-3 text-sm">
          <p className="font-medium">{messages.task.conflictTitle}</p>
          <p className="text-muted-foreground">{messages.task.conflictText}</p>
          <Button type="button" size="sm" onClick={onReload}>
            {messages.task.reload}
          </Button>
        </div>
      )}
      <fieldset disabled={readOnly} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="edit-title">{messages.task.title}</Label>
          <Input id="edit-title" required maxLength={300} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{messages.task.state}</Label>
            <Select value={String(detail.task.stateId)} onValueChange={(v) => move.mutate(Number(v))} disabled={move.isPending}>
              <SelectTrigger aria-label={messages.task.state}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {project.states.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-due">{messages.task.due}</Label>
            <Input id="edit-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{messages.task.typeLabel}</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as TaskType })}>
              <SelectTrigger aria-label={messages.task.typeLabel}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>
                    {messages.task.type[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{messages.task.priorityLabel}</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as Priority })}>
              <SelectTrigger aria-label={messages.task.priorityLabel}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorities.map((p) => (
                  <SelectItem key={p} value={p}>
                    {messages.task.priority[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>{messages.task.labels}</Label>
          <LabelToggles labels={project.labels} selected={form.labelIds} onChange={(labelIds) => setForm({ ...form, labelIds })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-description">{messages.task.description}</Label>
          <Textarea id="edit-description" rows={5} placeholder={messages.task.descriptionPlaceholder} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </fieldset>
      {!readOnly && (
        <Button type="submit" disabled={!dirty || save.isPending}>
          {messages.task.save}
        </Button>
      )}
    </form>
  );
}

function Body({ detail, project }: { detail: TaskDetail; project: ProjectDetail }) {
  const queryClient = useQueryClient();
  const [epoch, setEpoch] = useState(0);
  const [baseVersion, setBaseVersion] = useState(detail.task.version);
  const readOnly = project.project.archived;
  const key = detail.task.key;

  // Throw away local edits and start again from what is on the server.
  async function reload() {
    await queryClient.invalidateQueries({ queryKey: ["task", key] });
    const fresh = queryClient.getQueryData<TaskDetail>(["task", key]);
    if (fresh) setBaseVersion(fresh.task.version);
    setEpoch((n) => n + 1);
  }

  return (
    <div className="space-y-6 pb-8">
      <Editor key={`${key}-${epoch}`} detail={detail} project={project} baseVersion={baseVersion} setBaseVersion={setBaseVersion} onSaved={() => setEpoch((n) => n + 1)} onReload={() => void reload()} />
      <Subtasks detail={detail} project={project} readOnly={readOnly} />
      <Relations detail={detail} projectKey={project.project.key} readOnly={readOnly} />
      <Attachments detail={detail} projectKey={project.project.key} readOnly={readOnly} />
      <Comments detail={detail} projectKey={project.project.key} members={project.members} readOnly={readOnly} />
      <History events={detail.events} />
    </div>
  );
}

// The task opens in a side panel over the board and keeps its own URL (/t/WEB-42).
export function TaskSheet({ taskKey, project, onClose }: { taskKey: string; project: ProjectDetail; onClose: () => void }) {
  const { data, error } = useTaskDetail(taskKey);
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto px-4 sm:max-w-xl">
        <SheetHeader className="px-0">
          <SheetTitle>{taskKey}</SheetTitle>
          <SheetDescription>{messages.task.sheetDescription}</SheetDescription>
        </SheetHeader>
        {error && <p role="alert">{messages.task.notFound}</p>}
        {!error && !data && <p className="text-muted-foreground">{messages.loading}</p>}
        {data && <Body key={data.task.id} detail={data} project={project} />}
      </SheetContent>
    </Sheet>
  );
}
