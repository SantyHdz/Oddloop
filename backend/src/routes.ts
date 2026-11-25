import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Accounts } from "./accounts/service.js";
import { roles, type User } from "./accounts/types.js";
import { COOKIE, type RequireAuth } from "./auth/hook.js";

const SESSION_SECONDS = 7 * 24 * 60 * 60;

const password = z.string().min(1).max(1024);
const email = z.email();
const name = z.string().trim().min(1).max(200);
const id = z.object({ id: z.coerce.number().int().positive() });

// Never send the password hash to the browser.
const toPublic = (u: User) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  active: u.active,
  mustChangePassword: u.mustChangePassword,
  soundEnabled: u.soundEnabled,
});

export function registerRoutes(app: FastifyInstance, accounts: Accounts, requireAuth: RequireAuth) {
  // SameSite=Lax keeps the cookie off cross-site POSTs; JSON-only bodies add a second barrier.
  // No `secure` flag: the app is served over plain http on the local network.
  app.post("/api/auth/login", async (request, reply) => {
    const body = z.object({ email, password }).parse(request.body);
    const { user, token } = await accounts.login(body.email, body.password);
    reply.setCookie(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_SECONDS });
    return { user: toPublic(user) };
  });

  app.post("/api/auth/logout", { preHandler: requireAuth(true) }, async (request, reply) => {
    await accounts.logout(request.sessionToken!);
    reply.clearCookie(COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/api/me", { preHandler: requireAuth(true) }, async (request) => ({ user: toPublic(request.user!) }));

  app.patch("/api/me", { preHandler: requireAuth() }, async (request) => {
    const body = z.object({ name: name.optional(), soundEnabled: z.boolean().optional() }).parse(request.body);
    return { user: toPublic(await accounts.updateProfile(request.user!, body)) };
  });

  app.post("/api/me/password", { preHandler: requireAuth(true) }, async (request) => {
    const body = z.object({ currentPassword: password, newPassword: password }).parse(request.body);
    const user = await accounts.changeOwnPassword(request.user!, request.sessionToken!, body.currentPassword, body.newPassword);
    return { user: toPublic(user) };
  });

  app.get("/api/users", { preHandler: requireAuth() }, async (request) => ({
    users: (await accounts.listUsers(request.user!)).map(toPublic),
  }));

  app.post("/api/users", { preHandler: requireAuth() }, async (request, reply) => {
    const body = z.object({ email, name, role: z.enum(roles), password }).parse(request.body);
    const user = await accounts.createUser(request.user!, body);
    return reply.code(201).send({ user: toPublic(user) });
  });

  app.patch("/api/users/:id", { preHandler: requireAuth() }, async (request) => {
    const { id: userId } = id.parse(request.params);
    const body = z
      .object({ role: z.enum(roles).optional(), active: z.boolean().optional() })
      .refine((b) => b.role !== undefined || b.active !== undefined)
      .parse(request.body);
    return { user: toPublic(await accounts.updateUser(request.user!, userId, body)) };
  });

  app.post("/api/users/:id/password", { preHandler: requireAuth() }, async (request, reply) => {
    const { id: userId } = id.parse(request.params);
    const body = z.object({ password }).parse(request.body);
    await accounts.resetPassword(request.user!, userId, body.password);
    return reply.code(204).send();
  });
}
