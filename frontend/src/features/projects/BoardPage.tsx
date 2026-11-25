import { useMemo, useState, type FormEvent } from "react";
import {
  closestCorners, DndContext, pointerWithin, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useDroppable, useSensor, useSensors,
  type Announcements, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent, type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LabelChip, PriorityBadge, TypeBadge } from "@/features/tasks/Badges";
import { api } from "@/lib/api";
import { useFeedback } from "@/lib/feedback";
import { fmt, formatDay } from "@/lib/format";
import type { Label, ProjectDetail, TaskSummary, WorkflowState } from "@/lib/types";
import { messages } from "@/messages";
import { useProjectContext } from "./ProjectContext";
import { refreshTasks, useTasks } from "./queries";

type Items = Record<number, number[]>; // state id -> task ids, top to bottom

const columnId = (stateId: number) => `col-${stateId}`;
const isColumn = (id: UniqueIdentifier) => typeof id === "string" && id.startsWith("col-");
const stateOf = (id: UniqueIdentifier) => Number(String(id).slice(4));
const containerOf = (items: Items, id: UniqueIdentifier) =>
  isColumn(id) ? stateOf(id) : Object.keys(items).map(Number).find((stateId) => items[stateId]!.includes(id as number));

const cardClass = "bg-card space-y-2 rounded-lg border p-3 text-sm shadow-sm";

// What a card looks like. Shared by the real card and by the copy that floats under the pointer.
// Mouse and touch: the target is what is under the pointer (a card wins over its column).
// Keyboard has no pointer, so it falls back to the nearest corners. Deciding by corners alone
// picked the wrong column whenever the neighbouring column had cards.
const collisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  if (underPointer.length === 0) return closestCorners(args);
  const cards = underPointer.filter((c) => !isColumn(c.id));
  return cards.length > 0 ? cards : underPointer;
};

function CardContent({ task, labels }: { task: TaskSummary; labels: Label[] }) {
  const taskLabels = labels.filter((l) => task.labelIds.includes(l.id));
  return (
    <>
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>{task.key}</span>
        <TypeBadge type={task.type} />
      </div>
      {/* The title is a real link, so keyboard users open the task with Enter; Space lifts the card. */}
      <Link to={`/t/${task.key}`} className="block font-medium hover:underline">
        {task.parentId !== null && <span aria-hidden="true">↳ </span>}
        {task.title}
      </Link>
      {taskLabels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {taskLabels.map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <PriorityBadge priority={task.priority} />
        {task.dueDate && <span className="text-muted-foreground text-xs">{fmt(messages.board.dueLabel, { date: formatDay(task.dueDate) })}</span>}
      </div>
    </>
  );
}

function SortableCard({ task, labels, disabled }: { task: TaskSummary; labels: Label[]; disabled: boolean }) {
  const reduceMotion = useReducedMotion();
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
    transition: reduceMotion ? null : { duration: 200, easing: "ease" },
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`${cardClass} ${isDragging ? "opacity-40" : ""}`}
    >
      <CardContent task={task} labels={labels} />
    </li>
  );
}

function QuickAdd({ project, state }: { project: ProjectDetail; state: WorkflowState }) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  const add = useMutation({
    mutationFn: () => api(`/api/projects/${project.project.key}/tasks`, { method: "POST", body: { title, stateId: state.id } }),
    onSuccess: async () => {
      setTitle("");
      await refreshTasks(queryClient, project.project.key);
    },
    onError: feedback.fail,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (title.trim()) add.mutate();
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="text-muted-foreground w-full justify-start" onClick={() => setOpen(true)}>
        + {messages.board.addTask}
      </Button>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-2" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <Input autoFocus aria-label={messages.board.addPlaceholder} placeholder={messages.board.addPlaceholder} maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={add.isPending || !title.trim()}>
          {messages.board.add}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {messages.task.cancel}
        </Button>
      </div>
    </form>
  );
}

function Column({ project, state, ids, byId }: { project: ProjectDetail; state: WorkflowState; ids: number[]; byId: Map<number, TaskSummary> }) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId(state.id) });
  const readOnly = project.project.archived;

  return (
    <section
      aria-label={fmt(messages.board.columnLabel, { name: state.name, count: ids.length })}
      className={`bg-muted/40 flex w-72 shrink-0 flex-col gap-2 rounded-xl border p-2 transition-colors ${isOver ? "border-primary" : ""}`}
    >
      <h2 className="flex items-center justify-between px-1 text-sm font-semibold">
        {state.name}
        <span className="text-muted-foreground text-xs font-normal">{ids.length}</span>
      </h2>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="flex min-h-16 flex-col gap-2">
          {ids.map((id) => {
            const task = byId.get(id);
            return task ? <SortableCard key={id} task={task} labels={project.labels} disabled={readOnly} /> : null;
          })}
          {ids.length === 0 && (
            <motion.li initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="text-muted-foreground px-1 py-3 text-xs">
              {messages.board.empty}
            </motion.li>
          )}
        </ul>
      </SortableContext>
      {!readOnly && <QuickAdd project={project} state={state} />}
    </section>
  );
}

export function BoardPage() {
  const project = useProjectContext();
  const key = project.project.key;
  const { data } = useTasks(key);
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const reduceMotion = useReducedMotion();
  const [activeId, setActiveId] = useState<number | null>(null);
  // While dragging (and until the server confirms) the board shows this copy; otherwise it shows the server's data.
  const [local, setLocal] = useState<Items | null>(null);

  const tasks = useMemo(() => data ?? [], [data]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const serverItems = useMemo<Items>(
    () =>
      Object.fromEntries(
        project.states.map((s) => [s.id, tasks.filter((t) => t.stateId === s.id).sort((a, b) => a.position - b.position || a.id - b.id).map((t) => t.id)]),
      ),
    [tasks, project.states],
  );
  const items = local ?? serverItems;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), // a short click still opens the task
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  );

  const move = useMutation({
    mutationFn: ({ task, stateId, index }: { task: TaskSummary; stateId: number; index: number }) =>
      api(`/api/tasks/${task.key}/move`, { method: "POST", body: { version: task.version, stateId, index } }),
    onError: feedback.fail,
    // Wait for fresh data before dropping the local copy, so the card never jumps back and forth.
    onSettled: async () => {
      await refreshTasks(queryClient, key);
      setLocal(null);
    },
  });

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as number);
    setLocal(serverItems);
  }

  // Crossing into another column: show the card there right away.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const current = local ?? serverItems;
    const from = containerOf(current, active.id);
    const to = containerOf(current, over.id);
    if (from === undefined || to === undefined || from === to) return;
    const target = [...current[to]!];
    let index = target.length;
    if (!isColumn(over.id)) {
      const below = active.rect.current.translated && active.rect.current.translated.top > over.rect.top + over.rect.height;
      index = target.indexOf(over.id as number) + (below ? 1 : 0);
    }
    target.splice(index, 0, active.id as number);
    setLocal({ ...current, [from]: current[from]!.filter((id) => id !== active.id), [to]: target });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const current = local ?? serverItems;
    const task = byId.get(active.id as number);
    if (!over || !task) {
      setLocal(null);
      return;
    }
    let next = current;
    const container = containerOf(current, active.id);
    if (container !== undefined && container === containerOf(current, over.id)) {
      const oldIndex = current[container]!.indexOf(active.id as number);
      const newIndex = isColumn(over.id) ? current[container]!.length - 1 : current[container]!.indexOf(over.id as number);
      if (oldIndex !== newIndex) next = { ...current, [container]: arrayMove(current[container]!, oldIndex, newIndex) };
    }
    const stateId = containerOf(next, active.id);
    if (stateId === undefined) return setLocal(null);
    const index = next[stateId]!.indexOf(active.id as number);
    if (stateId === task.stateId && serverItems[stateId]!.indexOf(task.id) === index) return setLocal(null);
    setLocal(next);
    move.mutate({ task, stateId, index });
  }

  const columnName = (id: UniqueIdentifier | undefined) => {
    const stateId = id === undefined ? undefined : containerOf(items, id);
    return project.states.find((s) => s.id === stateId)?.name ?? "";
  };
  const keyOf = (id: UniqueIdentifier) => byId.get(id as number)?.key ?? "";
  const announcements: Announcements = {
    onDragStart: ({ active }) => fmt(messages.board.announce.start, { key: keyOf(active.id) }),
    onDragOver: ({ active, over }) => (over ? fmt(messages.board.announce.over, { key: keyOf(active.id), column: columnName(over.id) }) : undefined),
    onDragEnd: ({ active, over }) => (over ? fmt(messages.board.announce.drop, { key: keyOf(active.id), column: columnName(over.id) }) : undefined),
    onDragCancel: ({ active }) => fmt(messages.board.announce.cancel, { key: keyOf(active.id) }),
  };

  const activeTask = activeId === null ? undefined : byId.get(activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setLocal(null);
      }}
      accessibility={{ announcements, screenReaderInstructions: { draggable: messages.board.dragHint } }}
    >
      <div className="flex items-start gap-4 overflow-x-auto pb-4">
        {project.states.map((state) => (
          <Column key={state.id} project={project} state={state} ids={items[state.id] ?? []} byId={byId} />
        ))}
      </div>
      <DragOverlay dropAnimation={reduceMotion ? null : { duration: 200 }}>
        {activeTask ? (
          <div className={`${cardClass} border-primary shadow-lg`}>
            <CardContent task={activeTask} labels={project.labels} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
