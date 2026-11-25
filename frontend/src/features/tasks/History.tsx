import { fmt, formatMoment } from "@/lib/format";
import type { LinkType, TaskEvent } from "@/lib/types";
import { messages } from "@/messages";

const fieldNames = messages.events.fields as Record<string, string>;

// Turns one history entry into a sentence from the central messages file.
export function describeEvent(event: TaskEvent): string {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const actor = event.actorName;
  switch (event.type) {
    case "created":
      return fmt(messages.events.created, { actor });
    case "updated": {
      const changed = Object.keys((payload.changes as object | undefined) ?? {});
      if (payload.labels) changed.push("labels");
      const fields = changed.map((f) => fieldNames[f] ?? f).join(", ");
      return fmt(messages.events.updated, { actor, fields });
    }
    case "state_changed":
      return fmt(messages.events.state_changed, { actor, from: String(payload.from ?? ""), to: String(payload.to ?? "") });
    case "commented":
      return fmt(messages.events.commented, { actor });
    case "link_added":
    case "link_removed": {
      const type = messages.task.linkType[payload.type as LinkType] ?? "";
      return fmt(messages.events[event.type], { actor, type, to: String(payload.to ?? "") });
    }
    case "attachment_added":
      return fmt(messages.events.attachment_added, { actor, filename: String(payload.filename ?? "") });
    default:
      return actor;
  }
}

export function History({ events }: { events: TaskEvent[] }) {
  return (
    <section aria-labelledby="history-title" className="space-y-2">
      <h3 id="history-title" className="text-sm font-semibold">
        {messages.task.history}
      </h3>
      <ol className="space-y-1.5">
        {[...events].reverse().map((event) => (
          <li key={event.id} className="text-muted-foreground text-xs">
            <span className="text-foreground">{describeEvent(event)}</span> · {formatMoment(event.createdAt)}
          </li>
        ))}
      </ol>
    </section>
  );
}
