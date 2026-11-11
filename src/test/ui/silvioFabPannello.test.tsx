import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const stato = vi.hoisted(() => ({ briefing: null as unknown }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const catena: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "order", "limit", "update"]) catena[m] = () => catena;
  catena.maybeSingle = async () => ({ data: stato.briefing, error: null as null });
  catena.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok);
  return { supabase: { from: () => catena } };
});

import { SilvioFAB } from "@/components/silvio/SilvioFAB";

function apri(percorso = "/azienda/marketing") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[percorso]}>
        <SilvioFAB />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Apri assistente Silvio" }));
}

describe("Regia Silvio", () => {
  beforeEach(() => {
    stato.briefing = null;
  });

  it("senza briefing: niente badge e niente sezione priorità", async () => {
    apri();
    await screen.findByText("Regia Silvio");
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("silvio-badge-priorita")).toBeNull();
    expect(screen.queryByTestId("silvio-priorita")).toBeNull();
    expect(screen.queryByText(/priorità/i)).toBeNull();
  });

  it("con il briefing: badge col numero dei punti veri e punti cliccabili", async () => {
    stato.briefing = {
      id: "b1",
      content: "",
      severity: "attention",
      brief_date: "2026-11-11",
      read_at: null,
      key_points: [
        { text: "Richiama Rossi per il preventivo bagno", severity: "attention" },
        { text: "Fattura 12/2026 scaduta da 10 giorni", severity: "urgent" },
      ],
    };
    apri();
    expect(await screen.findByTestId("silvio-badge-priorita")).toHaveTextContent("2 priorità");
    const sezione = screen.getByTestId("silvio-priorita");
    expect(within(sezione).getByText("Richiama Rossi per il preventivo bagno")).toBeInTheDocument();
  });

  it("domande rapide della pagina, una sola voce di caricamento, nessun doppione", async () => {
    apri("/azienda/marketing");
    const chip = await screen.findByTestId("silvio-domande-rapide");
    expect(within(chip).getByText("Lead da richiamare oggi")).toHaveAttribute("title", "Quali lead richiamare oggi?");
    expect(screen.getAllByText("Carica documento")).toHaveLength(1);
    expect(screen.getByText("Strumenti PDF")).toBeInTheDocument();
    expect(screen.getByText("Cerca")).toBeInTheDocument();
    expect(screen.getByText("Cose da sapere")).toBeInTheDocument();
    expect(screen.queryByText(/Scopri cosa sa fare/)).toBeNull();
    expect(screen.queryByText(/Chiedi a Silvio cosa conta/)).toBeNull();
    expect(screen.queryByText(/senza scegliere il modulo/)).toBeNull();
    // un solo campo per scrivere
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });
});
