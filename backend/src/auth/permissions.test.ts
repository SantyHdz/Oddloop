import { describe, expect, it } from "vitest";
import type { Role } from "../accounts/types.js";
import { can, type Action } from "./permissions.js";

const actions: Action[] = ["user:list", "user:create", "user:update", "user:reset-password"];
const actor = (role: Role, active = true) => ({ id: 1, role, active });

describe("permission matrix (RNF-09)", () => {
  it.each(actions)("%s is allowed for admin only", (action) => {
    expect(can(actor("admin"), action)).toBe(true);
    expect(can(actor("leader"), action)).toBe(false);
    expect(can(actor("member"), action)).toBe(false);
  });

  it("denies everything to a deactivated admin", () => {
    for (const action of actions) expect(can(actor("admin", false), action)).toBe(false);
  });
});
