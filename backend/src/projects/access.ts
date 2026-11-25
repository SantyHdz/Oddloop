import { and, eq } from "drizzle-orm";
import type { User } from "../accounts/types.js";
import { can, type Action } from "../auth/permissions.js";
import { projectMembers, projects } from "../db/schema.js";
import type { Executor } from "../db/types.js";
import { AppError } from "../errors.js";

export type Project = typeof projects.$inferSelect;

export async function isMember(db: Executor, userId: number, projectId: number) {
  const rows = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  return rows.length > 0;
}

// Loads a project by key and checks that the actor may do `action` on it.
// A project the actor cannot see is reported as "not found", so its existence is not revealed (RN-11).
export async function loadProject(db: Executor, actor: User, key: string, action: Action = "project:view") {
  const [project] = await db.select().from(projects).where(eq(projects.key, key.toUpperCase()));
  const projectMember = project ? await isMember(db, actor.id, project.id) : false;
  if (!project || !can(actor, "project:view", { projectMember })) {
    throw new AppError(404, "project_not_found", "Project not found");
  }
  if (!can(actor, action, { projectMember })) throw new AppError(403, "forbidden", "You are not allowed to do this");
  return project;
}

// An archived project is read-only.
export function assertWritable(project: Project) {
  if (project.archivedAt) throw new AppError(409, "project_archived", "The project is archived");
}
