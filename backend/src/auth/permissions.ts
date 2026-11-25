import type { Role } from "../accounts/types.js";

// The one place that decides who may do what (RNF-08, RNF-09). Routes and services
// call can(); hiding buttons in the UI is only convenience.
export type Action =
  | "user:list"
  | "user:create"
  | "user:update"
  | "user:reset-password"
  | "project:create"
  | "project:archive"
  | "project:manage-members"
  | "project:configure"
  | "project:view"
  | "task:create"
  | "task:edit"
  | "task:comment"
  | "task:move";

export interface Actor {
  id: number;
  role: Role;
  active: boolean;
}

// What the rule needs to know about the thing being touched.
export interface Resource {
  /** Is the actor a member of the project involved? */
  projectMember?: boolean;
}

// Only admins and leaders (REQUISITOS section 2).
const staffOnly: Record<string, readonly Role[]> = {
  "user:list": ["admin"],
  "user:create": ["admin"],
  "user:update": ["admin"],
  "user:reset-password": ["admin"],
  "project:create": ["admin", "leader"],
  "project:archive": ["admin", "leader"],
  "project:manage-members": ["admin", "leader"],
  "project:configure": ["admin", "leader"],
};

// Admins and leaders see and work in every project (RN-11); a member only in projects they belong to.
const projectScoped: readonly Action[] = ["project:view", "task:create", "task:edit", "task:comment", "task:move"];

export function can(actor: Actor, action: Action, resource: Resource = {}): boolean {
  if (!actor.active) return false;
  if (projectScoped.includes(action)) {
    return actor.role === "admin" || actor.role === "leader" || resource.projectMember === true;
  }
  return staffOnly[action]?.includes(actor.role) ?? false;
}
