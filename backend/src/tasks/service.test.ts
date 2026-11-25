import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { User } from "../accounts/types.js";
import { createProjects } from "../projects/service.js";
import { createTestDb, makeUser } from "../testing/test-db.js";
import { createTasks } from "./service.js";

let t: Awaited<ReturnType<typeof createTestDb>>;
let projects: ReturnType<typeof createProjects>;
let tasks: ReturnType<typeof createTasks>;
let leader: User, member: User, outsider: User;
let states: { id: number; name: string }[];

beforeAll(async () => {
  t = await createTestDb();
  projects = createProjects(t.db);
  tasks = createTasks(t.db);
});
afterAll(() => t.close());
beforeEach(async () => {
  await t.reset();
  leader = await makeUser(t.db, "leader");
  member = await makeUser(t.db, "member");
  outsider = await makeUser(t.db, "member");
  await projects.create(leader, { key: "WEB", name: "Website", memberIds: [member.id] });
  states = (await projects.get(leader, "WEB")).states;
});

const fails = (promise: Promise<unknown>, code: string) => expect(promise).rejects.toMatchObject({ code });
const titles = async (stateId: number) =>
  (await tasks.list(leader, "WEB", { stateId })).sort((a, b) => a.position - b.position).map((x) => x.title);
const events = async (key: string) => (await tasks.get(leader, key)).events.map((e) => e.type);

describe("creating tasks (RF-06, RF-07)", () => {
  it("gives consecutive keys WEB-1, WEB-2 and starts in the first state", async () => {
    const a = await tasks.create(member, "WEB", { title: "First" });
    const b = await tasks.create(member, "WEB", { title: "Second" });
    expect([a.key, b.key]).toEqual(["WEB-1", "WEB-2"]);
    expect(a).toMatchObject({ stateId: states[0]!.id, type: "task", priority: "medium", version: 1 });
  });

  it("never repeats a number when several people create at once", async () => {
    const created = await Promise.all(Array.from({ length: 8 }, (_, i) => tasks.create(member, "WEB", { title: `T${i}` })));
    expect(new Set(created.map((c) => c.key)).size).toBe(8);
  });

  it("numbers are per project", async () => {
    await projects.create(leader, { key: "API", name: "Api", memberIds: [member.id] });
    await tasks.create(member, "WEB", { title: "x" });
    expect((await tasks.create(member, "API", { title: "y" })).key).toBe("API-1");
  });

  it("saves every field, with labels, and records who created it", async () => {
    const bug = await projects.createLabel(leader, "WEB", { name: "bug", color: "#ff0000" });
    const created = await tasks.create(member, "WEB", {
      title: "  Fix login  ", description: " details ", type: "bug", priority: "urgent", dueDate: "2026-12-31", labelIds: [bug.id],
    });
    const { task, events } = await tasks.get(member, created.key);
    expect(task).toMatchObject({ title: "Fix login", description: "details", type: "bug", priority: "urgent", dueDate: "2026-12-31", labelIds: [bug.id], createdById: member.id });
    expect(events[0]).toMatchObject({ type: "created", actorId: member.id });
  });

  it("validates title, date, state, labels and parent", async () => {
    await projects.create(leader, { key: "API", name: "Api", memberIds: [member.id] });
    const otherState = (await projects.get(leader, "API")).states[0]!;
    const otherLabel = await projects.createLabel(leader, "API", { name: "x", color: "#000000" });
    await fails(tasks.create(member, "WEB", { title: "   " }), "invalid_input");
    await fails(tasks.create(member, "WEB", { title: "x", dueDate: "2026-02-31" }), "invalid_input");
    await fails(tasks.create(member, "WEB", { title: "x", stateId: otherState.id }), "state_not_found");
    await fails(tasks.create(member, "WEB", { title: "x", labelIds: [otherLabel.id] }), "label_not_found");
    const parent = await tasks.create(member, "WEB", { title: "parent" });
    const child = await tasks.create(member, "WEB", { title: "child", parentId: parent.id });
    await fails(tasks.create(member, "WEB", { title: "grandchild", parentId: child.id }), "parent_invalid");
    expect((await tasks.get(member, parent.key)).subtasks.map((s) => s.key)).toEqual([child.key]);
    expect((await tasks.get(member, child.key)).parent?.key).toBe(parent.key);
  });

  it("only people who can see the project can create tasks in it", async () => {
    await fails(tasks.create(outsider, "WEB", { title: "x" }), "project_not_found");
    await expect(tasks.create(leader, "WEB", { title: "x" })).resolves.toBeDefined(); // leaders work in every project
  });

  it("an archived project accepts no new tasks", async () => {
    await projects.update(leader, "WEB", { archived: true });
    await fails(tasks.create(leader, "WEB", { title: "x" }), "project_archived");
  });
});

describe("editing and conflicts (RF-10, RN-12, RN-13)", () => {
  it("saves a change, bumps the version and records what changed and who changed it", async () => {
    const task = await tasks.create(member, "WEB", { title: "Old" });
    const { task: updated } = await tasks.update(member, task.key, { version: 1, title: "New", priority: "high" });
    expect(updated).toMatchObject({ title: "New", priority: "high", version: 2 });
    const event = (await tasks.get(member, task.key)).events.at(-1)!;
    expect(event).toMatchObject({ type: "updated", actorId: member.id });
    expect(event.payload).toMatchObject({ changes: { title: { from: "Old", to: "New" }, priority: { from: "medium", to: "high" } } });
  });

  it("the second person to save a stale version gets a conflict and nothing is overwritten", async () => {
    const task = await tasks.create(member, "WEB", { title: "Original" });
    await tasks.update(member, task.key, { version: 1, title: "Mine" });
    await fails(tasks.update(leader, task.key, { version: 1, title: "Theirs" }), "version_conflict");
    expect((await tasks.get(leader, task.key)).task.title).toBe("Mine");
  });

  it("when two saves race with the same version exactly one wins", async () => {
    const task = await tasks.create(member, "WEB", { title: "Original" });
    const results = await Promise.allSettled([
      tasks.update(member, task.key, { version: 1, title: "A" }),
      tasks.update(leader, task.key, { version: 1, title: "B" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await tasks.get(leader, task.key)).task.version).toBe(2);
  });

  it("saving with no changes keeps the version and adds no history", async () => {
    const task = await tasks.create(member, "WEB", { title: "Same" });
    const { task: result } = await tasks.update(member, task.key, { version: 1, title: "Same", priority: "medium" });
    expect(result.version).toBe(1);
    expect(await events(task.key)).toEqual(["created"]);
  });

  it("changes labels and the due date, including clearing it", async () => {
    const ui = await projects.createLabel(leader, "WEB", { name: "ui", color: "#111111" });
    const task = await tasks.create(member, "WEB", { title: "x", dueDate: "2026-12-01" });
    const withLabel = await tasks.update(member, task.key, { version: 1, labelIds: [ui.id] });
    expect(withLabel.task.labelIds).toEqual([ui.id]);
    const cleared = await tasks.update(member, task.key, { version: 2, labelIds: [], dueDate: null });
    expect(cleared.task).toMatchObject({ labelIds: [], dueDate: null, version: 3 });
    expect((await tasks.get(member, task.key)).events.at(-2)?.payload).toMatchObject({ labels: { from: [], to: ["ui"] } });
  });

  it("outsiders cannot read or edit; a deleted label disappears from tasks", async () => {
    const label = await projects.createLabel(leader, "WEB", { name: "ui", color: "#111111" });
    const task = await tasks.create(member, "WEB", { title: "x", labelIds: [label.id] });
    await fails(tasks.get(outsider, task.key), "project_not_found");
    await fails(tasks.update(outsider, task.key, { version: 1, title: "hack" }), "project_not_found");
    await projects.deleteLabel(leader, "WEB", label.id);
    expect((await tasks.get(member, task.key)).task.labelIds).toEqual([]);
  });

  it("unknown or malformed keys are 'not found'", async () => {
    await fails(tasks.get(leader, "WEB-999"), "task_not_found");
    await fails(tasks.get(leader, "nonsense"), "task_not_found");
    await fails(tasks.get(leader, "ZZZ-1"), "project_not_found");
  });
});

describe("moving on the board (RF-12)", () => {
  const [todo, doing] = [0, 1];
  async function three() {
    const a = await tasks.create(member, "WEB", { title: "A" });
    const b = await tasks.create(member, "WEB", { title: "B" });
    const c = await tasks.create(member, "WEB", { title: "C" });
    return { a, b, c };
  }

  it("new tasks go to the bottom of their column", async () => {
    await three();
    expect(await titles(states[todo]!.id)).toEqual(["A", "B", "C"]);
  });

  it("moves between columns, keeps the order and records the state change", async () => {
    const { a, b, c } = await three();
    await tasks.move(member, b.key, { version: 1, stateId: states[doing]!.id, index: 0 });
    await tasks.move(member, c.key, { version: 1, stateId: states[doing]!.id, index: 0 });
    expect(await titles(states[doing]!.id)).toEqual(["C", "B"]);
    expect(await titles(states[todo]!.id)).toEqual(["A"]);
    const detail = await tasks.get(member, b.key);
    expect(detail.task.version).toBe(2);
    expect(detail.events.at(-1)).toMatchObject({ type: "state_changed", payload: { from: "Por hacer", to: "En progreso" } });
    expect(a.key).toBe("WEB-1");
  });

  it("reorders inside a column without changing the version or the history", async () => {
    const { a, c } = await three();
    await tasks.move(member, c.key, { version: 1, stateId: states[todo]!.id, index: 0 });
    expect(await titles(states[todo]!.id)).toEqual(["C", "A", "B"]);
    expect((await tasks.get(member, c.key)).task.version).toBe(1);
    expect(await events(c.key)).toEqual(["created"]);
    expect(a.version).toBe(1);
  });

  it("an index past the end puts it last", async () => {
    const { a } = await three();
    await tasks.move(member, a.key, { version: 1, stateId: states[todo]!.id, index: 99 });
    expect(await titles(states[todo]!.id)).toEqual(["B", "C", "A"]);
  });

  it("a stale version is a conflict, and a state of another project is refused", async () => {
    const { a } = await three();
    await tasks.update(member, a.key, { version: 1, title: "changed" });
    await fails(tasks.move(member, a.key, { version: 1, stateId: states[doing]!.id, index: 0 }), "version_conflict");
    await projects.create(leader, { key: "API", name: "Api" });
    const foreign = (await projects.get(leader, "API")).states[0]!;
    await fails(tasks.move(leader, a.key, { version: 2, stateId: foreign.id, index: 0 }), "state_not_found");
  });

  it("outsiders cannot move tasks", async () => {
    const { a } = await three();
    await fails(tasks.move(outsider, a.key, { version: 1, stateId: states[doing]!.id, index: 0 }), "project_not_found");
  });
});

describe("comments and mentions (RF-09)", () => {
  it("saves the comment, who wrote it and who is mentioned", async () => {
    const task = await tasks.create(member, "WEB", { title: "x" });
    await tasks.addComment(leader, task.key, { body: "  hi @" + member.name + "  ", mentionUserIds: [member.id, member.id] });
    const { comments, events } = await tasks.get(member, task.key);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ body: "hi @" + member.name, authorId: leader.id, mentions: [{ userId: member.id, name: member.name }] });
    expect(events.at(-1)?.type).toBe("commented");
  });

  it("only project members can be mentioned, and empty comments are refused", async () => {
    const task = await tasks.create(member, "WEB", { title: "x" });
    await fails(tasks.addComment(member, task.key, { body: "hey", mentionUserIds: [outsider.id] }), "invalid_mention");
    await fails(tasks.addComment(member, task.key, { body: "   " }), "invalid_input");
    await fails(tasks.addComment(outsider, task.key, { body: "hi" }), "project_not_found");
  });
});

describe("links between tasks (RF-08)", () => {
  it("links two tasks and shows the link from both sides", async () => {
    const a = await tasks.create(member, "WEB", { title: "A" });
    const b = await tasks.create(member, "WEB", { title: "B" });
    await tasks.addLink(member, a.key, { toKey: b.key, type: "blocks" });
    expect((await tasks.get(member, a.key)).links).toMatchObject([{ type: "blocks", direction: "out", key: b.key }]);
    expect((await tasks.get(member, b.key)).links).toMatchObject([{ type: "blocks", direction: "in", key: a.key }]);
    expect(await events(a.key)).toContain("link_added");
  });

  it("refuses itself, other projects, unknown tasks and repeats", async () => {
    await projects.create(leader, { key: "API", name: "Api" });
    const a = await tasks.create(member, "WEB", { title: "A" });
    const b = await tasks.create(member, "WEB", { title: "B" });
    const foreign = await tasks.create(leader, "API", { title: "F" });
    await fails(tasks.addLink(member, a.key, { toKey: a.key, type: "relates_to" }), "link_invalid");
    await fails(tasks.addLink(member, a.key, { toKey: foreign.key, type: "relates_to" }), "link_invalid");
    await fails(tasks.addLink(member, a.key, { toKey: "WEB-99", type: "relates_to" }), "task_not_found");
    await tasks.addLink(member, a.key, { toKey: b.key, type: "depends_on" });
    await fails(tasks.addLink(member, a.key, { toKey: b.key, type: "depends_on" }), "link_exists");
    await tasks.addLink(member, a.key, { toKey: b.key, type: "relates_to" });
    await fails(tasks.addLink(member, b.key, { toKey: a.key, type: "relates_to" }), "link_exists"); // same relation, other direction
  });

  it("removes a link from either task, but not through an unrelated task", async () => {
    const a = await tasks.create(member, "WEB", { title: "A" });
    const b = await tasks.create(member, "WEB", { title: "B" });
    const c = await tasks.create(member, "WEB", { title: "C" });
    await tasks.addLink(member, a.key, { toKey: b.key, type: "blocks" });
    const link = (await tasks.get(member, a.key)).links[0]!;
    await fails(tasks.removeLink(member, c.key, link.id), "link_not_found");
    await tasks.removeLink(member, b.key, link.id);
    expect((await tasks.get(member, a.key)).links).toHaveLength(0);
  });
});

describe("list: filters and sorting (RF-13)", () => {
  beforeEach(async () => {
    const ui = await projects.createLabel(leader, "WEB", { name: "ui", color: "#111111" });
    await tasks.create(member, "WEB", { title: "Login page", description: "100% done", type: "story", priority: "low", dueDate: "2026-12-10", labelIds: [ui.id] });
    await tasks.create(member, "WEB", { title: "Fix crash", type: "bug", priority: "urgent", dueDate: "2026-12-01" });
    await tasks.create(member, "WEB", { title: "Docs", priority: "high", stateId: states[1]!.id });
  });
  const keys = async (filters: Parameters<typeof tasks.list>[2]) => (await tasks.list(member, "WEB", filters)).map((x) => x.key);

  it("filters by state, type, priority and label", async () => {
    expect(await keys({ stateId: states[1]!.id })).toEqual(["WEB-3"]);
    expect(await keys({ type: "bug" })).toEqual(["WEB-2"]);
    expect(await keys({ priority: "high" })).toEqual(["WEB-3"]);
    const ui = (await projects.get(member, "WEB")).labels[0]!;
    expect(await keys({ labelId: ui.id })).toEqual(["WEB-1"]);
  });

  it("filters by due date range and by text in title or description", async () => {
    expect(await keys({ dueFrom: "2026-12-05" })).toEqual(["WEB-1"]);
    expect(await keys({ dueTo: "2026-12-05" })).toEqual(["WEB-2"]);
    expect(await keys({ q: "CRASH" })).toEqual(["WEB-2"]);
    expect(await keys({ q: "100%" })).toEqual(["WEB-1"]); // % is searched literally, not as a wildcard
    expect(await keys({ q: "%" })).toEqual(["WEB-1"]);
  });

  it("sorts by priority (low to urgent) and by due date with empty dates last", async () => {
    expect(await keys({ sort: "priority" })).toEqual(["WEB-1", "WEB-3", "WEB-2"]);
    expect(await keys({ sort: "priority", dir: "desc" })).toEqual(["WEB-2", "WEB-3", "WEB-1"]);
    expect(await keys({ sort: "dueDate" })).toEqual(["WEB-2", "WEB-1", "WEB-3"]);
    expect(await keys({ sort: "dueDate", dir: "desc" })).toEqual(["WEB-1", "WEB-2", "WEB-3"]);
  });

  it("outsiders cannot list", async () => {
    await fails(tasks.list(outsider, "WEB"), "project_not_found");
  });
});

describe("attachments (RF-09)", () => {
  it("records the file and lets project members, but not outsiders, find it", async () => {
    const task = await tasks.create(member, "WEB", { title: "x" });
    const file = await tasks.addAttachment(member, task.key, { filename: "spec.pdf", mimeType: "application/pdf", size: 10, storagePath: "abc" });
    expect((await tasks.get(leader, task.key)).attachments).toMatchObject([{ id: file.id, filename: "spec.pdf", uploadedByName: member.name }]);
    expect((await tasks.getAttachment(member, file.id)).storagePath).toBe("abc");
    await fails(tasks.getAttachment(outsider, file.id), "project_not_found");
    await fails(tasks.getAttachment(member, 999), "attachment_not_found");
    await fails(tasks.addAttachment(outsider, task.key, { filename: "x", mimeType: "x", size: 1, storagePath: "y" }), "project_not_found");
  });
});
