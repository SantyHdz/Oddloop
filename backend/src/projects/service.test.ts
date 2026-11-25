import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { User } from "../accounts/types.js";
import { createTestDb, makeUser } from "../testing/test-db.js";
import { createTasks } from "../tasks/service.js";
import { createProjects } from "./service.js";

let t: Awaited<ReturnType<typeof createTestDb>>;
let projects: ReturnType<typeof createProjects>;
let admin: User, leader: User, member: User, outsider: User;

beforeAll(async () => {
  t = await createTestDb();
  projects = createProjects(t.db);
});
afterAll(() => t.close());
beforeEach(async () => {
  await t.reset();
  admin = await makeUser(t.db, "admin");
  leader = await makeUser(t.db, "leader");
  member = await makeUser(t.db, "member");
  outsider = await makeUser(t.db, "member");
});

const fails = (promise: Promise<unknown>, code: string) => expect(promise).rejects.toMatchObject({ code });

describe("creating projects (RF-05)", () => {
  it("creates it with the default states in order and the chosen members", async () => {
    await projects.create(leader, { key: "web", name: "Website", memberIds: [member.id] });
    const { project, states, members } = await projects.get(leader, "WEB");
    expect(project.key).toBe("WEB"); // normalized to uppercase
    expect(states.map((s) => [s.name, s.category])).toEqual([
      ["Por hacer", "todo"],
      ["En progreso", "doing"],
      ["En revisión", "doing"],
      ["Hecho", "done"],
    ]);
    expect(members.map((m) => m.id)).toEqual([member.id]);
    expect(project.wipLimit).toBe(5);
  });

  it("only admins and leaders can create projects", async () => {
    await fails(projects.create(member, { key: "WEB", name: "x" }), "forbidden");
    await expect(projects.create(admin, { key: "ADM", name: "x" })).resolves.toBeDefined();
    await expect(projects.create(leader, { key: "LEA", name: "x" })).resolves.toBeDefined();
  });

  it("validates the key (2 to 5 letters) and its uniqueness", async () => {
    for (const key of ["A", "TOOLONG", "W3B", "we b", ""]) await fails(projects.create(leader, { key, name: "x" }), "invalid_project_key");
    await projects.create(leader, { key: "WEB", name: "x" });
    await fails(projects.create(admin, { key: "web", name: "y" }), "project_key_taken");
  });

  it("rejects deactivated or unknown members and an empty name", async () => {
    await fails(projects.create(leader, { key: "WEB", name: "x", memberIds: [999] }), "invalid_member");
    await fails(projects.create(leader, { key: "WEB", name: "  " }), "invalid_input");
    expect(await projects.list(admin)).toHaveLength(0); // nothing half-created
  });
});

describe("visibility (RN-11)", () => {
  beforeEach(async () => {
    await projects.create(leader, { key: "WEB", name: "Website", memberIds: [member.id] });
    await projects.create(leader, { key: "API", name: "Api", memberIds: [] });
  });

  it("admins and leaders see every project", async () => {
    expect((await projects.list(admin)).map((p) => p.key)).toEqual(["API", "WEB"]);
    expect(await projects.list(leader)).toHaveLength(2);
  });

  it("a member only sees the projects they belong to", async () => {
    expect((await projects.list(member)).map((p) => p.key)).toEqual(["WEB"]);
    expect(await projects.list(outsider)).toHaveLength(0);
  });

  it("a project you cannot see is reported as not found, not as forbidden", async () => {
    await fails(projects.get(outsider, "WEB"), "project_not_found");
    await fails(projects.get(member, "API"), "project_not_found");
    await fails(projects.get(member, "NOPE"), "project_not_found");
  });
});

describe("members", () => {
  beforeEach(async () => {
    await projects.create(leader, { key: "WEB", name: "Website", memberIds: [member.id] });
  });

  it("a leader adds and removes members; a member cannot", async () => {
    await projects.addMember(leader, "WEB", outsider.id);
    expect((await projects.get(leader, "WEB")).members).toHaveLength(2);
    await projects.addMember(leader, "WEB", outsider.id); // adding twice changes nothing
    expect((await projects.get(leader, "WEB")).members).toHaveLength(2);
    await fails(projects.removeMember(member, "WEB", outsider.id), "forbidden");
    await projects.removeMember(leader, "WEB", outsider.id);
    await fails(projects.get(outsider, "WEB"), "project_not_found");
  });

  it("does not add unknown or deactivated users", async () => {
    await fails(projects.addMember(leader, "WEB", 999), "invalid_member");
  });
});

describe("settings: states, labels, limit and archive", () => {
  beforeEach(async () => {
    await projects.create(leader, { key: "WEB", name: "Website", memberIds: [member.id] });
  });

  it("members cannot change settings", async () => {
    await fails(projects.update(member, "WEB", { name: "x" }), "forbidden");
    await fails(projects.createState(member, "WEB", { name: "Blocked", category: "doing" }), "forbidden");
    await fails(projects.createLabel(member, "WEB", { name: "ui", color: "#aabbcc" }), "forbidden");
  });

  it("validates the in-progress limit", async () => {
    for (const wipLimit of [0, 101, 2.5]) await fails(projects.update(leader, "WEB", { wipLimit }), "invalid_input");
    expect((await projects.update(leader, "WEB", { wipLimit: 3 })).wipLimit).toBe(3);
  });

  it("adds, renames and reorders states, and refuses duplicates", async () => {
    const blocked = await projects.createState(leader, "WEB", { name: "Bloqueado", category: "doing" });
    await fails(projects.createState(leader, "WEB", { name: "Bloqueado", category: "doing" }), "state_name_taken");
    await projects.updateState(leader, "WEB", blocked.id, { name: "En espera" });

    const { states } = await projects.get(leader, "WEB");
    await projects.reorderStates(leader, "WEB", [...states.map((s) => s.id)].reverse());
    expect((await projects.get(leader, "WEB")).states[0]?.name).toBe("En espera");
    await fails(projects.reorderStates(leader, "WEB", [states[0]!.id]), "invalid_input"); // must list every state
  });

  it("does not delete a state that has tasks, nor the last state", async () => {
    const tasks = createTasks(t.db);
    const { states } = await projects.get(leader, "WEB");
    await tasks.create(leader, "WEB", { title: "x", stateId: states[0]!.id });
    await fails(projects.deleteState(leader, "WEB", states[0]!.id), "state_in_use");
    await projects.deleteState(leader, "WEB", states[3]!.id); // empty state: ok
    await projects.deleteState(leader, "WEB", states[2]!.id);
    await projects.deleteState(leader, "WEB", states[1]!.id);
    await fails(projects.deleteState(leader, "WEB", states[0]!.id), "last_state");
  });

  it("creates labels with a valid color and unique name, and deletes them", async () => {
    const label = await projects.createLabel(leader, "WEB", { name: "ui", color: "#aabbcc" });
    await fails(projects.createLabel(leader, "WEB", { name: "ui", color: "#000000" }), "label_taken");
    await fails(projects.createLabel(leader, "WEB", { name: "x", color: "red" }), "invalid_input");
    await projects.deleteLabel(leader, "WEB", label.id);
    expect((await projects.get(leader, "WEB")).labels).toHaveLength(0);
  });

  it("an archived project is read-only until it is un-archived", async () => {
    const archived = await projects.update(leader, "WEB", { archived: true });
    expect(archived.archivedAt).not.toBeNull();
    await fails(projects.createState(leader, "WEB", { name: "x", category: "todo" }), "project_archived");
    await fails(projects.update(leader, "WEB", { name: "New name" }), "project_archived");
    await fails(projects.update(member, "WEB", { archived: false }), "forbidden");
    expect((await projects.update(leader, "WEB", { archived: false })).archivedAt).toBeNull();
  });
});
