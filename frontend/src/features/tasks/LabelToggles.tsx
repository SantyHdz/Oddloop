import type { Label } from "@/lib/types";
import { messages } from "@/messages";

// Labels as buttons that switch on and off. aria-pressed tells screen readers which are on.
export function LabelToggles({ labels, selected, onChange }: { labels: Label[]; selected: number[]; onChange: (ids: number[]) => void }) {
  if (labels.length === 0) return <p className="text-muted-foreground text-sm">{messages.task.noLabels}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label) => {
        const on = selected.includes(label.id);
        return (
          <button
            key={label.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((id) => id !== label.id) : [...selected, label.id])}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-primary bg-accent" : "border-border text-muted-foreground hover:bg-accent"}`}
          >
            <span className="size-2 rounded-full" style={{ backgroundColor: label.color }} aria-hidden="true" />
            {label.name}
          </button>
        );
      })}
    </div>
  );
}
