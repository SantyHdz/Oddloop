import { Fragment, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { refreshTasks } from "@/features/projects/queries";
import { api } from "@/lib/api";
import { useFeedback } from "@/lib/feedback";
import { formatMoment } from "@/lib/format";
import type { TaskComment, TaskDetail } from "@/lib/types";
import { messages } from "@/messages";

interface Member {
  id: number;
  name: string;
}

// "@" followed by letters just before the cursor starts a mention.
const MENTION_AT_CURSOR = /(^|\s)@([^\s@]*)$/;

function MentionTextarea({ value, onChange, members, onPick }: { value: string; onChange: (v: string) => void; members: Member[]; onPick: (m: Member) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const matches = query === null ? [] : members.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const text = event.target.value;
    onChange(text);
    const found = MENTION_AT_CURSOR.exec(text.slice(0, event.target.selectionStart));
    setQuery(found ? (found[2] ?? "") : null);
    setActive(0);
  }

  function pick(member: Member) {
    const caret = ref.current?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const found = MENTION_AT_CURSOR.exec(before);
    if (!found) return;
    const start = before.length - (found[2]?.length ?? 0) - 1;
    const inserted = `@${member.name} `;
    onChange(value.slice(0, start) + inserted + value.slice(caret));
    onPick(member);
    setQuery(null);
    const next = start + inserted.length;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(next, next);
    });
  }

  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (matches.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      pick(matches[active]!);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setQuery(null);
    }
  }

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        rows={3}
        aria-label={messages.task.comments}
        placeholder={messages.task.commentPlaceholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKey}
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls="mention-list"
        aria-autocomplete="list"
      />
      {matches.length > 0 && (
        <ul id="mention-list" role="listbox" aria-label={messages.task.mentionList} className="bg-popover absolute z-10 mt-1 w-64 rounded-md border p-1 shadow-md">
          {matches.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                tabIndex={-1}
                // mousedown instead of click: the textarea must not lose focus before we read its cursor.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m);
                }}
                className={`w-full rounded px-2 py-1 text-left text-sm ${i === active ? "bg-accent" : ""}`}
              >
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Highlights the names that were really mentioned.
function CommentBody({ comment }: { comment: TaskComment }) {
  const names = comment.mentions.map((m) => m.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (names.length === 0) return <>{comment.body}</>;
  const parts = comment.body.split(new RegExp(`(@(?:${names.join("|")}))`, "g"));
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{part.startsWith("@") && i % 2 === 1 ? <span className="text-primary font-medium">{part}</span> : part}</Fragment>
      ))}
    </>
  );
}

export function Comments({ detail, projectKey, members, readOnly }: { detail: TaskDetail; projectKey: string; members: Member[]; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<Member[]>([]);
  const taskKey = detail.task.key;

  const add = useMutation({
    mutationFn: () =>
      // Only people whose "@name" is still in the text are mentioned.
      api(`/api/tasks/${taskKey}/comments`, { method: "POST", body: { body, mentionUserIds: picked.filter((m) => body.includes(`@${m.name}`)).map((m) => m.id) } }),
    onSuccess: async () => {
      setBody("");
      setPicked([]);
      await refreshTasks(queryClient, projectKey, taskKey);
    },
    onError: feedback.fail,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate();
  }

  return (
    <section aria-labelledby="comments-title" className="space-y-3">
      <h3 id="comments-title" className="text-sm font-semibold">
        {messages.task.comments}
      </h3>
      {detail.comments.length === 0 && <p className="text-muted-foreground text-sm">{messages.task.noComments}</p>}
      <ul className="space-y-3">
        {detail.comments.map((comment) => (
          <li key={comment.id} className="bg-card rounded-md border p-3 text-sm">
            <p className="text-muted-foreground mb-1 text-xs">
              <span className="text-foreground font-medium">{comment.authorName}</span> · {formatMoment(comment.createdAt)}
            </p>
            <p className="whitespace-pre-wrap">
              <CommentBody comment={comment} />
            </p>
          </li>
        ))}
      </ul>
      {!readOnly && (
        <form onSubmit={submit} className="space-y-2">
          <MentionTextarea value={body} onChange={setBody} members={members} onPick={(m) => setPicked((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]))} />
          <Button type="submit" variant="secondary" disabled={add.isPending || !body.trim()}>
            {messages.task.comment}
          </Button>
        </form>
      )}
    </section>
  );
}
