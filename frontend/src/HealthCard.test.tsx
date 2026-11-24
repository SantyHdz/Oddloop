import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthCard } from "@/HealthCard";
import { messages } from "@/messages";

function renderCard() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <HealthCard />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("HealthCard", () => {
  it("shows the connected message when /api/health answers ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok", db: "up" }) }));
    renderCard();
    expect(await screen.findByText(messages.health.ok)).toBeInTheDocument();
  });

  it("shows the error message when the backend fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    renderCard();
    expect(await screen.findByText(messages.health.error)).toBeInTheDocument();
  });
});
