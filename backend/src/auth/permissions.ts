import type { Role } from "../accounts/types.js";

// The one place that decides who may do what (RNF-08, RNF-09). Routes and services
// call can(); hiding buttons in the UI is only convenience.
export type Action = "user:list" | "user:create" | "user:update" | "user:reset-password";

export interface Actor {
  id: number;
  role: Role;
  active: boolean;
}

// Stage 2: managing accounts is admin-only (REQUISITOS section 2).
const allowed: Record<Action, readonly Role[]> = {
  "user:list": ["admin"],
  "user:create": ["admin"],
  "user:update": ["admin"],
  "user:reset-password": ["admin"],
};

export function can(actor: Actor, action: Action): boolean {
  return actor.active && allowed[action].includes(actor.role);
}
