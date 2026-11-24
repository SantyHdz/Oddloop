import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import type { Role, User } from "@/lib/types";
import { messages } from "@/messages";

type Reply = { status: number; body?: unknown };
type Routes = Record<string, Reply>;

// Fake backend: answers by "METHOD /url". Anything not listed fails the test loudly.
function mockBackend(routes: Routes) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      const reply = routes[`${init?.method ?? "GET"} ${url}`];
      if (!reply) throw new Error(`unexpected request ${init?.method ?? "GET"} ${url}`);
      return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
    }),
  );
}

const user = (role: Role, extra: Partial<User> = {}): User => ({
  id: 1, email: "a@x.com", name: "Ana", role, active: true, mustChangePassword: false, soundEnabled: true, ...extra,
});

function renderApp(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const noSession: Reply = { status: 401, body: { error: { code: "unauthenticated" } } };
const health: Reply = { status: 200, body: { status: "ok", db: "up" } };

afterEach(() => vi.unstubAllGlobals());

describe("login", () => {
  it("sends a visitor without session to the login form", async () => {
    mockBackend({ "GET /api/me": noSession });
    renderApp("/equipo");
    expect(await screen.findByRole("button", { name: messages.login.submit })).toBeInTheDocument();
  });

  it("shows the Spanish message for wrong credentials", async () => {
    mockBackend({
      "GET /api/me": noSession,
      "POST /api/auth/login": { status: 401, body: { error: { code: "invalid_credentials" } } },
    });
    renderApp("/login");
    await userEvent.type(await screen.findByLabelText(messages.login.email), "a@x.com");
    await userEvent.type(screen.getByLabelText(messages.login.password), "bad");
    await userEvent.click(screen.getByRole("button", { name: messages.login.submit }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.invalid_credentials);
  });
});

describe("temporary password", () => {
  it("shows only the change form until the password is changed", async () => {
    mockBackend({ "GET /api/me": { status: 200, body: { user: user("member", { mustChangePassword: true }) } } });
    renderApp("/");
    expect(await screen.findByText(messages.password.forcedTitle)).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("warns when the two new passwords differ, without calling the API", async () => {
    mockBackend({ "GET /api/me": { status: 200, body: { user: user("member", { mustChangePassword: true }) } } });
    renderApp("/");
    await userEvent.type(await screen.findByLabelText(messages.password.current), "old");
    await userEvent.type(screen.getByLabelText(messages.password.new), "one");
    await userEvent.type(screen.getByLabelText(messages.password.confirm), "two");
    await userEvent.click(screen.getByRole("button", { name: messages.password.submit }));
    expect(await screen.findByText(messages.password.mismatch)).toBeInTheDocument();
  });
});

describe("team page by role", () => {
  it("a member has no Equipo link and is redirected away from /equipo", async () => {
    mockBackend({ "GET /api/me": { status: 200, body: { user: user("member") } }, "GET /api/health": health });
    renderApp("/equipo");
    expect(await screen.findByRole("heading", { name: messages.home.title })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: messages.nav.team })).not.toBeInTheDocument();
  });

  it("an admin sees the Equipo link and the list of people", async () => {
    mockBackend({
      "GET /api/me": { status: 200, body: { user: user("admin") } },
      "GET /api/users": { status: 200, body: { users: [user("admin"), user("member", { id: 2, name: "Beto", email: "b@x.com" })] } },
    });
    renderApp("/equipo");
    expect(await screen.findByText("Beto")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.nav.team })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(`(${messages.team.you})`)).toBeInTheDocument());
  });
});
