import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  // Le fasi senza order_id sono della generale («g»).
  const catena = {
    select: () => catena, eq: () => catena, in: () => catena, order: () => catena,
    limit: async () => ({ data: (m.fasi as Array<Record<string, unknown>>).map((f) => ({ order_id: "g", ...f })), error: null as unknown }),
  };
  return { supabase: { from: () => catena } };
});
vi.mock("@/hooks/useGeneralePiano", () => ({ useGeneralePianoNumeri: () => m.numeri }));

import { RiquadroCantiereOperazione } from "@/components/orders/generali/design/RiquadroCantiereOperazione";

let riepilogo = { generale: { id: "g", modello: "sviluppo" }, figlie: [], permessi: { importi: true, costi: true, margini: true } } as unknown as RiepilogoGenerale;
const riga = (data: string, descrizione: string, importo: number) => ({ id: `${data}${descrizione}`, tipo: "costo", data, descrizione, importo });

function Indirizzo() {
  return <output data-testid="indirizzo">{useLocation().search}</output>;
}
const disegna = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={["/?ambito-cantiere=figlia&fase-cantiere=vecchia&rapportino-cantiere=vecchio"]}>
      <RiquadroCantiereOperazione riepilogo={riepilogo} /><Indirizzo />
    </MemoryRouter>
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
    const p = new URLSearchParams(screen.getByTestId("indirizzo").textContent ?? "");
    expect(p.get("vista-cantiere")).toBe("lavorazioni");
    expect(p.get("ambito-cantiere")).toBe(riepilogo.generale.id);
    expect(p.has("fase-cantiere")).toBe(false);
  });

  it("con le fasi: avanzamento, quelle in corso e le prossime", async () => {
    m.fasi = [
      { id: "1", name: "Scavi", status: "completata", percentuale: 100, start_date: null, end_date: null },
      { id: "2", name: "Strutture", status: "in_corso", percentuale: 40, start_date: null, end_date: null },
      { id: "3", name: "Impianti", status: "da_iniziare", percentuale: 0, start_date: "2027-03-01", end_date: null },
    ];
    disegna();
    expect(await screen.findByText("47%")).toBeInTheDocument();
    expect(screen.getByText("1 di 3 fasi concluse")).toBeInTheDocument();
    expect(screen.getByText("1 in corso")).toBeInTheDocument();
    expect(screen.getByText("1 da avviare")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Prossimi avvii" })).getByRole("listitem")).toHaveTextContent(/Impianti.*01\/03\/2027/);
  });

  it("conta anche le fasi delle commesse collegate e apre tutte le lavorazioni", async () => {
    const prima = riepilogo;
    riepilogo = { ...prima, figlie: [{ id: "f1", codice: "O-0038" }] } as unknown as RiepilogoGenerale;
    m.fasi = [
      { id: "4", order_id: "f1", name: "Massetti", status: "in_corso", percentuale: 50, start_date: null, end_date: null },
      { id: "1", name: "Scavi", status: "completata", percentuale: 100, start_date: null, end_date: null },
    ];
    disegna();
    expect(await screen.findByText("75%")).toBeInTheDocument();
    expect(screen.getByText("1 di 2 fasi concluse")).toBeInTheDocument();
    expect(screen.getByText("1 in corso")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tutte le lavorazioni" }));
    const parametri = new URLSearchParams(screen.getByTestId("indirizzo").textContent ?? "");
    expect(parametri.get("scheda")).toBe("cantiere");
    expect(parametri.get("vista-cantiere")).toBe("lavorazioni");
    expect(parametri.has("ambito-cantiere")).toBe(false);
    expect(parametri.has("fase-cantiere")).toBe(false);
    expect(parametri.has("rapportino-cantiere")).toBe(false);
    riepilogo = prima;
  });

  it("mantiene compatto il riepilogo con 146 fasi, raggruppando gli avvii alla stessa data", async () => {
    m.fasi = [
      ...Array.from({ length: 95 }, (_, i) => ({ id: `strutture-${i}`, name: `Strutture ${i}`, status: "in_corso", percentuale: 40 })),
      { id: "bonifica", name: "Bonifica", status: "da_iniziare", percentuale: 0, start_date: "2026-11-01" },
      { id: "consegna", name: "Collaudi e consegna", status: "da_iniziare", percentuale: 0, start_date: "2027-04-01" },
      ...Array.from({ length: 48 }, (_, i) => ({ id: `finiture-${i}`, name: "Finiture", status: "da_iniziare", percentuale: 0, start_date: "2027-03-15" })),
      { id: "esterni", name: "Sistemazione esterni", status: "da_iniziare", percentuale: 0, start_date: "2027-05-01" },
    ];
    disegna();
    expect(await screen.findByText("0 di 146 fasi concluse")).toBeInTheDocument();
    expect(screen.getByText("95 in corso")).toBeInTheDocument();
    expect(screen.getByText("51 da avviare")).toBeInTheDocument();
    expect(screen.queryByText("Strutture 94")).not.toBeInTheDocument();
    const avvii = within(screen.getByRole("list", { name: "Prossimi avvii" })).getAllByRole("listitem");
    expect(avvii).toHaveLength(2);
    expect(avvii[0]).toHaveTextContent(/Finiture.*48 fasi.*15\/03\/2027/);
    expect(avvii[1]).toHaveTextContent(/Collaudi e consegna.*01\/04\/2027/);
    fireEvent.click(screen.getByRole("button", { name: "Cronoprogramma" }));
    expect(screen.getByTestId("indirizzo")).toHaveTextContent("vista-cantiere=cronoprogramma");
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
