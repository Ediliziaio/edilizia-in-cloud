import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({
  options: null as any,
  api: vi.fn(),
  end: vi.fn(),
}));
vi.mock("@/lib/fishAgentProxy", () => ({ callFishAgent: state.api }));
vi.mock("@fishaudio/agent-client", () => ({
  AgentSession: {
    start: vi.fn(async (options: any) => {
      state.options = options;
      return {
        getTranscript: (): unknown[] => [],
        startAudio: vi.fn(),
        end: state.end,
      };
    }),
  },
}));
import { FishLiveVoice } from "@/components/agenti/FishLiveVoice";
beforeEach(() => {
  state.options = null;
  state.api.mockReset();
  state.api.mockResolvedValue({
    session_token: {},
    mock_tools: { passa_a_operatore: {} },
  });
  state.end.mockReset();
});
afterEach(cleanup);
async function start(scenario = "handoff_no_answer") {
  render(
    <FishLiveVoice
      companyId="own"
      agentId="draft"
      ready
      initialScenario={scenario}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Ascolta senza microfono" }),
  );
  await waitFor(() => expect(state.options).not.toBeNull());
}
describe("Operator exercise in the management app", () => {
  it("waits for the operator result and returns to the AI on no answer without CRM calls", async () => {
    await start();
    let reply: any;
    await act(async () => {
      reply = state.options.clientTools.passa_a_operatore({
        riassunto: "Chiarimento sulla commessa",
      });
    });
    expect(screen.getByText("Squillo simulato a Anna")).toBeInTheDocument();
    expect(screen.getByText("Luca · occupato")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Non risponde: torna all’AI" }),
    );
    expect(await reply).toMatchObject({
      simulazione: true,
      collegato: false,
      ritorno_ai: true,
    });
    expect(
      screen.getByText("Anna non ha risposto · ritorno all’AI"),
    ).toBeInTheDocument();
    expect(state.api).toHaveBeenCalledTimes(1);
    expect(state.api).toHaveBeenCalledWith("own", "draft", "preview_session", {
      scenario: "handoff_no_answer",
    });
  });
  it("does not claim a connection before acceptance and cancels pending work at session end", async () => {
    await start();
    let reply: any;
    await act(async () => {
      reply = state.options.clientTools.passa_a_operatore({
        riassunto: "Consulente",
      });
    });
    expect(
      screen.queryByText("Anna ha accettato · passaggio dimostrativo"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Operatore risponde" }));
    expect(await reply).toMatchObject({ collegato: true, ritorno_ai: false });
    let again: any;
    await act(async () => {
      again = await state.options.clientTools.passa_a_operatore({});
    });
    expect(again.risposta).toContain("già terminato");
    fireEvent.click(screen.getByRole("button", { name: "Termina" }));
    await waitFor(() => expect(state.end).toHaveBeenCalled());
  });
});

describe("Readable results during voice trials", () => {
  it("counts down the full ring, then records the return to the assistant", async () => {
    await start();
    vi.useFakeTimers();
    try {
      let reply: Promise<unknown>;
      await act(async () => {
        reply = state.options.clientTools.passa_a_operatore({
          riassunto: "Parlare con un consulente",
        });
      });
      expect(
        screen.getByRole("progressbar", {
          name: "Tempo prima del ritorno all’AI",
        }),
      ).toHaveAttribute("value", "12");
      expect(screen.getByText("In corso")).toBeVisible();
      await act(async () => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.getByText("8 s prima del ritorno all’AI")).toBeVisible();
      await act(async () => {
        vi.advanceTimersByTime(8000);
        await expect(reply).resolves.toMatchObject({
          esito: "no_answer",
          ritorno_ai: true,
        });
      });
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(screen.getByText("Nessuna risposta · torna all’AI")).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the ring on hangup and refuses a stale tool callback", async () => {
    await start();
    let reply: Promise<unknown>;
    await act(async () => {
      reply = state.options.clientTools.passa_a_operatore({
        riassunto: "Richiesta del cliente",
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Termina" }));
    await expect(reply).resolves.toMatchObject({ esito: "cancelled" });
    expect(screen.getByText("Passaggio interrotto")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Operatore risponde" }),
    ).not.toBeInTheDocument();
    await act(async () => {
      await expect(
        state.options.clientTools.passa_a_operatore({}),
      ).resolves.toMatchObject({ esito: "cancelled" });
    });
    expect(screen.getAllByText("Passa a un operatore")).toHaveLength(1);
  });

  it("separates a blocked booking attempt from a booking confirmed after consent", async () => {
    state.api.mockResolvedValue({
      session_token: {},
      mock_tools: { fissa_appuntamento: { creato: true } },
    });
    await start("lead_appointment");
    const book = state.options.clientTools.fissa_appuntamento;
    await act(async () => {
      await expect(book({})).resolves.toMatchObject({
        ok: false,
        creato: false,
      });
    });
    expect(screen.getByText("Conferma da raccogliere")).toBeVisible();
    expect(
      screen.queryByText("Appuntamento confermato"),
    ).not.toBeInTheDocument();
    await act(async () => {
      state.options.callbacks.onAgentResponse({
        segmentId: "question",
        text: "Posso prenotare il sopralluogo alle dieci?",
      });
      state.options.callbacks.onUserTranscript({
        segmentId: "consent",
        text: "Sì, confermo.",
        final: true,
      });
      await expect(
        book({ conferma_cliente: "Sì, confermo." }),
      ).resolves.toMatchObject({ creato: true });
    });
    expect(screen.getByText("Appuntamento confermato")).toBeVisible();
    expect(screen.getByText("Conferma da raccogliere")).toBeVisible();
  });
});
