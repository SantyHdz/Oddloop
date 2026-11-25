import { and, asc, desc, eq, gte, ilike, inArray, lte, max, or, sql } from "drizzle-orm";
import type { User } from "../accounts/types.js";
import type { Action } from "../auth/permissions.js";
import {
  attachments,
  commentMentions,
  comments,
  labels,
  projectMembers,
  projects,
  taskEvents,
  taskLabels,
  taskLinks,
  tasks,
  users,
  workflowStates,
} from "../db/schema.js";
import { isUniqueViolation, type Db, type Executor, type Tx } from "../db/types.js";
import { AppError } from "../errors.js";
import { assertWritable, loadProject, type Project } from "../projects/access.js";

type Task = typeof tasks.$inferSelect;
export type TaskType = Task["type"];
export type Priority = Task["priority"];
export type LinkType = (typeof taskLinks.$inferSelect)["type"];

const TASK_KEY = /^([A-Za-z]{2,5})-(\d+)$/;
const GAP = 1000; // distance between tasks in a column, so a move only rewrites that column

function parseKey(taskKey: string) {
  const match = TASK_KEY.exec(taskKey.trim());
  if (!match) throw new AppError(404, "task_not_found", "Task not found");
  return { projectKey: match[1]!.toUpperCase(), number: Number(match[2]) };
}

function requireText(value: string, what: string, maxLength: number) {
  const text = value.trim();
  if (!text || text.length > maxLength) throw new AppError(400, "invalid_input", `${what} is empty or too long`);
  return text;
}

// A real calendar day written YYYY-MM-DD.
function requireDay(value: string) {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid) throw new AppError(400, "invalid_input", "Invalid date");
  return value;
}

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((id) => b.includes(id));

export interface TaskFilters {
  stateId?: number;
  type?: TaskType;
  priority?: Priority;
  labelId?: number;
  q?: string;
  dueFrom?: string;
  dueTo?: string;
  sort?: "number" | "priority" | "dueDate" | "created" | "updated";
  dir?: "asc" | "desc";
}

export function createTasks(db: Db) {
  const withKey = (project: Project, task: Task) => ({ ...task, key: `${project.key}-${task.number}` });

  async function loadTask(actor: User, taskKey: string, action: Action, write: boolean) {
    const { projectKey, number } = parseKey(taskKey);
    const project = await loadProject(db, actor, projectKey, action);
    if (write) assertWritable(project);
    const [task] = await db.select().from(tasks).where(and(eq(tasks.projectId, project.id), eq(tasks.number, number)));
    if (!task) throw new AppError(404, "task_not_found", "Task not found");
    return { project, task };
  }

  async function ownState(db: Executor, projectId: number, stateId: number) {
    const [state] = await db
      .select()
      .from(workflowStates)
      .where(and(eq(workflowStates.id, stateId), eq(workflowStates.projectId, projectId)));
    if (!state) throw new AppError(400, "state_not_found", "That state does not belong to the project");
    return state;
  }

  async function ownLabels(projectId: number, labelIds: number[]) {
    if (labelIds.length === 0) return [];
    const found = await db.select().from(labels).where(and(eq(labels.projectId, projectId), inArray(labels.id, labelIds)));
    if (found.length !== labelIds.length) throw new AppError(400, "label_not_found", "A label does not belong to the project");
    return found;
  }

  async function labelIdsByTask(projectId: number) {
    const rows = await db
      .select({ taskId: taskLabels.taskId, labelId: taskLabels.labelId })
      .from(taskLabels)
      .innerJoin(tasks, eq(taskLabels.taskId, tasks.id))
      .where(eq(tasks.projectId, projectId));
    const map = new Map<number, number[]>();
    for (const row of rows) map.set(row.taskId, [...(map.get(row.taskId) ?? []), row.labelId]);
    return map;
  }

  const addEvent = (tx: Executor, taskId: number, actorId: number, type: string, payload?: unknown) =>
    tx.insert(taskEvents).values({ taskId, actorId, type, payload: payload ?? null });

  return {
    async list(actor: User, projectKey: string, filters: TaskFilters = {}) {
      const project = await loadProject(db, actor, projectKey);
      const conditions = [eq(tasks.projectId, project.id)];
      if (filters.stateId !== undefined) conditions.push(eq(tasks.stateId, filters.stateId));
      if (filters.type) conditions.push(eq(tasks.type, filters.type));
      if (filters.priority) conditions.push(eq(tasks.priority, filters.priority));
      if (filters.dueFrom) conditions.push(gte(tasks.dueDate, requireDay(filters.dueFrom)));
      if (filters.dueTo) conditions.push(lte(tasks.dueDate, requireDay(filters.dueTo)));
      if (filters.labelId !== undefined) {
        conditions.push(inArray(tasks.id, db.select({ id: taskLabels.taskId }).from(taskLabels).where(eq(taskLabels.labelId, filters.labelId))));
      }
      if (filters.q?.trim()) {
        const pattern = `%${filters.q.trim().replace(/[\\%_]/g, "\\$&")}%`;
        conditions.push(or(ilike(tasks.title, pattern), ilike(tasks.description, pattern))!);
      }

      const dir = filters.dir === "desc" ? desc : asc;
      // Priority is a PostgreSQL enum, so it sorts low < medium < high < urgent by itself.
      const order = {
        number: dir(tasks.number),
        priority: dir(tasks.priority),
        created: dir(tasks.createdAt),
        updated: dir(tasks.updatedAt),
        dueDate: filters.dir === "desc" ? sql`${tasks.dueDate} desc nulls last` : sql`${tasks.dueDate} asc nulls last`,
      }[filters.sort ?? "number"];

      const [rows, labelMap] = await Promise.all([
        db
          .select({
            id: tasks.id, number: tasks.number, title: tasks.title, type: tasks.type, priority: tasks.priority,
            stateId: tasks.stateId, dueDate: tasks.dueDate, parentId: tasks.parentId, position: tasks.position, version: tasks.version,
          })
          .from(tasks)
          .where(and(...conditions))
          .orderBy(order, asc(tasks.number)),
        labelIdsByTask(project.id),
      ]);
      return rows.map((t) => ({ ...t, key: `${project.key}-${t.number}`, labelIds: labelMap.get(t.id) ?? [] }));
    },

    async create(
      actor: User,
      projectKey: string,
      input: { title: string; description?: string; type?: TaskType; priority?: Priority; dueDate?: string | null; stateId?: number; labelIds?: number[]; parentId?: number },
    ) {
      const project = await loadProject(db, actor, projectKey, "task:create");
      assertWritable(project);
      const title = requireText(input.title, "Title", 300);
      const dueDate = input.dueDate ? requireDay(input.dueDate) : null;
      const labelIds = [...new Set(input.labelIds ?? [])];
      await ownLabels(project.id, labelIds);

      let state;
      if (input.stateId !== undefined) state = await ownState(db, project.id, input.stateId);
      else {
        [state] = await db.select().from(workflowStates).where(eq(workflowStates.projectId, project.id)).orderBy(asc(workflowStates.position)).limit(1);
        if (!state) throw new AppError(409, "state_not_found", "The project has no states");
      }

      if (input.parentId !== undefined) {
        const [parent] = await db.select().from(tasks).where(and(eq(tasks.id, input.parentId), eq(tasks.projectId, project.id)));
        if (!parent) throw new AppError(400, "parent_invalid", "The parent task is not in this project");
        if (parent.parentId !== null) throw new AppError(400, "parent_invalid", "A subtask cannot have subtasks");
      }

      const created = await db.transaction(async (tx) => {
        // One statement reads and bumps the counter, so concurrent creators get different numbers.
        const [counter] = await tx
          .update(projects)
          .set({ nextTaskNumber: sql`${projects.nextTaskNumber} + 1` })
          .where(eq(projects.id, project.id))
          .returning({ next: projects.nextTaskNumber });
        const [last] = await tx.select({ p: max(tasks.position) }).from(tasks).where(eq(tasks.stateId, state.id));
        const [task] = await tx
          .insert(tasks)
          .values({
            projectId: project.id,
            number: counter!.next - 1,
            title,
            description: input.description?.trim() ?? "",
            type: input.type ?? "task",
            priority: input.priority ?? "medium",
            stateId: state.id,
            dueDate,
            parentId: input.parentId ?? null,
            position: (last?.p ?? 0) + GAP,
            createdById: actor.id,
          })
          .returning();
        if (labelIds.length) await tx.insert(taskLabels).values(labelIds.map((labelId) => ({ taskId: task!.id, labelId })));
        await addEvent(tx, task!.id, actor.id, "created", { title });
        return task!;
      });
      return { ...withKey(project, created), labelIds };
    },

    async get(actor: User, taskKey: string) {
      const { project, task } = await loadTask(actor, taskKey, "project:view", false);
      const keyOf = (number: number) => `${project.key}-${number}`;

      const [labelRows, subtasks, parent, outgoing, incoming, commentRows, attachmentRows, eventRows] = await Promise.all([
        db.select({ labelId: taskLabels.labelId }).from(taskLabels).where(eq(taskLabels.taskId, task.id)),
        db
          .select({ id: tasks.id, number: tasks.number, title: tasks.title, stateId: tasks.stateId, priority: tasks.priority, type: tasks.type, version: tasks.version })
          .from(tasks)
          .where(eq(tasks.parentId, task.id))
          .orderBy(asc(tasks.number)),
        task.parentId === null
          ? Promise.resolve([])
          : db.select({ number: tasks.number, title: tasks.title }).from(tasks).where(eq(tasks.id, task.parentId)),
        db
          .select({ id: taskLinks.id, type: taskLinks.type, number: tasks.number, title: tasks.title })
          .from(taskLinks)
          .innerJoin(tasks, eq(taskLinks.toTaskId, tasks.id))
          .where(eq(taskLinks.fromTaskId, task.id)),
        db
          .select({ id: taskLinks.id, type: taskLinks.type, number: tasks.number, title: tasks.title })
          .from(taskLinks)
          .innerJoin(tasks, eq(taskLinks.fromTaskId, tasks.id))
          .where(eq(taskLinks.toTaskId, task.id)),
        db
          .select({ id: comments.id, body: comments.body, createdAt: comments.createdAt, authorId: users.id, authorName: users.name })
          .from(comments)
          .innerJoin(users, eq(comments.authorId, users.id))
          .where(eq(comments.taskId, task.id))
          .orderBy(asc(comments.createdAt), asc(comments.id)),
        db
          .select({ id: attachments.id, filename: attachments.filename, mimeType: attachments.mimeType, size: attachments.size, createdAt: attachments.createdAt, uploadedByName: users.name })
          .from(attachments)
          .innerJoin(users, eq(attachments.uploadedById, users.id))
          .where(eq(attachments.taskId, task.id))
          .orderBy(asc(attachments.id)),
        db
          .select({ id: taskEvents.id, type: taskEvents.type, payload: taskEvents.payload, createdAt: taskEvents.createdAt, actorId: users.id, actorName: users.name })
          .from(taskEvents)
          .innerJoin(users, eq(taskEvents.actorId, users.id))
          .where(eq(taskEvents.taskId, task.id))
          .orderBy(asc(taskEvents.createdAt), asc(taskEvents.id)),
      ]);

      const mentions = commentRows.length
        ? await db
            .select({ commentId: commentMentions.commentId, userId: users.id, name: users.name })
            .from(commentMentions)
            .innerJoin(users, eq(commentMentions.userId, users.id))
            .where(inArray(commentMentions.commentId, commentRows.map((c) => c.id)))
        : [];

      return {
        task: { ...withKey(project, task), labelIds: labelRows.map((l) => l.labelId) },
        parent: parent[0] ? { key: keyOf(parent[0].number), title: parent[0].title } : null,
        subtasks: subtasks.map((s) => ({ ...s, key: keyOf(s.number) })),
        links: [
          ...outgoing.map((l) => ({ id: l.id, type: l.type, direction: "out" as const, key: keyOf(l.number), title: l.title })),
          ...incoming.map((l) => ({ id: l.id, type: l.type, direction: "in" as const, key: keyOf(l.number), title: l.title })),
        ],
        comments: commentRows.map((c) => ({ ...c, mentions: mentions.filter((m) => m.commentId === c.id).map((m) => ({ userId: m.userId, name: m.name })) })),
        attachments: attachmentRows,
        events: eventRows,
      };
    },

    // RN-13: `version` is the one the person was looking at. If someone saved in between, nothing is overwritten.
    async update(
      actor: User,
      taskKey: string,
      input: { version: number; title?: string; description?: string; type?: TaskType; priority?: Priority; dueDate?: string | null; labelIds?: number[] },
    ) {
      const { project, task } = await loadTask(actor, taskKey, "task:edit", true);

      const set: Partial<typeof tasks.$inferInsert> = {};
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const track = <K extends "title" | "description" | "type" | "priority" | "dueDate">(field: K, value: Task[K]) => {
        if (value !== task[field]) {
          set[field] = value as never;
          changes[field] = { from: task[field], to: value };
        }
      };
      if (input.title !== undefined) track("title", requireText(input.title, "Title", 300));
      if (input.description !== undefined) track("description", input.description.trim());
      if (input.type !== undefined) track("type", input.type);
      if (input.priority !== undefined) track("priority", input.priority);
      if (input.dueDate !== undefined) track("dueDate", input.dueDate ? requireDay(input.dueDate) : null);

      const current = await db.select({ id: taskLabels.labelId }).from(taskLabels).where(eq(taskLabels.taskId, task.id));
      const currentIds = current.map((l) => l.id);
      const nextIds = input.labelIds ? [...new Set(input.labelIds)] : currentIds;
      const labelsChanged = !sameSet(currentIds, nextIds);
      await ownLabels(project.id, nextIds);

      if (Object.keys(changes).length === 0 && !labelsChanged) return this.get(actor, taskKey);

      await db.transaction(async (tx: Tx) => {
        const [updated] = await tx
          .update(tasks)
          .set({ ...set, version: sql`${tasks.version} + 1`, updatedAt: new Date() })
          .where(and(eq(tasks.id, task.id), eq(tasks.version, input.version)))
          .returning({ id: tasks.id });
        if (!updated) throw new AppError(409, "version_conflict", "Someone else changed this task");

        let labelChange: { from: string[]; to: string[] } | undefined;
        if (labelsChanged) {
          const names = async (ids: number[]) =>
            ids.length ? (await tx.select({ name: labels.name }).from(labels).where(inArray(labels.id, ids)).orderBy(asc(labels.name))).map((l) => l.name) : [];
          labelChange = { from: await names(currentIds), to: await names(nextIds) };
          await tx.delete(taskLabels).where(eq(taskLabels.taskId, task.id));
          if (nextIds.length) await tx.insert(taskLabels).values(nextIds.map((labelId) => ({ taskId: task.id, labelId })));
        }
        await addEvent(tx, task.id, actor.id, "updated", { changes, labels: labelChange });
      });
      return this.get(actor, taskKey);
    },

    // Drag on the board: change state and/or order inside the column. `index` is the target position (0 = top).
    async move(actor: User, taskKey: string, input: { version: number; stateId: number; index: number }) {
      const { project, task } = await loadTask(actor, taskKey, "task:move", true);
      const target = await ownState(db, project.id, input.stateId);
      const stateChanged = target.id !== task.stateId;

      await db.transaction(async (tx: Tx) => {
        const [updated] = await tx
          .update(tasks)
          .set({ stateId: target.id, version: sql`${tasks.version} + ${stateChanged ? 1 : 0}`, updatedAt: new Date() })
          .where(and(eq(tasks.id, task.id), eq(tasks.version, input.version)))
          .returning({ id: tasks.id });
        if (!updated) throw new AppError(409, "version_conflict", "Someone else changed this task");

        const column = await tx
          .select({ id: tasks.id, position: tasks.position })
          .from(tasks)
          .where(and(eq(tasks.stateId, target.id), sql`${tasks.id} <> ${task.id}`))
          .orderBy(asc(tasks.position), asc(tasks.id));
        const order = column.map((t) => t.id);
        order.splice(Math.max(0, Math.min(input.index, order.length)), 0, task.id);
        const positions = new Map(column.map((t) => [t.id, t.position]));
        for (const [i, id] of order.entries()) {
          const position = (i + 1) * GAP;
          if (positions.get(id) !== position) await tx.update(tasks).set({ position }).where(eq(tasks.id, id));
        }

        if (stateChanged) {
          const [from] = await tx.select({ name: workflowStates.name }).from(workflowStates).where(eq(workflowStates.id, task.stateId));
          await addEvent(tx, task.id, actor.id, "state_changed", { from: from?.name ?? null, to: target.name });
        }
      });
      const [moved] = await db.select().from(tasks).where(eq(tasks.id, task.id));
      return withKey(project, moved!);
    },

    async addComment(actor: User, taskKey: string, input: { body: string; mentionUserIds?: number[] }) {
      const { project, task } = await loadTask(actor, taskKey, "task:comment", true);
      const body = requireText(input.body, "Comment", 10_000);
      const mentionIds = [...new Set(input.mentionUserIds ?? [])];
      if (mentionIds.length) {
        const members = await db
          .select({ id: projectMembers.userId })
          .from(projectMembers)
          .where(and(eq(projectMembers.projectId, project.id), inArray(projectMembers.userId, mentionIds)));
        if (members.length !== mentionIds.length) throw new AppError(400, "invalid_mention", "Only project members can be mentioned");
      }
      return db.transaction(async (tx: Tx) => {
        const [comment] = await tx.insert(comments).values({ taskId: task.id, authorId: actor.id, body }).returning();
        if (mentionIds.length) await tx.insert(commentMentions).values(mentionIds.map((userId) => ({ commentId: comment!.id, userId })));
        await addEvent(tx, task.id, actor.id, "commented", { commentId: comment!.id });
        return { ...comment!, mentionUserIds: mentionIds };
      });
    },

    async addLink(actor: User, taskKey: string, input: { toKey: string; type: LinkType }) {
      const { project, task } = await loadTask(actor, taskKey, "task:edit", true);
      const { projectKey, number } = parseKey(input.toKey);
      if (projectKey !== project.key) throw new AppError(400, "link_invalid", "Tasks can only be linked inside the same project");
      const [other] = await db.select().from(tasks).where(and(eq(tasks.projectId, project.id), eq(tasks.number, number)));
      if (!other) throw new AppError(404, "task_not_found", "Task not found");
      if (other.id === task.id) throw new AppError(400, "link_invalid", "A task cannot be linked to itself");

      // "relates to" has no direction: A→B and B→A are the same relation.
      if (input.type === "relates_to") {
        const [reverse] = await db.select({ id: taskLinks.id }).from(taskLinks).where(and(eq(taskLinks.fromTaskId, other.id), eq(taskLinks.toTaskId, task.id), eq(taskLinks.type, "relates_to")));
        if (reverse) throw new AppError(409, "link_exists", "These tasks are already linked");
      }
      try {
        await db.transaction(async (tx: Tx) => {
          await tx.insert(taskLinks).values({ fromTaskId: task.id, toTaskId: other.id, type: input.type });
          await addEvent(tx, task.id, actor.id, "link_added", { type: input.type, to: `${project.key}-${other.number}` });
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new AppError(409, "link_exists", "These tasks are already linked");
        throw error;
      }
    },

    async removeLink(actor: User, taskKey: string, linkId: number) {
      const { project, task } = await loadTask(actor, taskKey, "task:edit", true);
      const [link] = await db.select().from(taskLinks).where(eq(taskLinks.id, linkId));
      if (!link || (link.fromTaskId !== task.id && link.toTaskId !== task.id)) throw new AppError(404, "link_not_found", "Link not found");
      const otherId = link.fromTaskId === task.id ? link.toTaskId : link.fromTaskId;
      const [other] = await db.select({ number: tasks.number }).from(tasks).where(eq(tasks.id, otherId));
      await db.transaction(async (tx: Tx) => {
        await tx.delete(taskLinks).where(eq(taskLinks.id, linkId));
        await addEvent(tx, task.id, actor.id, "link_removed", { type: link.type, to: `${project.key}-${other?.number}` });
      });
    },

    // Lets the route refuse an upload before any byte is written to disk.
    async assertCanAttach(actor: User, taskKey: string) {
      await loadTask(actor, taskKey, "task:comment", true);
    },

    // The file itself is saved by the route; this records it and its history entry.
    async addAttachment(actor: User, taskKey: string, file: { filename: string; mimeType: string; size: number; storagePath: string }) {
      const { task } = await loadTask(actor, taskKey, "task:comment", true);
      return db.transaction(async (tx: Tx) => {
        const [row] = await tx.insert(attachments).values({ taskId: task.id, uploadedById: actor.id, ...file }).returning();
        await addEvent(tx, task.id, actor.id, "attachment_added", { filename: file.filename });
        return row!;
      });
    },

    // Anyone who can see the project can download its attachments.
    async getAttachment(actor: User, attachmentId: number) {
      const [row] = await db
        .select({ attachment: attachments, projectKey: projects.key })
        .from(attachments)
        .innerJoin(tasks, eq(attachments.taskId, tasks.id))
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(attachments.id, attachmentId));
      if (!row) throw new AppError(404, "attachment_not_found", "Attachment not found");
      await loadProject(db, actor, row.projectKey);
      return row.attachment;
    },
  };
}

export type TasksService = ReturnType<typeof createTasks>;
