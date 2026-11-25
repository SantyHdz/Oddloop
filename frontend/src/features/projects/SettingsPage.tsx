import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/features/auth/useMe";
import { api } from "@/lib/api";
import { useFeedback } from "@/lib/feedback";
import { fmt } from "@/lib/format";
import type { Label, ProjectDetail, StateCategory, WorkflowState } from "@/lib/types";
import { messages } from "@/messages";
import { useProjectContext } from "./ProjectContext";
import { projectsKey, useDirectory } from "./queries";

const categories: StateCategory[] = ["todo", "doing", "done"];

// Every settings change reloads the project (states, labels, members) and the sidebar list.
function useProjectAction<T = void>(project: ProjectDetail, run: (input: T) => Promise<unknown>, successText?: string) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["project", project.project.key] }), queryClient.invalidateQueries({ queryKey: projectsKey })]);
      if (successText) feedback.success(successText);
    },
    onError: feedback.fail,
  });
}

function General({ project }: { project: ProjectDetail }) {
  const { project: p } = project;
  const [form, setForm] = useState({ name: p.name, description: p.description, wipLimit: String(p.wipLimit) });
  const base = `/api/projects/${p.key}`;
  const save = useProjectAction(project, () => api(base, { method: "PATCH", body: { ...form, wipLimit: Number(form.wipLimit) } }), messages.settings.saved);
  const archive = useProjectAction(project, () => api(base, { method: "PATCH", body: { archived: !p.archived } }));

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.settings.general}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={p.archived} className="space-y-4">
            <div className="space-y-2">
              <FieldLabel htmlFor="set-name">{messages.projects.name}</FieldLabel>
              <Input id="set-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="set-description">{messages.projects.description}</FieldLabel>
              <Textarea id="set-description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="set-wip">{messages.settings.wipLimit}</FieldLabel>
              <Input id="set-wip" type="number" min={1} max={100} className="w-24" aria-describedby="set-wip-help" value={form.wipLimit} onChange={(e) => setForm({ ...form, wipLimit: e.target.value })} />
              <p id="set-wip-help" className="text-muted-foreground text-xs">
                {messages.settings.wipHelp}
              </p>
            </div>
            <Button type="submit" disabled={save.isPending}>
              {messages.settings.save}
            </Button>
          </fieldset>
        </form>
        <Button variant="secondary" onClick={() => archive.mutate()} disabled={archive.isPending}>
          {p.archived ? messages.settings.unarchive : messages.settings.archive}
        </Button>
      </CardContent>
    </Card>
  );
}

function StateRow({ project, state, index }: { project: ProjectDetail; state: WorkflowState; index: number }) {
  const [name, setName] = useState(state.name);
  const base = `/api/projects/${project.project.key}/states`;
  const update = useProjectAction(project, (patch: { name?: string; category?: StateCategory }) => api(`${base}/${state.id}`, { method: "PATCH", body: patch }));
  const remove = useProjectAction(project, () => api(`${base}/${state.id}`, { method: "DELETE" }));
  const reorder = useProjectAction(project, (direction: -1 | 1) => {
    const ids = project.states.map((s) => s.id);
    const target = index + direction;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    return api(`${base}/order`, { method: "PUT", body: { ids } });
  });
  const last = project.states.length - 1;

  return (
    <li className="flex flex-wrap items-center gap-2">
      <Input
        aria-label={messages.settings.stateName}
        className="w-44"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== state.name && update.mutate({ name })}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <Select value={state.category} onValueChange={(v) => update.mutate({ category: v as StateCategory })}>
        <SelectTrigger aria-label={messages.settings.states} className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {categories.map((c) => (
            <SelectItem key={c} value={c}>
              {messages.settings.category[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon" aria-label={fmt(messages.settings.moveUp, { name: state.name })} disabled={index === 0} onClick={() => reorder.mutate(-1)}>
        <ArrowUp className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label={fmt(messages.settings.moveDown, { name: state.name })} disabled={index === last} onClick={() => reorder.mutate(1)}>
        <ArrowDown className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label={fmt(messages.settings.remove, { name: state.name })} onClick={() => remove.mutate()}>
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}

function States({ project }: { project: ProjectDetail }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StateCategory>("doing");
  const add = useProjectAction(project, () => api(`/api/projects/${project.project.key}/states`, { method: "POST", body: { name, category } }));

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate(undefined, { onSuccess: () => setName("") });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.settings.states}</CardTitle>
        <p className="text-muted-foreground text-sm">{messages.settings.statesHelp}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {project.states.map((state, index) => (
            // Keyed by id and name so a rename from elsewhere refreshes the field.
            <StateRow key={`${state.id}-${state.name}`} project={project} state={state} index={index} />
          ))}
        </ul>
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <Input aria-label={messages.settings.stateName} placeholder={messages.settings.stateName} className="w-44" required value={name} onChange={(e) => setName(e.target.value)} />
          <Select value={category} onValueChange={(v) => setCategory(v as StateCategory)}>
            <SelectTrigger aria-label={messages.settings.states} className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {messages.settings.category[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="secondary" disabled={add.isPending}>
            {messages.settings.addState}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function LabelRow({ project, label }: { project: ProjectDetail; label: Label }) {
  const [name, setName] = useState(label.name);
  const base = `/api/projects/${project.project.key}/labels/${label.id}`;
  const update = useProjectAction(project, (patch: { name?: string; color?: string }) => api(base, { method: "PATCH", body: patch }));
  const remove = useProjectAction(project, () => api(base, { method: "DELETE" }));
  return (
    <li className="flex items-center gap-2">
      <input type="color" aria-label={messages.settings.labelColor} className="size-9 cursor-pointer rounded border bg-transparent p-0.5" value={label.color} onChange={(e) => update.mutate({ color: e.target.value })} />
      <Input
        aria-label={messages.settings.labelName}
        className="w-44"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== label.name && update.mutate({ name })}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <Button variant="ghost" size="icon" aria-label={fmt(messages.settings.remove, { name: label.name })} onClick={() => remove.mutate()}>
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}

function Labels({ project }: { project: ProjectDetail }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#f28c38");
  const add = useProjectAction(project, () => api(`/api/projects/${project.project.key}/labels`, { method: "POST", body: { name, color } }));

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate(undefined, { onSuccess: () => setName("") });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.settings.labels}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {project.labels.map((label) => (
            <LabelRow key={`${label.id}-${label.name}`} project={project} label={label} />
          ))}
        </ul>
        <form onSubmit={submit} className="flex items-center gap-2">
          <input type="color" aria-label={messages.settings.labelColor} className="size-9 cursor-pointer rounded border bg-transparent p-0.5" value={color} onChange={(e) => setColor(e.target.value)} />
          <Input aria-label={messages.settings.labelName} placeholder={messages.settings.labelName} className="w-44" required value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={add.isPending}>
            {messages.settings.addLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Members({ project }: { project: ProjectDetail }) {
  const people = useDirectory(true);
  const [userId, setUserId] = useState("");
  const base = `/api/projects/${project.project.key}/members`;
  const add = useProjectAction(project, () => api(base, { method: "POST", body: { userId: Number(userId) } }));
  const remove = useProjectAction(project, (id: number) => api(`${base}/${id}`, { method: "DELETE" }));
  const candidates = (people.data ?? []).filter((p) => !project.members.some((m) => m.id === p.id));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (userId) add.mutate(undefined, { onSuccess: () => setUserId("") });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.settings.members}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-1">
          {project.members.map((m) => (
            <li key={m.id} className="flex items-center justify-between text-sm">
              <span>
                {m.name} <span className="text-muted-foreground text-xs">{messages.roles[m.role]}</span>
              </span>
              <Button variant="ghost" size="icon" aria-label={fmt(messages.settings.removeMember, { name: m.name })} onClick={() => remove.mutate(m.id)}>
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
        <form onSubmit={submit} className="flex items-center gap-2">
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger aria-label={messages.settings.addMember} className="w-56">
              <SelectValue placeholder={messages.settings.chooseMember} />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="secondary" disabled={!userId || add.isPending}>
            {messages.settings.addMember}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const project = useProjectContext();
  const { data: me } = useMe();
  // The backend refuses these changes to members anyway; this only avoids showing a broken screen.
  if (me?.role !== "admin" && me?.role !== "leader") return <p role="alert">{messages.settings.forbidden}</p>;
  return (
    <div className="max-w-3xl space-y-6">
      <h2 className="text-xl font-semibold">{messages.settings.title}</h2>
      <General key={`${project.project.name}-${project.project.archived}`} project={project} />
      <States project={project} />
      <Labels project={project} />
      <Members project={project} />
    </div>
  );
}
