import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useFeedback } from "@/lib/feedback";
import type { Project } from "@/lib/types";
import { messages } from "@/messages";
import { projectsKey, useDirectory } from "./queries";

export function CreateProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const feedback = useFeedback();
  const people = useDirectory(open);
  const [form, setForm] = useState({ key: "", name: "", description: "" });
  const [memberIds, setMemberIds] = useState<number[]>([]);

  const create = useMutation({
    mutationFn: () => api<{ project: Project }>("/api/projects", { method: "POST", body: { ...form, memberIds } }),
    onSuccess: async ({ project }) => {
      await queryClient.invalidateQueries({ queryKey: projectsKey });
      feedback.success(messages.projects.created);
      setForm({ key: "", name: "", description: "" });
      setMemberIds([]);
      onClose();
      navigate(`/p/${project.key}`);
    },
    onError: feedback.fail,
  });

  const toggle = (id: number, on: boolean) => setMemberIds((ids) => (on ? [...ids, id] : ids.filter((x) => x !== id)));

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{messages.projects.createTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="project-name">{messages.projects.name}</Label>
            <Input id="project-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-key">{messages.projects.key}</Label>
            <Input
              id="project-key"
              required
              minLength={2}
              maxLength={5}
              pattern="[A-Za-z]{2,5}"
              aria-describedby="project-key-help"
              className="w-28 uppercase"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })}
            />
            <p id="project-key-help" className="text-muted-foreground text-xs">
              {messages.projects.keyHelp}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">{messages.projects.description}</Label>
            <Textarea id="project-description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{messages.projects.members}</legend>
            {people.data?.length === 0 && <p className="text-muted-foreground text-sm">{messages.projects.noMembers}</p>}
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {people.data?.map((person) => (
                <label key={person.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={memberIds.includes(person.id)} onCheckedChange={(on) => toggle(person.id, on === true)} />
                  {person.name}
                  <span className="text-muted-foreground text-xs">{messages.roles[person.role]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {messages.projects.cancel}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {messages.projects.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
