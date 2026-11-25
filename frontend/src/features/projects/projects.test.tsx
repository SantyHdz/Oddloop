import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeEvent } from "@/features/tasks/History";
import type { TaskEvent } from "@/lib/types";
import { messages } from "@/messages";
import { fail, mockBackend, ok, projectRoutes, renderApp, taskDetail } from "@/test-utils";

afterEach(() => vi.unstubAllGlobals());

const health = { "GET /api/health": ok({ status: "ok", db: "up" }) };

describe("sidebar", () => {
  it("lists the projects and offers 'Nuevo proyecto' to admins and leaders only", async () => {
    mockBackend({ ...projectRoutes("admin"), ...health });
    renderApp("/");
    expect(await screen.findByRole("link", { name: /Website/ })).toHaveAttribute("href", "/p/WEB");
    expect(screen.getByRole("button", { name: messages.projects.create })).toBeInTheDocument();
  });

  it("a member sees their projects but cannot create one", async () => {
    mockBackend({ ...projectRoutes("member"), ...health });
    renderApp("/");
    expect(await screen.findByRole("link", { name: /Website/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: messages.projects.create })).not.toBeInTheDocument();
  });
});

describe("board", () => {
  it("shows a column per state with its task cards", async () => {
    mockBackend(projectRoutes());
    renderApp("/p/WEB");
    const todo = await screen.findByRole("region", { name: "Columna Por hacer, 1 tareas" });
    expect(within(todo).getByRole("link", { name: "Login page" })).toHaveAttribute("href", "/t/WEB-1");
    expect(within(todo).getByText("Vence 24 dic 2026")).toBeInTheDocument();
    const doing = screen.getByRole("region", { name: "Columna En progreso, 1 tareas" });
    expect(within(doing).getByText("Fix crash")).toBeInTheDocument();
  });

  it("says so when the project does not exist or is not visible", async () => {
    mockBackend({ ...projectRoutes(), "GET /api/projects/NOPE": fail(404, "project_not_found") });
    renderApp("/p/NOPE");
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.projects.notFound);
  });

  it("a member does not get the Ajustes tab and a direct visit is refused", async () => {
    mockBackend(projectRoutes("member"));
    renderApp("/p/WEB/ajustes");
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.settings.forbidden);
    expect(screen.queryByRole("link", { name: messages.projects.tabs.settings })).not.toBeInTheDocument();
  });
});

describe("task panel (/t/WEB-1)", () => {
  it("opens over the board with the task's fields and history", async () => {
    mockBackend(projectRoutes());
    renderApp("/t/WEB-1");
    expect(await screen.findByDisplayValue("Login page")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Make it work")).toBeInTheDocument();
    expect(await screen.findByText("Ana creó la tarea")).toBeInTheDocument();
    // The board is still there, behind the panel (hidden from screen readers while the panel is modal).
    expect(screen.getByRole("region", { name: /Columna Por hacer/, hidden: true })).toBeInTheDocument();
  });

  it("saves with the version it was opened with", async () => {
    const { calls } = mockBackend({ ...projectRoutes(), "PATCH /api/tasks/WEB-1": ok({ ...taskDetail, task: { ...taskDetail.task, title: "Renamed", version: 2 } }) });
    renderApp("/t/WEB-1");
    const title = await screen.findByDisplayValue("Login page");
    await userEvent.clear(title);
    await userEvent.type(title, "Renamed");
    await userEvent.click(screen.getByRole("button", { name: messages.task.save }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ version: 1, title: "Renamed" }));
  });

  it("warns about a conflict instead of overwriting, and reloads on request (RN-13)", async () => {
    const { calls } = mockBackend({ ...projectRoutes(), "PATCH /api/tasks/WEB-1": fail(409, "version_conflict") });
    renderApp("/t/WEB-1");
    const title = await screen.findByDisplayValue("Login page");
    await userEvent.clear(title);
    await userEvent.type(title, "My edit");
    await userEvent.click(screen.getByRole("button", { name: messages.task.save }));

    const banner = await screen.findByText(messages.task.conflictTitle);
    expect(banner).toBeInTheDocument();
    expect(screen.getByDisplayValue("My edit")).toBeInTheDocument(); // nothing is thrown away silently

    const detailCalls = () => calls.filter((c) => c.method === "GET" && c.url === "/api/tasks/WEB-1").length;
    const before = detailCalls();
    await userEvent.click(screen.getByRole("button", { name: messages.task.reload }));
    await waitFor(() => expect(screen.queryByText(messages.task.conflictTitle)).not.toBeInTheDocument());
    expect(detailCalls()).toBeGreaterThan(before);
    expect(screen.getByDisplayValue("Login page")).toBeInTheDocument(); // back to the server's version
  });

  it("suggests project members after @ and sends who was mentioned", async () => {
    const { calls } = mockBackend({ ...projectRoutes(), "POST /api/tasks/WEB-1/comments": { status: 201, body: { comment: {} } } });
    renderApp("/t/WEB-1");
    const box = await screen.findByRole("combobox", { name: messages.task.comments });
    await userEvent.type(box, "hola @Be");
    expect(await screen.findByRole("option", { name: "Beto" })).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(box).toHaveValue("hola @Beto ");
    await userEvent.click(screen.getByRole("button", { name: messages.task.comment }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toEqual({ body: "hola @Beto ", mentionUserIds: [2] }));
  });

  it("does not mention someone whose @name was deleted from the text", async () => {
    const { calls } = mockBackend({ ...projectRoutes(), "POST /api/tasks/WEB-1/comments": { status: 201, body: { comment: {} } } });
    renderApp("/t/WEB-1");
    const box = await screen.findByRole("combobox", { name: messages.task.comments });
    await userEvent.type(box, "@Be");
    await userEvent.keyboard("{Enter}");
    await userEvent.clear(box);
    await userEvent.type(box, "never mind");
    await userEvent.click(screen.getByRole("button", { name: messages.task.comment }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toEqual({ body: "never mind", mentionUserIds: [] }));
  });
});

describe("list (/p/WEB/lista)", () => {
  it("shows every task and asks the server to filter when you search", async () => {
    const { calls } = mockBackend(projectRoutes());
    renderApp("/p/WEB/lista");
    expect(await screen.findByRole("link", { name: "Fix crash" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(messages.list.search), "crash");
    await waitFor(() => expect(calls.some((c) => c.url.includes("/tasks?") && c.url.includes("q=crash"))).toBe(true));
  });

  it("sorts by a column when its header is clicked", async () => {
    const { calls } = mockBackend(projectRoutes());
    renderApp("/p/WEB/lista");
    await screen.findByRole("link", { name: "Fix crash" });
    await userEvent.click(screen.getByRole("button", { name: "Ordenar por Prioridad" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("sort=priority") && c.url.includes("dir=asc"))).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Ordenar por Prioridad" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("sort=priority") && c.url.includes("dir=desc"))).toBe(true));
  });
});

describe("history sentences (RN-12)", () => {
  const event = (type: string, payload: Record<string, unknown> | null = null): TaskEvent => ({ id: 1, type, payload, createdAt: "2026-11-24T15:00:00Z", actorId: 1, actorName: "Ana" });

  it("describes who did what, from the central messages", () => {
    expect(describeEvent(event("state_changed", { from: "Por hacer", to: "Hecho" }))).toBe("Ana movió la tarea de «Por hacer» a «Hecho»");
    expect(describeEvent(event("updated", { changes: { title: {}, priority: {} }, labels: { from: [], to: ["ui"] } }))).toBe("Ana cambió el título, la prioridad, las etiquetas");
    expect(describeEvent(event("link_added", { type: "blocks", to: "WEB-3" }))).toBe("Ana agregó la relación «Bloquea a» con WEB-3");
    expect(describeEvent(event("attachment_added", { filename: "spec.pdf" }))).toBe("Ana adjuntó spec.pdf");
    expect(describeEvent(event("commented"))).toBe("Ana comentó");
  });

  it("never fails on an unknown event type", () => {
    expect(describeEvent(event("something_new"))).toBe("Ana");
  });
});

