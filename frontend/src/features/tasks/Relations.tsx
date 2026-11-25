import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { refreshTasks } from "@/features/projects/queries";
import { api } from "@/lib/api";
import { useFeedback } from "@/lib/feedback";
import { fmt } from "@/lib/format";
import type { LinkType, TaskDetail } from "@/lib/types";
import { messages } from "@/messages";

const linkTypes: LinkType[] = ["blocks", "depends_on", "relates_to"];

export function Relations({ detail, projectKey, readOnly }: { detail: TaskDetail; projectKey: string; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [type, setType] = useState<LinkType>("relates_to");
  const [target, setTarget] = useState("");
  const taskKey = detail.task.key;

  const refresh = () => refreshTasks(queryClient, projectKey, taskKey);
  const add = useMutation({
    mutationFn: () => api(`/api/tasks/${taskKey}/links`, { method: "POST", body: { toKey: target.trim(), type } }),
    onSuccess: async () => {
      setTarget("");
      await refresh();
    },
    onError: feedback.fail,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/tasks/${taskKey}/links/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: feedback.fail,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate();
  }

  return (
    <section aria-labelledby="relations-title" className="space-y-2">
      <h3 id="relations-title" className="text-sm font-semibold">
        {messages.task.relations}
      </h3>
      {detail.links.length === 0 && <p className="text-muted-foreground text-sm">{messages.task.noRelations}</p>}
      <ul className="space-y-1">
        {detail.links.map((link) => (
          <li key={link.id} className="bg-card flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
            <span className="min-w-0 truncate">
              <span className="text-muted-foreground mr-2">{(link.direction === "out" ? messages.task.linkType : messages.task.linkTypeIn)[link.type]}</span>
              <Link className="text-primary hover:underline" to={`/t/${link.key}`}>
                {link.key}
              </Link>{" "}
              {link.title}
            </span>
            {!readOnly && (
              <Button variant="ghost" size="icon" className="size-7" aria-label={fmt(messages.task.removeRelation, { key: link.key })} onClick={() => remove.mutate(link.id)}>
                <X className="size-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <form onSubmit={submit} className="flex flex-wrap gap-2">
          <Select value={type} onValueChange={(v) => setType(v as LinkType)}>
            <SelectTrigger aria-label={messages.task.relations} className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {linkTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {messages.task.linkType[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input aria-label={messages.task.relationTarget} placeholder={messages.task.relationTarget} className="min-w-40 flex-1" value={target} onChange={(e) => setTarget(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={add.isPending || !target.trim()}>
            {messages.task.addRelation}
          </Button>
        </form>
      )}
    </section>
  );
}
