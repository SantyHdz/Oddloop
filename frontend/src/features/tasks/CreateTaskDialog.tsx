import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { refreshTasks } from "@/features/projects/queries";
import { api } from "@/lib/api";
import { useFeedback } from "@/lib/feedback";
import type { Priority, ProjectDetail, TaskSummary, TaskType } from "@/lib/types";
import { messages } from "@/messages";
import { LabelToggles } from "./LabelToggles";

const types: TaskType[] = ["task", "story", "bug", "epic"];
const priorities: Priority[] = ["low", "medium", "high", "urgent"];
const emptyForm = { title: "", description: "", type: "task" as TaskType, priority: "medium" as Priority, dueDate: "", stateId: "" };

export function CreateTaskDialog({ project, open, onClose }: { project: ProjectDetail; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [form, setForm] = useState(emptyForm);
  const [labelIds, setLabelIds] = useState<number[]>([]);

  const create = useMutation({
    mutationFn: () =>
      api<{ task: TaskSummary }>(`/api/projects/${project.project.key}/tasks`, {
        method: "POST",
        body: {
          title: form.title,
          description: form.description,
          type: form.type,
          priority: form.priority,
          dueDate: form.dueDate || null,
          stateId: form.stateId ? Number(form.stateId) : undefined,
          labelIds,
        },
      }),
    onSuccess: async () => {
      await refreshTasks(queryClient, project.project.key);
      feedback.success(messages.task.created);
      setForm(emptyForm);
      setLabelIds([]);
      onClose();
    },
    onError: feedback.fail,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{messages.board.newTask}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="task-title">{messages.task.title}</Label>
            <Input id="task-title" required maxLength={300} autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-2">
              <Label>{messages.task.state}</Label>
              <Select value={form.stateId || String(project.states[0]?.id)} onValueChange={(v) => setForm({ ...form, stateId: v })}>
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
              <Label htmlFor="task-due">{messages.task.due}</Label>
              <Input id="task-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{messages.task.labels}</Label>
            <LabelToggles labels={project.labels} selected={labelIds} onChange={setLabelIds} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">{messages.task.description}</Label>
            <Textarea id="task-description" rows={3} placeholder={messages.task.descriptionPlaceholder} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {messages.task.cancel}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {messages.task.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
