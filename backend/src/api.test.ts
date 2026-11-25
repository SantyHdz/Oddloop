import { readdir } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Role } from "./accounts/types.js";
import { createTestApp } from "./testing/test-app.js";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());
beforeEach(() => t.reset());

async function login(role: Role, name: string) {
  const user = await t.store.insertUser({ email: `${name}@x.com`, name, role, passwordHash: "hashed:pw", mustChangePassword: false });
  const res = await t.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: user.email, password: "pw" } });
  return { id: user.id, cookie: String(res.headers["set-cookie"]).split(";")[0]! };
}

type Who = Awaited<ReturnType<typeof login>>;
const call = (who: Who, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: object) =>
  t.app.inject({ method, url, headers: { cookie: who.cookie }, payload });

// Leader owns project WEB; "ana" is a member of it; "eve" is a member of nothing.
async function setup() {
  const leader = await login("leader", "lea");
  const ana = await login("member", "ana");
  const eve = await login("member", "eve");
  const created = await call(leader, "POST", "/api/projects", { key: "web", name: "Website", memberIds: [ana.id] });
  return { leader, ana, eve, created };
}

function multipartBody(filename: string, content: Buffer) {
  const boundary = "----oddloop-test";
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/html\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, content, tail]), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

describe("projects API", () => {
  it("creates a project (201) and hides internal fields", async () => {
    const { created } = await setup();
    expect(created.statusCode).toBe(201);
    expect(created.json().project).toEqual({ id: expect.any(Number), key: "WEB", name: "Website", description: "", wipLimit: 5, archived: false });
  });

  it("a member cannot create projects (403) and sees only their own", async () => {
    const { ana, eve } = await setup();
    expect((await call(ana, "POST", "/api/projects", { key: "XYZ", name: "x" })).statusCode).toBe(403);
    expect((await call(ana, "GET", "/api/projects")).json().projects).toHaveLength(1);
    expect((await call(eve, "GET", "/api/projects")).json().projects).toHaveLength(0);
    expect((await call(eve, "GET", "/api/projects/WEB")).statusCode).toBe(404);
  });

  it("the directory of people is for leaders and admins only, and lists active people", async () => {
    const { leader, ana } = await setup();
    expect((await call(ana, "GET", "/api/directory")).statusCode).toBe(403);
    const people = (await call(leader, "GET", "/api/directory")).json().people;
    expect(people.map((p: { name: string }) => p.name)).toEqual(["ana", "eve", "lea"]);
    expect(JSON.stringify(people)).not.toContain("hash");
  });

  it("returns states, labels and members of a project", async () => {
    const { ana } = await setup();
    const body = (await call(ana, "GET", "/api/projects/web")).json();
    expect(body.states.map((s: { name: string }) => s.name)).toEqual(["Por hacer", "En progreso", "En revisión", "Hecho"]);
    expect(body.members.map((m: { name: string }) => m.name)).toEqual(["ana"]);
  });

  it("rejects bad input with 400 and a duplicate key with 409", async () => {
    const { leader } = await setup();
    expect((await call(leader, "POST", "/api/projects", { key: "x", name: "bad" })).json().error.code).toBe("invalid_project_key");
    expect((await call(leader, "POST", "/api/projects", { name: "no key" })).json().error.code).toBe("invalid_input");
    expect((await call(leader, "POST", "/api/projects", { key: "WEB", name: "again" })).json().error.code).toBe("project_key_taken");
  });

  it("configures states and labels over HTTP; reorder is not mistaken for an id", async () => {
    const { leader, ana } = await setup();
    const { states } = (await call(leader, "GET", "/api/projects/WEB")).json();
    const order = states.map((s: { id: number }) => s.id).reverse();
    expect((await call(leader, "PUT", "/api/projects/WEB/states/order", { ids: order })).statusCode).toBe(204);
    expect((await call(leader, "POST", "/api/projects/WEB/labels", { name: "ui", color: "#aabbcc" })).statusCode).toBe(201);
    expect((await call(ana, "POST", "/api/projects/WEB/labels", { name: "x", color: "#aabbcc" })).statusCode).toBe(403);
    expect((await call(leader, "PATCH", "/api/projects/WEB", { archived: true })).json().project.archived).toBe(true);
  });
});

describe("tasks API", () => {
  async function withTask() {
    const ctx = await setup();
    const res = await call(ctx.ana, "POST", "/api/projects/WEB/tasks", { title: "First", priority: "high", dueDate: "2026-12-24" });
    return { ...ctx, key: res.json().task.key as string, res };
  }

  it("creates a task with key WEB-1 and reads it back", async () => {
    const { ana, key, res } = await withTask();
    expect(res.statusCode).toBe(201);
    expect(key).toBe("WEB-1");
    const detail = (await call(ana, "GET", "/api/tasks/web-1")).json();
    expect(detail.task).toMatchObject({ key: "WEB-1", title: "First", priority: "high", dueDate: "2026-12-24", version: 1 });
  });

  it("outsiders get 404 for the project's tasks, lists and comments", async () => {
    const { eve, key } = await withTask();
    expect((await call(eve, "GET", `/api/tasks/${key}`)).statusCode).toBe(404);
    expect((await call(eve, "GET", "/api/projects/WEB/tasks")).statusCode).toBe(404);
    expect((await call(eve, "POST", `/api/tasks/${key}/comments`, { body: "hi" })).statusCode).toBe(404);
  });

  it("a stale save answers 409 version_conflict (RN-13)", async () => {
    const { ana, leader, key } = await withTask();
    expect((await call(ana, "PATCH", `/api/tasks/${key}`, { version: 1, title: "Mine" })).statusCode).toBe(200);
    const stale = await call(leader, "PATCH", `/api/tasks/${key}`, { version: 1, title: "Theirs" });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("version_conflict");
    expect((await call(ana, "GET", `/api/tasks/${key}`)).json().task.title).toBe("Mine");
  });

  it("moves a task between states and lists with filters", async () => {
    const { ana, key } = await withTask();
    const { states } = (await call(ana, "GET", "/api/projects/WEB")).json();
    const move = await call(ana, "POST", `/api/tasks/${key}/move`, { version: 1, stateId: states[1].id, index: 0 });
    expect(move.json().task).toMatchObject({ stateId: states[1].id, version: 2 });
    const list = (await call(ana, "GET", `/api/projects/WEB/tasks?stateId=${states[1].id}&priority=high&sort=dueDate`)).json();
    expect(list.tasks.map((x: { key: string }) => x.key)).toEqual(["WEB-1"]);
    expect((await call(ana, "GET", "/api/projects/WEB/tasks?priority=nonsense")).statusCode).toBe(400);
  });

  it("comments with mentions and links two tasks", async () => {
    const { ana, leader, key } = await withTask();
    const second = (await call(ana, "POST", "/api/projects/WEB/tasks", { title: "Second" })).json().task.key;
    const comment = await call(leader, "POST", `/api/tasks/${key}/comments`, { body: "look @ana", mentionUserIds: [ana.id] });
    expect(comment.statusCode).toBe(201);
    expect((await call(ana, "POST", `/api/tasks/${key}/links`, { toKey: second, type: "blocks" })).statusCode).toBe(204);
    const detail = (await call(ana, "GET", `/api/tasks/${key}`)).json();
    expect(detail.comments[0].mentions).toEqual([{ userId: ana.id, name: "ana" }]);
    expect(detail.links).toHaveLength(1);
    expect((await call(ana, "POST", `/api/tasks/${key}/links`, { toKey: second, type: "blocks" })).json().error.code).toBe("link_exists");
  });
});

describe("attachments API (RF-09)", () => {
  async function withTask() {
    const ctx = await setup();
    const key = (await call(ctx.ana, "POST", "/api/projects/WEB/tasks", { title: "Doc" })).json().task.key as string;
    return { ...ctx, key };
  }
  const upload = (who: Who, key: string, filename: string, content: Buffer) => {
    const { payload, headers } = multipartBody(filename, content);
    return t.app.inject({ method: "POST", url: `/api/tasks/${key}/attachments`, headers: { ...headers, cookie: who.cookie }, payload });
  };

  it("uploads, lists and downloads a file, always as a neutral download", async () => {
    const { ana, leader, key } = await withTask();
    const res = await upload(ana, key, "../../evil<script>.html", Buffer.from("<script>alert(1)</script>"));
    expect(res.statusCode).toBe(201);
    const { attachment } = res.json();
    expect(attachment.filename).not.toContain("/"); // only a file name, never a path

    const download = await call(leader, "GET", `/api/attachments/${attachment.id}/download`);
    expect(download.statusCode).toBe(200);
    expect(download.body).toBe("<script>alert(1)</script>");
    expect(download.headers["content-type"]).toBe("application/octet-stream");
    expect(download.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(download.headers["x-content-type-options"]).toBe("nosniff");
    expect((await call(ana, "GET", `/api/tasks/${key}`)).json().attachments).toHaveLength(1);
    expect(await readdir(t.attachmentsDir)).toHaveLength(1);
  });

  it("outsiders can neither upload nor download", async () => {
    const { ana, eve, key } = await withTask();
    expect((await upload(eve, key, "a.txt", Buffer.from("x"))).statusCode).toBe(404);
    const { attachment } = (await upload(ana, key, "a.txt", Buffer.from("x"))).json();
    expect((await call(eve, "GET", `/api/attachments/${attachment.id}/download`)).statusCode).toBe(404);
    expect(await readdir(t.attachmentsDir)).toHaveLength(1); // the refused upload left nothing on disk
  });

  it("refuses files over 10 MB with 413 and leaves nothing on disk", async () => {
    const { ana, key } = await withTask();
    const res = await upload(ana, key, "big.bin", Buffer.alloc(10 * 1024 * 1024 + 10));
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe("file_too_large");
    expect(await readdir(t.attachmentsDir)).toHaveLength(0);
    expect((await call(ana, "GET", `/api/tasks/${key}`)).json().attachments).toHaveLength(0);
  });
});
