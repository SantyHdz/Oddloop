import { createReadStream, createWriteStream } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RequireAuth } from "../auth/hook.js";
import { AppError } from "../errors.js";
import type { TasksService } from "./service.js";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB per file

const type = z.enum(["task", "story", "bug", "epic"]);
const priority = z.enum(["low", "medium", "high", "urgent"]);
const linkType = z.enum(["blocks", "depends_on", "relates_to"]);
const numeric = z.coerce.number().int().positive();
const day = z.string().max(10);
const taskKey = z.object({ taskKey: z.string().min(1).max(20) });

// Only the file name, never a path, and no control characters.
const cleanFilename = (name: string) =>
  // eslint-disable-next-line no-control-regex
  path.basename(name.replace(/\\/g, "/")).replace(/[\u0000-\u001f]/g, "").slice(0, 200) || "file";

export function registerTaskRoutes(app: FastifyInstance, requireAuth: RequireAuth, tasks: TasksService, attachmentsDir: string) {
  const auth = { preHandler: requireAuth() };

  app.get("/api/projects/:key/tasks", auth, async (request) => {
    const { key } = z.object({ key: z.string().min(1).max(10) }).parse(request.params);
    const filters = z
      .object({
        stateId: numeric.optional(),
        type: type.optional(),
        priority: priority.optional(),
        labelId: numeric.optional(),
        q: z.string().max(200).optional(),
        dueFrom: day.optional(),
        dueTo: day.optional(),
        sort: z.enum(["number", "priority", "dueDate", "created", "updated"]).optional(),
        dir: z.enum(["asc", "desc"]).optional(),
      })
      .parse(request.query);
    return { tasks: await tasks.list(request.user!, key, filters) };
  });

  app.post("/api/projects/:key/tasks", auth, async (request, reply) => {
    const { key } = z.object({ key: z.string().min(1).max(10) }).parse(request.params);
    const body = z
      .object({
        title: z.string().max(300),
        description: z.string().max(20_000).optional(),
        type: type.optional(),
        priority: priority.optional(),
        dueDate: day.nullable().optional(),
        stateId: numeric.optional(),
        labelIds: z.array(numeric).max(50).optional(),
        parentId: numeric.optional(),
      })
      .parse(request.body);
    return reply.code(201).send({ task: await tasks.create(request.user!, key, body) });
  });

  app.get("/api/tasks/:taskKey", auth, async (request) => tasks.get(request.user!, taskKey.parse(request.params).taskKey));

  app.patch("/api/tasks/:taskKey", auth, async (request) => {
    const body = z
      .object({
        version: z.number().int().positive(),
        title: z.string().max(300).optional(),
        description: z.string().max(20_000).optional(),
        type: type.optional(),
        priority: priority.optional(),
        dueDate: day.nullable().optional(),
        labelIds: z.array(numeric).max(50).optional(),
      })
      .parse(request.body);
    return tasks.update(request.user!, taskKey.parse(request.params).taskKey, body);
  });

  app.post("/api/tasks/:taskKey/move", auth, async (request) => {
    const body = z.object({ version: z.number().int().positive(), stateId: numeric, index: z.number().int().min(0) }).parse(request.body);
    return { task: await tasks.move(request.user!, taskKey.parse(request.params).taskKey, body) };
  });

  app.post("/api/tasks/:taskKey/comments", auth, async (request, reply) => {
    const body = z.object({ body: z.string().max(10_000), mentionUserIds: z.array(numeric).max(50).optional() }).parse(request.body);
    return reply.code(201).send({ comment: await tasks.addComment(request.user!, taskKey.parse(request.params).taskKey, body) });
  });

  app.post("/api/tasks/:taskKey/links", auth, async (request, reply) => {
    const body = z.object({ toKey: z.string().max(20), type: linkType }).parse(request.body);
    await tasks.addLink(request.user!, taskKey.parse(request.params).taskKey, body);
    return reply.code(204).send();
  });

  app.delete("/api/tasks/:taskKey/links/:id", auth, async (request, reply) => {
    const { taskKey: key, id } = taskKey.extend({ id: numeric }).parse(request.params);
    await tasks.removeLink(request.user!, key, id);
    return reply.code(204).send();
  });

  // The file is stored under a random name; the original name only lives in the database.
  app.post("/api/tasks/:taskKey/attachments", auth, async (request, reply) => {
    const key = taskKey.parse(request.params).taskKey;
    await tasks.assertCanAttach(request.user!, key); // check permission before writing anything to disk
    const upload = await request.file();
    if (!upload) throw new AppError(400, "invalid_input", "No file received");

    const storagePath = randomUUID();
    const fullPath = path.join(attachmentsDir, storagePath);
    try {
      await pipeline(upload.file, createWriteStream(fullPath));
      // The library cuts the stream at the limit and only flags it, so a cut file must be refused here.
      if (upload.file.truncated) throw new AppError(413, "file_too_large", "The file is larger than 10 MB");
      const attachment = await tasks.addAttachment(request.user!, key, {
        filename: cleanFilename(upload.filename),
        mimeType: upload.mimetype.slice(0, 200),
        size: (await stat(fullPath)).size,
        storagePath,
      });
      return reply.code(201).send({ attachment: { id: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.size } });
    } catch (error) {
      await rm(fullPath, { force: true });
      if ((error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
        throw new AppError(413, "file_too_large", "The file is larger than 10 MB");
      }
      throw error;
    }
  });

  // Always sent as a download with a neutral type, so an uploaded .html can never run on our origin.
  app.get("/api/attachments/:id/download", auth, async (request, reply) => {
    const { id } = z.object({ id: numeric }).parse(request.params);
    const attachment = await tasks.getAttachment(request.user!, id);
    const fullPath = path.join(attachmentsDir, attachment.storagePath);
    const info = await stat(fullPath).catch(() => null);
    if (!info) throw new AppError(404, "attachment_not_found", "The file is no longer on the server");
    return reply
      .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`)
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Length", info.size)
      .type("application/octet-stream")
      .send(createReadStream(fullPath));
  });
}
