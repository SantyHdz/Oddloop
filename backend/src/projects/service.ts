import { and, asc, count, eq, inArray, max } from "drizzle-orm";
import type { User } from "../accounts/types.js";
import { can, type Action } from "../auth/permissions.js";
import { labels, projectMembers, projects, tasks, users, workflowStates } from "../db/schema.js";
import { isUniqueViolation, type Db } from "../db/types.js";
import { AppError } from "../errors.js";
import { assertWritable, loadProject } from "./access.js";

export type StateCategory = (typeof workflowStates.$inferSelect)["category"];

// RF-11: the states every new project starts with.
const DEFAULT_STATES: { name: string; category: StateCategory }[] = [
  { name: "Por hacer", category: "todo" },
  { name: "En progreso", category: "doing" },
  { name: "En revisión", category: "doing" },
  { name: "Hecho", category: "done" },
];

const KEY_PATTERN = /^[A-Z]{2,5}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function requireName(name: string, what: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new AppError(400, "invalid_input", `${what} cannot be empty`);
  return trimmed;
}

export function createProjects(db: Db) {
  // Settings may only change in an active project.
  async function writable(actor: User, key: string, action: Action) {
    const project = await loadProject(db, actor, key, action);
    assertWritable(project);
    return project;
  }

  async function ownState(projectId: number, stateId: number) {
    const [state] = await db
      .select()
      .from(workflowStates)
      .where(and(eq(workflowStates.id, stateId), eq(workflowStates.projectId, projectId)));
    if (!state) throw new AppError(404, "state_not_found", "State not found");
    return state;
  }

  async function ownLabel(projectId: number, labelId: number) {
    const [label] = await db.select().from(labels).where(and(eq(labels.id, labelId), eq(labels.projectId, projectId)));
    if (!label) throw new AppError(404, "label_not_found", "Label not found");
    return label;
  }

  return {
    // Active people a leader or admin can pick when adding project members. A leader may not
    // list accounts (that is the admin's screen), so this only exposes what picking needs.
    async directory(actor: User) {
      if (!can(actor, "project:manage-members")) throw new AppError(403, "forbidden", "You are not allowed to do this");
      return db
        .select({ id: users.id, name: users.name, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.active, true))
        .orderBy(asc(users.name));
    },

    // Admins and leaders see every project; a member only their own (RN-11).
    async list(actor: User) {
      if (can(actor, "project:view")) return db.select().from(projects).orderBy(asc(projects.name));
      const rows = await db
        .select({ project: projects })
        .from(projects)
        .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
        .where(eq(projectMembers.userId, actor.id))
        .orderBy(asc(projects.name));
      return rows.map((r) => r.project);
    },

    async get(actor: User, key: string) {
      const project = await loadProject(db, actor, key);
      const [states, projectLabels, members] = await Promise.all([
        db.select().from(workflowStates).where(eq(workflowStates.projectId, project.id)).orderBy(asc(workflowStates.position)),
        db.select().from(labels).where(eq(labels.projectId, project.id)).orderBy(asc(labels.name)),
        db
          .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active })
          .from(projectMembers)
          .innerJoin(users, eq(projectMembers.userId, users.id))
          .where(eq(projectMembers.projectId, project.id))
          .orderBy(asc(users.name)),
      ]);
      return { project, states, labels: projectLabels, members };
    },

    async create(actor: User, input: { key: string; name: string; description?: string; memberIds?: number[] }) {
      if (!can(actor, "project:create")) throw new AppError(403, "forbidden", "You are not allowed to do this");
      const key = input.key.trim().toUpperCase();
      if (!KEY_PATTERN.test(key)) throw new AppError(400, "invalid_project_key", "The key must be 2 to 5 letters");
      const name = requireName(input.name, "Name");
      const memberIds = [...new Set(input.memberIds ?? [])];
      if (memberIds.length) {
        const found = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, memberIds), eq(users.active, true)));
        if (found.length !== memberIds.length) throw new AppError(400, "invalid_member", "Unknown or deactivated user");
      }

      return db.transaction(async (tx) => {
        const [project] = await tx
          .insert(projects)
          .values({ key, name, description: input.description?.trim() ?? "" })
          .returning()
          .catch((error: unknown) => {
            if (isUniqueViolation(error)) throw new AppError(409, "project_key_taken", "That key is already in use");
            throw error;
          });
        await tx.insert(workflowStates).values(DEFAULT_STATES.map((s, i) => ({ ...s, projectId: project!.id, position: i + 1 })));
        if (memberIds.length) await tx.insert(projectMembers).values(memberIds.map((userId) => ({ projectId: project!.id, userId })));
        return project!;
      });
    },

    // Name, description and the in-progress limit need "configure"; archiving needs "archive".
    async update(actor: User, key: string, patch: { name?: string; description?: string; wipLimit?: number; archived?: boolean }) {
      const settings: Partial<typeof projects.$inferInsert> = {};
      if (patch.name !== undefined) settings.name = requireName(patch.name, "Name");
      if (patch.description !== undefined) settings.description = patch.description.trim();
      if (patch.wipLimit !== undefined) {
        if (!Number.isInteger(patch.wipLimit) || patch.wipLimit < 1 || patch.wipLimit > 100) {
          throw new AppError(400, "invalid_input", "The limit must be between 1 and 100");
        }
        settings.wipLimit = patch.wipLimit;
      }
      const project = await loadProject(db, actor, key, "project:configure");
      if (patch.archived !== undefined) {
        await loadProject(db, actor, key, "project:archive");
        settings.archivedAt = patch.archived ? new Date() : null;
      }
      // Changing anything except un-archiving requires an active project.
      if (Object.keys(settings).some((k) => k !== "archivedAt")) assertWritable(project);
      if (Object.keys(settings).length === 0) return project;
      const [updated] = await db.update(projects).set({ ...settings, updatedAt: new Date() }).where(eq(projects.id, project.id)).returning();
      return updated!;
    },

    async addMember(actor: User, key: string, userId: number) {
      const project = await writable(actor, key, "project:manage-members");
      const [user] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.active, true)));
      if (!user) throw new AppError(400, "invalid_member", "Unknown or deactivated user");
      await db.insert(projectMembers).values({ projectId: project.id, userId }).onConflictDoNothing();
    },

    async removeMember(actor: User, key: string, userId: number) {
      const project = await writable(actor, key, "project:manage-members");
      await db.delete(projectMembers).where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)));
    },

    async createState(actor: User, key: string, input: { name: string; category: StateCategory }) {
      const project = await writable(actor, key, "project:configure");
      const name = requireName(input.name, "Name");
      const [last] = await db.select({ n: max(workflowStates.position) }).from(workflowStates).where(eq(workflowStates.projectId, project.id));
      try {
        const [state] = await db
          .insert(workflowStates)
          .values({ projectId: project.id, name, category: input.category, position: (last?.n ?? 0) + 1 })
          .returning();
        return state!;
      } catch (error) {
        if (isUniqueViolation(error)) throw new AppError(409, "state_name_taken", "A state with that name already exists");
        throw error;
      }
    },

    async updateState(actor: User, key: string, stateId: number, patch: { name?: string; category?: StateCategory }) {
      const project = await writable(actor, key, "project:configure");
      const state = await ownState(project.id, stateId);
      try {
        const [updated] = await db
          .update(workflowStates)
          .set({
            name: patch.name !== undefined ? requireName(patch.name, "Name") : state.name,
            category: patch.category ?? state.category,
            updatedAt: new Date(),
          })
          .where(eq(workflowStates.id, stateId))
          .returning();
        return updated!;
      } catch (error) {
        if (isUniqueViolation(error)) throw new AppError(409, "state_name_taken", "A state with that name already exists");
        throw error;
      }
    },

    // `ids` must be every state of the project, in the new order.
    async reorderStates(actor: User, key: string, ids: number[]) {
      const project = await writable(actor, key, "project:configure");
      const current = await db.select({ id: workflowStates.id }).from(workflowStates).where(eq(workflowStates.projectId, project.id));
      const same = ids.length === current.length && new Set(ids).size === ids.length && current.every((s) => ids.includes(s.id));
      if (!same) throw new AppError(400, "invalid_input", "The list must contain every state exactly once");
      await db.transaction(async (tx) => {
        for (const [index, id] of ids.entries()) {
          await tx.update(workflowStates).set({ position: index + 1, updatedAt: new Date() }).where(eq(workflowStates.id, id));
        }
      });
    },

    async deleteState(actor: User, key: string, stateId: number) {
      const project = await writable(actor, key, "project:configure");
      await ownState(project.id, stateId);
      const [stateCount] = await db.select({ n: count() }).from(workflowStates).where(eq(workflowStates.projectId, project.id));
      if ((stateCount?.n ?? 0) <= 1) throw new AppError(409, "last_state", "A project needs at least one state");
      const [used] = await db.select({ n: count() }).from(tasks).where(eq(tasks.stateId, stateId));
      if ((used?.n ?? 0) > 0) throw new AppError(409, "state_in_use", "Move its tasks to another state first");
      await db.delete(workflowStates).where(eq(workflowStates.id, stateId));
    },

    async createLabel(actor: User, key: string, input: { name: string; color: string }) {
      const project = await writable(actor, key, "project:configure");
      if (!COLOR_PATTERN.test(input.color)) throw new AppError(400, "invalid_input", "The color must look like #aabbcc");
      try {
        const [label] = await db.insert(labels).values({ projectId: project.id, name: requireName(input.name, "Name"), color: input.color }).returning();
        return label!;
      } catch (error) {
        if (isUniqueViolation(error)) throw new AppError(409, "label_taken", "A label with that name already exists");
        throw error;
      }
    },

    async updateLabel(actor: User, key: string, labelId: number, patch: { name?: string; color?: string }) {
      const project = await writable(actor, key, "project:configure");
      const label = await ownLabel(project.id, labelId);
      if (patch.color !== undefined && !COLOR_PATTERN.test(patch.color)) throw new AppError(400, "invalid_input", "The color must look like #aabbcc");
      try {
        const [updated] = await db
          .update(labels)
          .set({ name: patch.name !== undefined ? requireName(patch.name, "Name") : label.name, color: patch.color ?? label.color, updatedAt: new Date() })
          .where(eq(labels.id, labelId))
          .returning();
        return updated!;
      } catch (error) {
        if (isUniqueViolation(error)) throw new AppError(409, "label_taken", "A label with that name already exists");
        throw error;
      }
    },

    async deleteLabel(actor: User, key: string, labelId: number) {
      const project = await writable(actor, key, "project:configure");
      await ownLabel(project.id, labelId);
      await db.delete(labels).where(eq(labels.id, labelId)); // task_labels rows go with it (ON DELETE CASCADE)
    },
  };
}

export type Projects = ReturnType<typeof createProjects>;
