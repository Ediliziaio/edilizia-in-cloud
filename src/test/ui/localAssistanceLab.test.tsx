import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  LocalLabBootstrap,
  LocalLabSnapshot,
} from "@/lib/localAssistanceClient";
const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  start: vi.fn(),
  turn: vi.fn(),
  snapshot: vi.fn(),
}));
vi.mock("@/lib/localAssistanceClient", () => ({
  createLocalAssistanceClient: () => mocks,
}));
import LocalAssistanceLabPage from "@/pages/azienda/LocalAssistanceLabPage";
const boot: LocalLabBootstrap = {
  mode: "local",
  productionConnected: false,
  backend: "PostgreSQL locale",
  scenarios: [{ id: "new", name: "Nuova richiesta" }],
  customers: [
    {
      id: "customer",
      name: "Mario Prova",
      address: "Via Test 10",
      phone: "+390000000101",
    },
  ],
  calendars: [{ id: "calendar", name: "Agenda locale", duration_minutes: 30 }],
  defaultCalendarId: "calendar",
  defaultDay: "2026-11-18",
  sessions: [],
};
const first: LocalLabSnapshot = {
  mode: "local",
  productionConnected: false,
  session: {
    id: "11111111-1111-4111-8111-111111111111",
    scenario: "new",
    phase: "problem",
    messages: [
      {
        id: "greeting",
        role: "agent",
        text: "Come posso aiutarti?",
        at: "2026-11-17T10:00:00Z",
      },
    ],
    tools: [],
    suggestions: ["La finestra non si chiude"],
    day: null,
  },
  fixture: boot.customers[0],
  customer: null,
  ticket: null,
  appointment: null,
  steps: [],
  activity: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.bootstrap.mockResolvedValue(boot);
  mocks.start.mockResolvedValue(first);
});
afterEach(cleanup);
it("waits for an explicit start, then retries a failed turn with the same request identifier", async () => {
  mocks.turn
    .mockRejectedValueOnce(new Error("Invio interrotto"))
    .mockResolvedValueOnce({
      ...first,
      session: {
        ...first.session,
        phase: "urgency",
        messages: [
          ...first.session.messages,
          {
            id: "question",
            role: "agent",
            text: "C’è un pericolo immediato?",
            at: "2026-11-17T10:01:00Z",
          },
        ],
        suggestions: ["No"],
      },
    });
  render(
    <MemoryRouter>
      <LocalAssistanceLabPage />
    </MemoryRouter>,
  );
  await screen.findByText("Backend locale attivo · dati di test");
  expect(mocks.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Avvia collaudo" }));
  await screen.findByText("Come posso aiutarti?");
  fireEvent.click(
    screen.getByRole("button", { name: "La finestra non si chiude" }),
  );
  await screen.findByRole("alert");
  fireEvent.click(
    screen.getByRole("button", { name: "Riprova lo stesso invio" }),
  );
  await screen.findByText("C’è un pericolo immediato?");
  expect(mocks.turn.mock.calls[0]).toEqual(mocks.turn.mock.calls[1]);
  expect(mocks.turn.mock.calls[0][1].requestId).toMatch(/^[a-f0-9-]{36}$/);
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
});
