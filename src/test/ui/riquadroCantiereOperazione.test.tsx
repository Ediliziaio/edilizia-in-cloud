import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";

/**
 * Il cantiere in Panoramica (lotto 5, 14/11/2026): chi costruisce vede fasi, uscite del mese
 * contro il previsto del piano e gli ultimi costi, invece della sola tabella delle unità.
 */
const m = vi.hoisted(() => ({ fasi: [] as unknown[], numeri: null as unknown }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = { select: () => catena, eq: () => catena, order: () => catena, limit: async () => ({ data: m.fasi, error: null as unknown }) };
  return { supabase: { from: () => catena } };
});
vi.mock("@/hooks/useGeneralePiano", () => ({ useGeneralePianoNumeri: () => m.numeri }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import { RiquadroCantiereOperazione } from "@/components/orders/generali/design/RiquadroCantiereOperazione";

const riepilogo = { generale: { id: "g", modello: "sviluppo" }, figlie: [], permessi: { importi: true, costi: true, margini: true } } as unknown as RiepilogoGenerale;
const riga = (data: string, descrizione: string, importo: number) => ({ id: `${data}${descrizione}`, tipo: "costo", data, descrizione, importo });

function Indirizzo() {
  return <output data-testid="indirizzo">{useLocation().search}</output>;
}
const disegna = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><RiquadroCantiereOperazione riepilogo={riepilogo} /><Indirizzo /></MemoryRouter>
  </QueryClientProvider>,
);

beforeEach(() => {
  m.numeri = {
    reale: { oggi: "2026-11-14", righe: [
      riga("2026-11-03", "Fattura 12 · EDILCENTRO SRL · fattura 12", 700),
      riga("2026-11-10", "Spesa · Wuerth S.r.l", 1300),
      riga("2026-09-24", "Acquisto immobile · ANIMA HOME", 665000),
    ] },
    piano: { cassa: { previsto: [{ mese: "2026-11", uscite: 1500 }] } },
  };
});
afterEach(cleanup);

describe("il cantiere in Panoramica", () => {
  it("senza fasi lo dice e porta a impostarle", async () => {
    m.fasi = [];
    disegna();
    expect(await screen.findByText("Nessuna fase")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Imposta le fasi/ }));
    expect(screen.getByTestId("indirizzo").textContent).toContain("vista-cantiere=lavorazioni");
  });

  it("con le fasi: avanzamento, quelle in corso e le prossime", async () => {
    m.fasi = [
      { id: "1", name: "Scavi", status: "completata", percentuale: 100, start_date: null, end_date: null },
      { id: "2", name: "Strutture", status: "in_corso", percentuale: 40, start_date: null, end_date: null },
      { id: "3", name: "Impianti", status: "da_iniziare", percentuale: 0, start_date: "2027-03-01", end_date: null },
    ];
    disegna();
    expect(await screen.findByText("47%")).toBeInTheDocument();
    expect(screen.getByText(/1 di 3 fasi finite/)).toHaveTextContent("in corso: Strutture");
    expect(screen.getByText(/Poi: Impianti \(01\/03\/2027\)/)).toBeInTheDocument();
  });

  it("le uscite del mese contro il previsto, in rosso se sopra; gli ultimi costi per data", async () => {
    m.fasi = [];
    disegna();
    expect(await screen.findByText("2.000 €")).toBeInTheDocument();
    expect(screen.getByText("registrate su 1.500 € previste dal piano")).toHaveClass("text-destructive");
    const voci = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(voci[0]).toContain("Wuerth");
    expect(voci[2]).toContain("ANIMA HOME");
  });
});
