import type { FastifyRequest } from "fastify";
import type { Accounts } from "../accounts/service.js";
import type { User } from "../accounts/types.js";
import { AppError } from "../errors.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
    sessionToken?: string;
  }
}

export const COOKIE = "oddloop_session";

export type RequireAuth = ReturnType<typeof createRequireAuth>;

// Loads the user from the session cookie. While a temporary password is still in
// place, only routes that opt in (change password, logout, who am I) are reachable.
export function createRequireAuth(accounts: Accounts) {
  return (allowTemporaryPassword = false) =>
    async function (request: FastifyRequest) {
      const token = request.cookies[COOKIE];
      const user = token ? await accounts.authenticate(token) : undefined;
      if (!token || !user) throw new AppError(401, "unauthenticated", "Login required");
      if (user.mustChangePassword && !allowTemporaryPassword) {
        throw new AppError(403, "password_change_required", "Change your temporary password first");
      }
      request.user = user;
      request.sessionToken = token;
    };
}
