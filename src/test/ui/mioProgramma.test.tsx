/**
 * «Il tuo programma» nell'app di cantiere (26/11/2026): la giornata pubblicata
 * dall'ufficio in Commesse → Programmazione.
 *  - Senza programma (o senza la funzione nel database) non mostra niente.
 *  - Con il programma: oggi/domani, orario, cantiere, indirizzo, lavorazione,
 *    compagni, mezzo, corona del capocantiere; «Ok, visto» chiama il database.
 *  - Il rapportino si apre dal programma di oggi, non da quello di domani.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const stato = vi.hoisted(() => ({
  programma: {} as Record<string, unknown[] | "manca">,
  chiamate: [] as Array<{ nome: string; args: Record<string, unknown> }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (nome: string, args: Record<string, unknown>) => {
      stato.chiamate.push({ nome, args });
      if (nome === "campo_programma_visto") return { data: 1, error: null as null };
      const p = stato.programma[String(args.p_giorno)];
      if (p === "manca") return { data: null as unknown, error: { code: "PGRST202", message: "Could not find the function" } };
      return { data: p ?? [], error: null };
    },
  },
}));

vi.mock("@/hooks/useOperai", () => ({ oggiRoma: () => "2026-11-26" }));

import { MioProgramma } from "@/components/campo/MioProgramma";

function mostra() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><MioProgramma /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const uscita = (extra: Record<string, unknown> = {}) => ({
  id: "i1", giorno: "2026-11-27", orderId: "c1", titolo: "Rossi", codice: "O-1", indirizzo: "Via Roma 1, Napoli",
  inizio: "08:00", fine: "12:00", capo: true, fase: "Massetti", faseId: "f1", note: null as string | null,
  compagni: ["Luca Bianchi"], mezzi: ["Ducato AB123CD"], visto: false, ...extra,
});

describe("Il tuo programma (app di cantiere)", () => {
  beforeEach(() => {
    stato.programma = {};
    stato.chiamate = [];
    sessionStorage.clear();
  });
  afterEach(() => cleanup());

  it("senza la funzione nel database non mostra niente e poi non richiede più", async () => {
    stato.programma = { "2026-11-26": "manca", "2026-11-27": "manca" };
    const { container } = mostra();
    await waitFor(() => expect(stato.chiamate.length).toBeGreaterThan(0));
    expect(container.textContent).toBe("");
    const prima = stato.chiamate.length;
    cleanup();
    mostra();
    await new Promise((r) => setTimeout(r, 20));
    expect(stato.chiamate.length).toBe(prima);
  });

  it("mostra domani con tutto quello che serve e «Ok, visto» lo registra", async () => {
    stato.programma = { "2026-11-27": [uscita()] };
    mostra();
    expect(await screen.findByText("Domani sei a")).toBeTruthy();
    expect(screen.getByText("08:00–12:00")).toBeTruthy();
    expect(screen.getByText("Rossi")).toBeTruthy();
    expect(screen.getByText("Via Roma 1, Napoli")).toBeTruthy();
    expect(screen.getByText("Massetti")).toBeTruthy();
    expect(screen.getByText(/con Luca Bianchi/)).toBeTruthy();
    expect(screen.getByText("Ducato AB123CD")).toBeTruthy();
    expect(screen.getByLabelText("Sei il capocantiere")).toBeTruthy();
    expect(screen.getByText("Guidi tu la squadra qui")).toBeTruthy();
    // Domani il rapportino non si fa ancora.
    expect(screen.queryByText("Fai il rapportino")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ok, visto" }));
    await waitFor(() => expect(stato.chiamate.some((c) => c.nome === "campo_programma_visto" && c.args.p_giorno === "2026-11-27")).toBe(true));
  });

  it("oggi apre il rapportino della commessa con la data giusta; già visto non chiede più", async () => {
    stato.programma = { "2026-11-26": [uscita({ giorno: "2026-11-26", visto: true, inizio: null, fine: null })] };
    mostra();
    expect(await screen.findByText("Oggi sei a")).toBeTruthy();
    expect(screen.getByText("In giornata")).toBeTruthy();
    expect(screen.getByText("Visto")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ok, visto" })).toBeNull();
    expect(screen.getByText("Fai il rapportino").closest("a")?.getAttribute("href")).toBe("/campo/lavoro/c1/rapportino?data=2026-11-26");
  });

  it("la commissione di stasera dice «Dopo il cantiere»", async () => {
    stato.programma = { "2026-11-27": [uscita(), uscita({ id: "i2", orderId: null, titolo: "Ritiro merce", inizio: null, fine: null, momento: "dopo", capo: false, compagni: [], mezzi: [] })] };
    mostra();
    expect(await screen.findByText("Dopo il cantiere")).toBeTruthy();
    expect(screen.getByText("Ritiro merce")).toBeTruthy();
  });
});
