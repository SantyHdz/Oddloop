import { ChevronDown, ChevronUp, ChevronsUp, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Label, Priority, TaskType } from "@/lib/types";
import { messages } from "@/messages";

// Priority is shown with an icon and a word, never by color alone.
const priorityIcon = { low: ChevronDown, medium: Minus, high: ChevronUp, urgent: ChevronsUp } as const;
const priorityColor: Record<Priority, string> = {
  low: "text-muted-foreground",
  medium: "text-muted-foreground",
  high: "text-primary",
  urgent: "text-destructive",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const Icon = priorityIcon[priority];
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${priorityColor[priority]}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {messages.task.priority[priority]}
    </span>
  );
}

export function TypeBadge({ type }: { type: TaskType }) {
  return (
    <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-normal">
      {messages.task.type[type]}
    </Badge>
  );
}

export function LabelChip({ label }: { label: Label }) {
  return (
    <span className="bg-secondary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]">
      <span className="size-2 rounded-full" style={{ backgroundColor: label.color }} aria-hidden="true" />
      {label.name}
    </span>
  );
}
