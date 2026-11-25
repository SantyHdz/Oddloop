import { useDeferredValue, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LabelChip, PriorityBadge, TypeBadge } from "@/features/tasks/Badges";
import { fmt, formatDay } from "@/lib/format";
import { messages } from "@/messages";
import { useProjectContext } from "./ProjectContext";
import { useTasks, type TaskFilters } from "./queries";

const ALL = "all"; // a Select cannot hold an empty value, so "no filter" has a name

function FilterSelect({ label, value, onChange, all, options }: { label: string; value: string; onChange: (v: string) => void; all: string; options: { value: string; text: string }[] }) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <SelectTrigger aria-label={label} className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{all}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const sortable = [
  { column: "number", text: messages.list.columns.key },
  { column: "priority", text: messages.list.columns.priority },
  { column: "dueDate", text: messages.list.columns.due },
] as const;

export function ListPage() {
  const { project, states, labels } = useProjectContext();
  const [filters, setFilters] = useState<TaskFilters>({ sort: "number", dir: "asc" });
  const deferredSearch = useDeferredValue(filters.q);
  const { data: tasks = [] } = useTasks(project.key, { ...filters, q: deferredSearch });
  const set = (patch: TaskFilters) => setFilters((f) => ({ ...f, ...patch }));
  const stateName = (id: number) => states.find((s) => s.id === id)?.name ?? "";
  const hasFilters = Boolean(filters.stateId || filters.type || filters.priority || filters.labelId || filters.q || filters.dueFrom || filters.dueTo);

  function sortBy(column: string) {
    setFilters((f) => ({ ...f, sort: column, dir: f.sort === column && f.dir === "asc" ? "desc" : "asc" }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <FieldLabel htmlFor="list-search">{messages.list.search}</FieldLabel>
          <Input id="list-search" className="w-52" placeholder={messages.list.searchPlaceholder} value={filters.q ?? ""} onChange={(e) => set({ q: e.target.value })} />
        </div>
        <FilterSelect label={messages.task.state} value={filters.stateId ?? ""} onChange={(v) => set({ stateId: v })} all={messages.list.allStates} options={states.map((s) => ({ value: String(s.id), text: s.name }))} />
        <FilterSelect label={messages.task.typeLabel} value={filters.type ?? ""} onChange={(v) => set({ type: v })} all={messages.list.allTypes} options={(["task", "story", "bug", "epic"] as const).map((t) => ({ value: t, text: messages.task.type[t] }))} />
        <FilterSelect label={messages.task.priorityLabel} value={filters.priority ?? ""} onChange={(v) => set({ priority: v })} all={messages.list.allPriorities} options={(["low", "medium", "high", "urgent"] as const).map((p) => ({ value: p, text: messages.task.priority[p] }))} />
        <FilterSelect label={messages.task.labels} value={filters.labelId ?? ""} onChange={(v) => set({ labelId: v })} all={messages.list.allLabels} options={labels.map((l) => ({ value: String(l.id), text: l.name }))} />
        <div className="space-y-1">
          <FieldLabel htmlFor="list-from">{messages.list.dueFrom}</FieldLabel>
          <Input id="list-from" type="date" className="w-40" value={filters.dueFrom ?? ""} onChange={(e) => set({ dueFrom: e.target.value })} />
        </div>
        <div className="space-y-1">
          <FieldLabel htmlFor="list-to">{messages.list.dueTo}</FieldLabel>
          <Input id="list-to" type="date" className="w-40" value={filters.dueTo ?? ""} onChange={(e) => set({ dueTo: e.target.value })} />
        </div>
        {hasFilters && (
          <Button variant="ghost" onClick={() => setFilters({ sort: filters.sort, dir: filters.dir })}>
            {messages.list.clear}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {sortable.map(({ column, text }) => (
                <TableHead key={column} aria-sort={filters.sort === column ? (filters.dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="inline-flex items-center gap-1" aria-label={fmt(messages.list.sortBy, { column: text })} onClick={() => sortBy(column)}>
                    {text}
                    {filters.sort === column && (filters.dir === "asc" ? <ArrowUp className="size-3.5" aria-hidden="true" /> : <ArrowDown className="size-3.5" aria-hidden="true" />)}
                  </button>
                </TableHead>
              ))}
              <TableHead>{messages.list.columns.title}</TableHead>
              <TableHead>{messages.list.columns.type}</TableHead>
              <TableHead>{messages.list.columns.state}</TableHead>
              <TableHead>{messages.list.columns.labels}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-6 text-center">
                  {messages.list.empty}
                </TableCell>
              </TableRow>
            )}
            {tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  <Link className="hover:underline" to={`/t/${task.key}`}>
                    {task.key}
                  </Link>
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={task.priority} />
                </TableCell>
                <TableCell className="whitespace-nowrap">{task.dueDate ? formatDay(task.dueDate) : ""}</TableCell>
                <TableCell className="font-medium">
                  <Link className="hover:underline" to={`/t/${task.key}`}>
                    {task.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <TypeBadge type={task.type} />
                </TableCell>
                <TableCell>{stateName(task.stateId)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {labels
                      .filter((l) => task.labelIds.includes(l.id))
                      .map((l) => (
                        <LabelChip key={l.id} label={l} />
                      ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
