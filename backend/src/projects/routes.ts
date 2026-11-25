import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RequireAuth } from "../auth/hook.js";
import type { Project } from "./access.js";
import type { Projects } from "./service.js";

const category = z.enum(["todo", "doing", "done"]);
const name = z.string().trim().min(1).max(200);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const key = z.object({ key: z.string().min(1).max(10) });
const numeric = z.coerce.number().int().positive();
const keyAndId = z.object({ key: z.string().min(1).max(10), id: numeric });
const keyAndUser = z.object({ key: z.string().min(1).max(10), userId: numeric });

// What the browser needs to know about a project (not internal counters).
const toPublic = (p: Project) => ({
  id: p.id,
  key: p.key,
  name: p.name,
  description: p.description,
  wipLimit: p.wipLimit,
  archived: p.archivedAt !== null,
});

export function registerProjectRoutes(app: FastifyInstance, requireAuth: RequireAuth, projects: Projects) {
  const auth = { preHandler: requireAuth() };

  app.get("/api/directory", auth, async (request) => ({ people: await projects.directory(request.user!) }));

  app.get("/api/projects", auth, async (request) => ({ projects: (await projects.list(request.user!)).map(toPublic) }));

  app.post("/api/projects", auth, async (request, reply) => {
    const body = z
      .object({ key: z.string().min(1).max(10), name, description: z.string().max(2000).optional(), memberIds: z.array(numeric).max(100).optional() })
      .parse(request.body);
    return reply.code(201).send({ project: toPublic(await projects.create(request.user!, body)) });
  });

  app.get("/api/projects/:key", auth, async (request) => {
    const { key: projectKey } = key.parse(request.params);
    const { project, states, labels, members } = await projects.get(request.user!, projectKey);
    return {
      project: toPublic(project),
      states: states.map((s) => ({ id: s.id, name: s.name, position: s.position, category: s.category })),
      labels: labels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
      members,
    };
  });

  app.patch("/api/projects/:key", auth, async (request) => {
    const { key: projectKey } = key.parse(request.params);
    const body = z
      .object({ name: name.optional(), description: z.string().max(2000).optional(), wipLimit: z.number().optional(), archived: z.boolean().optional() })
      .parse(request.body);
    return { project: toPublic(await projects.update(request.user!, projectKey, body)) };
  });

  app.post("/api/projects/:key/members", auth, async (request, reply) => {
    const { key: projectKey } = key.parse(request.params);
    const { userId } = z.object({ userId: numeric }).parse(request.body);
    await projects.addMember(request.user!, projectKey, userId);
    return reply.code(204).send();
  });

  app.delete("/api/projects/:key/members/:userId", auth, async (request, reply) => {
    const { key: projectKey, userId } = keyAndUser.parse(request.params);
    await projects.removeMember(request.user!, projectKey, userId);
    return reply.code(204).send();
  });

  app.post("/api/projects/:key/states", auth, async (request, reply) => {
    const { key: projectKey } = key.parse(request.params);
    const body = z.object({ name, category }).parse(request.body);
    return reply.code(201).send({ state: await projects.createState(request.user!, projectKey, body) });
  });

  // Registered before /states/:id so "order" is not read as an id.
  app.put("/api/projects/:key/states/order", auth, async (request, reply) => {
    const { key: projectKey } = key.parse(request.params);
    const { ids } = z.object({ ids: z.array(numeric).max(100) }).parse(request.body);
    await projects.reorderStates(request.user!, projectKey, ids);
    return reply.code(204).send();
  });

  app.patch("/api/projects/:key/states/:id", auth, async (request) => {
    const { key: projectKey, id } = keyAndId.parse(request.params);
    const body = z.object({ name: name.optional(), category: category.optional() }).parse(request.body);
    return { state: await projects.updateState(request.user!, projectKey, id, body) };
  });

  app.delete("/api/projects/:key/states/:id", auth, async (request, reply) => {
    const { key: projectKey, id } = keyAndId.parse(request.params);
    await projects.deleteState(request.user!, projectKey, id);
    return reply.code(204).send();
  });

  app.post("/api/projects/:key/labels", auth, async (request, reply) => {
    const { key: projectKey } = key.parse(request.params);
    const body = z.object({ name, color }).parse(request.body);
    return reply.code(201).send({ label: await projects.createLabel(request.user!, projectKey, body) });
  });

  app.patch("/api/projects/:key/labels/:id", auth, async (request) => {
    const { key: projectKey, id } = keyAndId.parse(request.params);
    const body = z.object({ name: name.optional(), color: color.optional() }).parse(request.body);
    return { label: await projects.updateLabel(request.user!, projectKey, id, body) };
  });

  app.delete("/api/projects/:key/labels/:id", auth, async (request, reply) => {
    const { key: projectKey, id } = keyAndId.parse(request.params);
    await projects.deleteLabel(request.user!, projectKey, id);
    return reply.code(204).send();
  });
}
