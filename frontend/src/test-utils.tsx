import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import { App } from "@/App";
import type { ProjectDetail, Role, TaskDetail, TaskSummary, User } from "@/lib/types";

export interface Reply {
  status: number;
  body?: unknown;
}
export type Handler = Reply | ((request: { url: string; body: unknown }) => Reply);

// Fake backend: answers by "METHOD /path" (the query string is ignored when matching).
// Anything not listed fails loudly, and every request is recorded in `calls`.
export function mockBackend(routes: Record<string, Handler>) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: unknown }) => {
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
      calls.push({ method, url, body });
      const handler = routes[`${method} ${url}`] ?? routes[`${method} ${url.split("?")[0]}`];
      if (!handler) throw new Error(`unexpected request ${method} ${url}`);
      const reply = typeof handler === "function" ? handler({ url, body }) : handler;
      return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
    }),
  );
  return { calls };
}

export function renderApp(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const user = (role: Role, extra: Partial<User> = {}): User => ({
  id: 1, email: "ana@x.com", name: "Ana", role, active: true, mustChangePassword: false, soundEnabled: true, ...extra,
});

export const ok = (body: unknown): Reply => ({ status: 200, body });
export const fail = (status: number, code: string): Reply => ({ status, body: { error: { code } } });
export const me = (role: Role, extra: Partial<User> = {}) => ok({ user: user(role, extra) });

export const projectDetail: ProjectDetail = {
  project: { id: 1, key: "WEB", name: "Website", description: "", wipLimit: 5, archived: false },
  states: [
    { id: 1, name: "Por hacer", position: 1, category: "todo" },
    { id: 2, name: "En progreso", position: 2, category: "doing" },
  ],
  labels: [{ id: 1, name: "ui", color: "#ff0000" }],
  members: [
    { id: 1, name: "Ana", email: "ana@x.com", role: "admin", active: true },
    { id: 2, name: "Beto", email: "beto@x.com", role: "member", active: true },
  ],
};

export const tasks: TaskSummary[] = [
  { id: 10, key: "WEB-1", number: 1, title: "Login page", type: "story", priority: "high", stateId: 1, dueDate: "2026-12-24", parentId: null, position: 1000, version: 1, labelIds: [1] },
  { id: 11, key: "WEB-2", number: 2, title: "Fix crash", type: "bug", priority: "urgent", stateId: 2, dueDate: null, parentId: null, position: 1000, version: 3, labelIds: [] },
];

export const taskDetail: TaskDetail = {
  task: { ...tasks[0]!, description: "Make it work", createdById: 1 },
  parent: null,
  subtasks: [],
  links: [],
  comments: [],
  attachments: [],
  events: [{ id: 1, type: "created", payload: { title: "Login page" }, createdAt: "2026-11-24T15:00:00Z", actorId: 1, actorName: "Ana" }],
};

// The calls every project screen makes.
export const projectRoutes = (role: Role = "admin"): Record<string, Handler> => ({
  "GET /api/me": me(role),
  "GET /api/projects": ok({ projects: [projectDetail.project] }),
  "GET /api/projects/WEB": ok(projectDetail),
  "GET /api/projects/WEB/tasks": ok({ tasks }),
  "GET /api/tasks/WEB-1": ok(taskDetail),
  "GET /api/directory": ok({ people: projectDetail.members }),
});
