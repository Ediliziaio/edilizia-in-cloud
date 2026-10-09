/**
 * Valori delle variabili prodotto: maggiorazioni negative e prezzo proprio
 * (05/10/2026).
 *
 * Una linea che costa meno si salva come maggiorazione negativa (−8%): dieci
 * valori così erano in produzione. Il dialog la riportava a 0 a ogni
 * salvataggio, anche solo per rinominare il valore. E il «prezzo proprio»
 * della variante si chiamava «Prezzo vendita €» e «valeva ovunque», mentre
 * nei prodotti al m² è al m² e in quelli a griglia nei preventivi non conta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FamilyWithAxes } from "@/types/articleFamily";

const mut = vi.hoisted(() => ({ updateAxisValue: vi.fn(), createAxisValue: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => {
  const risposta: { data: unknown[]; error: null } = { data: [], error: null };
  const catena: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "is", "in", "not", "order", "limit"]) catena[m] = () => catena;
  catena.then = (r: (v: unknown) => unknown) => Promise.resolve(risposta).then(r);
  return { supabase: { from: () => catena } };
});
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-1" }));
vi.mock("@/hooks/useFamilyMutations", () => ({
  useFamilyMutations: () => {
    const m = (fn: (...args: unknown[]) => unknown = vi.fn()) => ({ mutateAsync: fn, isPending: false });
    return {
      createAxis: m(),
      updateAxis: m(),
      deleteAxis: m(),
      createAxisValue: m(mut.createAxisValue),
      updateAxisValue: m(mut.updateAxisValue),
      saveOptions: m(mut.updateAxisValue),
      deleteAxisValue: m(),
      bulkInsertAxesWithValues: m(),
    };
  },
}));
vi.mock("@/components/listino/ArticlePdfDocumentsSection", () => ({ ArticlePdfDocumentsSection: (): null => null }));
vi.mock("@/components/listino/AxisPresetsDialog", () => ({ AxisPresetsDialog: (): null => null }));

import {
  FamilyAxesEditor,
  cambiaSegno,
  leggiMaggiorazione,
  leggiPrezzo,
  leggiValoreBulk,
  prezzoProprioVariante,
  problemaMaggiorazione,
} from "@/components/listino/FamilyAxesEditor";
import { calcolaPrezzoFamiglia } from "@/hooks/useFamilyPricing";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function famiglia(modalita: "pz" | "mq" | "griglia", valore: Record<string, unknown> = {}): FamilyWithAxes {
  return {
    id: "fam-1",
    nome: "Finestra",
    modalita_prezzo_base: modalita,
    prezzo_base_mode: "vendita",
    prezzo_base_vendita: 1000,
    prezzo_base_acquisto: 600,
    axes: [
      {
        id: "asse-1",
        family_id: "fam-1",
        codice: "linea",
        nome: "Linea",
        descrizione: null,
        tipo: "discrete",
        obbligatorio: false,
        sort_order: 0,
        values: [
          {
            id: "val-1",
            axis_id: "asse-1",
            valore: "economica",
            label: "Linea economica",
            descrizione: null,
            is_default: false,
            maggiorazione_tipo: "percentuale",
            maggiorazione_valore: -8,
            maggiorazione_acquisto: -8,
            sort_order: 0,
            attivo: true,
            codice: null,
            prezzo_vendita: null,
            prezzo_acquisto: null,
            immagine_url: null,
            opzioni: [],
            ...valore,
          },
        ],
      },
    ],
  } as unknown as FamilyWithAxes;
}

function apriValore(f: FamilyWithAxes) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <FamilyAxesEditor family={f} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Apri variabile Linea" }));
  fireEvent.click(screen.getByRole("button", { name: "Modifica valore" }));
}

const salvato = () => (mut.updateAxisValue.mock.calls[0][0] as { patch: Record<string, unknown> }).patch;

describe("maggiorazione negativa: una linea che costa meno", () => {
  it("desktop: la scelta ha spazio per due colonne e azioni fuori dall'area scorrevole", () => {
    apriValore(famiglia("pz"));
    const dialog = screen.getByRole("dialog", { name: "Modifica scelta" });
    expect(dialog).toHaveClass("sm:max-w-3xl", "flex", "overflow-hidden");
    const body = within(dialog).getByLabelText("Nome della scelta").closest(".grid");
    expect(body).toHaveClass("sm:grid-cols-2", "min-h-0", "overflow-y-auto");
    expect(body?.contains(within(dialog).getByRole("button", { name: "Aggiorna" }))).toBe(false);
    expect(within(dialog).getByRole("button", { name: "Aggiorna" }).parentElement).toHaveClass("shrink-0");
  });

  it("desktop: il gruppo resta compatto e scorre senza nascondere le azioni", () => {
    apriValore(famiglia("pz"));
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    fireEvent.click(screen.getByRole("button", { name: "Modifica variabile" }));
    const dialog = screen.getByRole("dialog", { name: "Modifica variazione" });
    expect(dialog).toHaveClass("sm:max-w-lg", "flex", "overflow-hidden");
    expect(within(dialog).getByLabelText("Nome").closest(".overflow-y-auto")).toHaveClass("min-h-0");
    expect(within(dialog).getByRole("button", { name: "Aggiorna" }).parentElement).toHaveClass("shrink-0");
  });

  it("distingue vendita e costo anche quando hanno lo stesso supplemento", () => {
    apriValore(famiglia("pz", { maggiorazione_valore: 10, maggiorazione_acquisto: 10 }));
    expect(screen.getByText("Vendita +10%")).toBeInTheDocument();
    expect(screen.getByText("Costo +10%")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Prezzo della scelta" })).toBeInTheDocument();
  });

  it("zero supplemento fornitore si legge esplicitamente, non come etichetta vuota", () => {
    apriValore(famiglia("pz", { maggiorazione_valore: 10, maggiorazione_acquisto: 0 }));
    expect(screen.getByText("Costo nessun supplemento")).toBeInTheDocument();
  });

  it("risalvare il valore lascia −8%, non lo porta a 0%", async () => {
    apriValore(famiglia("pz"));
    fireEvent.change(screen.getByLabelText("Nome della scelta"), { target: { value: "Linea base" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna" }));
    await waitFor(() => expect(mut.updateAxisValue).toHaveBeenCalledOnce());
    expect(salvato()).toMatchObject({ label: "Linea base", maggiorazione_valore: -8, maggiorazione_acquisto: -8 });
  });

  it("il confronto prima/dopo si legge −8%, non «+-8%»", () => {
    apriValore(famiglia("pz"));
    expect(screen.getAllByText("−8%").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/\+-8/)).toBeNull();
  });

  it("da telefono il tasto ± mette il meno che la tastiera decimale non ha", async () => {
    apriValore(famiglia("pz", { maggiorazione_valore: 5, maggiorazione_acquisto: 5 }));
    fireEvent.click(screen.getByRole("button", { name: "Cambia segno al valore vendita" }));
    expect(screen.getByLabelText(/Valore vendita/)).toHaveValue(-5);
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna" }));
    await waitFor(() => expect(mut.updateAxisValue).toHaveBeenCalledOnce());
    expect(salvato()).toMatchObject({ maggiorazione_valore: -5, maggiorazione_acquisto: 5 });
  });

  it("una riduzione oltre il 100% non si salva: il prezzo andrebbe sotto zero", () => {
    apriValore(famiglia("pz"));
    fireEvent.change(screen.getByLabelText(/Valore vendita/), { target: { value: "-150" } });
    expect(screen.getByText(/non può superare il 100%/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aggiorna" })).toBeDisabled();
  });

  it("il prezzo proprio invece resta mai negativo", async () => {
    apriValore(famiglia("pz", { prezzo_vendita: 120 }));
    fireEvent.change(screen.getByLabelText("Prezzo vendita €"), { target: { value: "-20" } });
    expect(screen.getByRole("button", { name: "Aggiorna" })).toBeDisabled();
    expect(mut.updateAxisValue).not.toHaveBeenCalled();
  });

  it("lettura degli importi", () => {
    expect(leggiMaggiorazione("-8")).toBe(-8);
    expect(leggiMaggiorazione("-8,5")).toBe(-8.5);
    expect(leggiMaggiorazione(String(-8))).toBe(-8);
    expect(leggiMaggiorazione("")).toBe(0);
    expect(leggiMaggiorazione("abc")).toBe(0);
    expect(leggiPrezzo("-20")).toBe(0);
    expect(leggiPrezzo("1.234,56")).toBe(1234.56);
  });

  it("± cambia il segno e lascia stare vuoto e zero", () => {
    expect(cambiaSegno("8")).toBe("-8");
    expect(cambiaSegno("-8")).toBe("8");
    expect(cambiaSegno("0")).toBe("0");
    expect(cambiaSegno("")).toBe("");
  });

  it("solo la percentuale ha il limite di −100", () => {
    expect(problemaMaggiorazione("percentuale", -100, -100)).toBeNull();
    expect(problemaMaggiorazione("percentuale", -8, -101)).toMatch(/100%/);
    expect(problemaMaggiorazione("fisso_pz", -500, -500)).toBeNull();
  });

  it("i prompt «Applica %/€» accettano il negativo", () => {
    expect(leggiValoreBulk("-8", true)).toBe(-8);
    expect(leggiValoreBulk("−8", true)).toBe(-8);
    expect(leggiValoreBulk("-8,5", true)).toBe(-8.5);
    expect(leggiValoreBulk("-101", true)).toBeNull();
    expect(leggiValoreBulk("-101", false)).toBe(-101);
    expect(leggiValoreBulk("dieci", false)).toBeNull();
  });

  it("nel preventivo −8% toglie l'8% dal prezzo base", () => {
    const r = calcolaPrezzoFamiglia({ family: famiglia("pz"), selections: { linea: "val-1" }, quantita: 1 });
    expect(r.unit_price_vendita).toBe(920);
    expect(r.unit_price_acquisto).toBe(552);
  });
});

describe("prezzo proprio della variante, detto per il prodotto", () => {
  it("prodotto al m²: etichette in €/m² e spiegazione sulla superficie", () => {
    apriValore(famiglia("mq", { prezzo_vendita: 120 }));
    expect(screen.getByLabelText("Prezzo vendita €/m²")).toBeInTheDocument();
    expect(screen.getByLabelText("Prezzo acquisto €/m²")).toBeInTheDocument();
    expect(screen.getByText(/si moltiplica per la superficie/)).toBeInTheDocument();
  });

  it("prodotto a griglia: dice che nei preventivi non si applica", () => {
    apriValore(famiglia("griglia", { prezzo_vendita: 120 }));
    expect(screen.getByLabelText("Prezzo vendita €")).toBeInTheDocument();
    expect(screen.getByText(/nei preventivi il prezzo proprio non si applica/)).toBeInTheDocument();
  });

  it("nell'elenco il prezzo di un prodotto al m² porta l'unità", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <FamilyAxesEditor family={famiglia("mq", { prezzo_vendita: 120 })} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Apri variabile Linea" }));
    expect(screen.getByText("Vendita €120/m²")).toBeInTheDocument();
  });

  it("le parole seguono il motore dei preventivi", () => {
    expect(prezzoProprioVariante("mq").unita).toBe("€/m²");
    expect(prezzoProprioVariante("pz").unita).toBe("€");
    // Al m²: 100 €/m² × 1,2 m² = 120, al posto del prezzo base.
    const mq = calcolaPrezzoFamiglia({
      family: famiglia("mq", { prezzo_vendita: 100, maggiorazione_tipo: "none", maggiorazione_valore: 0 }),
      selections: { linea: "val-1" },
      larghezza_mm: 1000,
      altezza_mm: 1200,
      quantita: 1,
    });
    expect(mq.unit_price_vendita).toBe(120);
    // A griglia: conta la cella, il prezzo proprio no.
    const griglia = calcolaPrezzoFamiglia(
      {
        family: famiglia("griglia", { prezzo_vendita: 100, maggiorazione_tipo: "none", maggiorazione_valore: 0 }),
        selections: { linea: "val-1" },
        larghezza_mm: 1000,
        altezza_mm: 1200,
        quantita: 1,
      },
      [{ valore_x: 1000, valore_y: 1200, prezzo_vendita: 500, prezzo_acquisto_netto: 300 }],
    );
    expect(griglia.unit_price_vendita).toBe(500);
  });
});
