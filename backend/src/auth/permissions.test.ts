import { describe, expect, it } from "vitest";
import type { Role } from "../accounts/types.js";
import { can, type Action } from "./permissions.js";

const actor = (role: Role, active = true) => ({ id: 1, role, active });
const adminOnly: Action[] = ["user:list", "user:create", "user:update", "user:reset-password"];
const leadersAndAdmins: Action[] = ["project:create", "project:archive", "project:manage-members", "project:configure"];
const projectScoped: Action[] = ["project:view", "task:create", "task:edit", "task:comment", "task:move"];
const all = [...adminOnly, ...leadersAndAdmins, ...projectScoped];

describe("permission matrix (RNF-09)", () => {
  it.each(adminOnly)("%s is allowed for admin only", (action) => {
    expect(can(actor("admin"), action)).toBe(true);
    expect(can(actor("leader"), action)).toBe(false);
    expect(can(actor("member"), action)).toBe(false);
  });

  it.each(leadersAndAdmins)("%s is allowed for admins and leaders, never members", (action) => {
    expect(can(actor("admin"), action)).toBe(true);
    expect(can(actor("leader"), action)).toBe(true);
    expect(can(actor("member"), action, { projectMember: true })).toBe(false);
  });

  it.each(projectScoped)("%s: admins and leaders anywhere, members only in their projects (RN-11)", (action) => {
    expect(can(actor("admin"), action)).toBe(true);
    expect(can(actor("leader"), action)).toBe(true);
    expect(can(actor("member"), action, { projectMember: true })).toBe(true);
    expect(can(actor("member"), action, { projectMember: false })).toBe(false);
    expect(can(actor("member"), action)).toBe(false);
  });

  it("denies everything to a deactivated user, whatever their role", () => {
    for (const role of ["admin", "leader", "member"] as const) {
      for (const action of all) expect(can(actor(role, false), action, { projectMember: true })).toBe(false);
    }
  });
});
