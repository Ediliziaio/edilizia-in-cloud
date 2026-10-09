import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FamilyWithAxes, MaggiorazioneTipo } from "@/types/articleFamily";

const query = vi.hoisted(() => ({
  data: [] as Array<{ valore_x: number; valore_y: number; prezzo_vendita: number; prezzo_acquisto: number }>,
  isLoading: false,
  isError: false,
}));
vi.mock("@tanstack/react-query", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQuery: () => query,
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "demo" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { FamilyPricePreview } from "@/components/listino/FamilyPricePreview";
import { calcolaPrezzoFamiglia } from "@/hooks/useFamilyPricing";

afterEach(() => {
  cleanup();
  localStorage.clear();
  query.data = [];
  query.isLoading = false;
  query.isError = false;
});
function family(overrides: Partial<FamilyWithAxes> = {}): FamilyWithAxes {
  return { id: "preview-regression", modalita_prezzo_base: "pz", prezzo_base_mode: "vendita",
    prezzo_base_vendita: 100, prezzo_base_acquisto: 60, axes: [], ...overrides } as FamilyWithAxes;
}
function axis(codice: string, tipo: MaggiorazioneTipo, vendita: number, costo = 0): FamilyWithAxes["axes"][number] {
  return { id: codice, codice, nome: codice, sort_order: 0, values: [{
    id: codice, valore: codice, label: codice, is_default: true, attivo: true,
    maggiorazione_tipo: tipo, maggiorazione_valore: vendita, maggiorazione_acquisto: costo,
  }] } as FamilyWithAxes["axes"][number];
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function total(q: string, value: number) {
  const [integer, cents] = value.toFixed(2).split(".");
  const eur = `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents} €`;
  expect(screen.getByText(`Totale vendita (${q} pz)`).parentElement).toHaveTextContent(eur);
}
function grid() {
  query.data = [
    { valore_x: 1200, valore_y: 1400, prezzo_vendita: 9999, prezzo_acquisto: 1000 },
    { valore_x: 1500, valore_y: 1800, prezzo_vendita: 8888, prezzo_acquisto: 1200 },
  ];
}

describe("simulatore listino: stessi importi del preventivo generico", () => {
  it("arrotonda prima l'unitario e poi il totale, senza un centesimo di scarto", () => {
    render(<FamilyPricePreview family={family({ prezzo_base_vendita: 33.335 })} />);
    change("Quantità", "3");
    total("3", 100.02);
  });

  it("mq, sconti a cascata, markup e opzioni usano lo stesso motore", () => {
    const f = family({ modalita_prezzo_base: "mq", prezzo_base_mode: "acquisto_markup",
      prezzo_base_acquisto: 300, markup_tipo: "percentuale", markup_valore: 40,
      sconto_fornitore_1: 30, sconto_fornitore_2: 5,
      axes: [axis("colore", "percentuale", 10, 8), axis("maniglia", "fisso_pz", 20, 10)] });
    render(<FamilyPricePreview family={f} />);
    change("Quantità", "2");
    const result = calcolaPrezzoFamiglia({ family: f, selections: { colore: "colore", maniglia: "maniglia" },
      larghezza_mm: 1200, altezza_mm: 1400, quantita: 2 });
    total("2", result.totale_vendita);
  });

  it("la griglia usa il markup corrente e il confronto include le opzioni", () => {
    grid();
    const f = family({ modalita_prezzo_base: "griglia", prezzo_base_mode: "acquisto_markup",
      markup_tipo: "percentuale", markup_valore: 100, sconto_fornitore_1: 50, sconto_fornitore_2: 3,
      axes: [axis("colore", "percentuale", 10), axis("maniglia", "fisso_pz", 20)] });
    render(<FamilyPricePreview family={f} />);
    total("1", 1087);
    fireEvent.click(screen.getByRole("button", { name: /Griglia disponibile/ }));
    expect(screen.getByTitle("1200×1400 mm: 1.087,00 €")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi confronto/ }));
    fireEvent.change(screen.getByPlaceholderText("W (mm)"), { target: { value: "1250" } });
    fireEvent.change(screen.getByPlaceholderText("H (mm)"), { target: { value: "1420" } });
    expect(screen.getByPlaceholderText("W (mm)").parentElement).toHaveTextContent("1.300,40 €");
    expect(screen.getByPlaceholderText("W (mm)").parentElement).toHaveTextContent("+213,40 €");
    fireEvent.click(screen.getByRole("button", { name: "cm" }));
    expect(screen.getByPlaceholderText("W (cm)")).toHaveValue(125);
    expect(screen.getByPlaceholderText("H (cm)")).toHaveValue(142);
    expect(screen.getByPlaceholderText("W (cm)").parentElement).toHaveTextContent("1.300,40 €");
    total("1", 1087);
  });

  it("griglia vuota: non ripiega sul prezzo base o sui supplementi", () => {
    render(<FamilyPricePreview family={family({ modalita_prezzo_base: "griglia", prezzo_base_vendita: 999,
      axes: [axis("extra", "fisso_pz", 50)] })} />);
    expect(screen.getByText(/Calcolo non disponibile:/)).toBeInTheDocument();
    expect(screen.queryByText(/Totale vendita/)).toBeNull();
  });

  it("fuori griglia: blocca il totale e sceglie una cella realmente presente", () => {
    query.data = [
      { valore_x: 2000, valore_y: 1000, prezzo_vendita: 400, prezzo_acquisto: 200 },
      { valore_x: 1000, valore_y: 2500, prezzo_vendita: 600, prezzo_acquisto: 300 },
    ];
    render(<FamilyPricePreview family={family({ modalita_prezzo_base: "griglia", axes: [axis("extra", "fisso_pz", 50)] })} />);
    expect(screen.queryByText(/Totale vendita/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Usa una misura presente in griglia" }));
    expect(screen.getByLabelText("Larghezza (mm)")).toHaveValue(1000);
    expect(screen.getByLabelText("Altezza (mm)")).toHaveValue(2500);
    total("1", 650);
  });

  it("quantità zero non viene trasformata silenziosamente in uno", () => {
    render(<FamilyPricePreview family={family()} />);
    change("Quantità", "0");
    expect(screen.getByText(/quantità valida maggiore di zero/)).toBeInTheDocument();
    expect(screen.queryByText(/Totale vendita/)).toBeNull();
  });

  it("il metro lineare usa una lunghezza esplicita, non la larghezza del serramento", () => {
    render(<FamilyPricePreview family={family({ axes: [axis("profilo", "fisso_ml", 30, 10)] })} />);
    change("Lunghezza (m)", "2.5");
    total("1", 175);
    change("Lunghezza (m)", "0");
    expect(screen.queryByText(/Totale vendita/)).toBeNull();
  });

  it("una maggiorazione mq rende visibili e obbligatorie le misure anche per un prezzo a pezzo", () => {
    render(<FamilyPricePreview family={family({ axes: [axis("vetro", "fisso_mq", 20)] })} />);
    total("1", 133.6);
    change("Larghezza (mm)", "0");
    expect(screen.queryByText(/Totale vendita/)).toBeNull();
  });

  it("la variante con prezzo proprio ma senza costo non eredita un margine attendibile", () => {
    const a = axis("serie", "none", 0);
    a.values[0].prezzo_vendita = 200;
    render(<FamilyPricePreview family={family({ axes: [a] })} />);
    total("1", 200);
    expect(screen.getByText(/Margine non calcolabile/)).toBeInTheDocument();
    expect(screen.getByText("Da impostare")).toBeInTheDocument();
  });

  it("non inventa un volume e mostra l'avviso anche con griglia valida", () => {
    grid();
    render(<FamilyPricePreview family={family({ modalita_prezzo_base: "griglia", axes: [axis("volume", "fisso_mc", 100)] })} />);
    expect(screen.getByText(/mc non ancora supportata/)).toBeInTheDocument();
    total("1", 9999);
  });

  it.each(["loading", "error"])("distingue una griglia %s da una griglia vuota", state => {
    query.isLoading = state === "loading";
    query.isError = state === "error";
    render(<FamilyPricePreview family={family({ modalita_prezzo_base: "griglia" })} />);
    expect(screen.getByRole("status")).toHaveTextContent(state === "loading" ? "Caricamento" : "Impossibile caricare");
    expect(screen.queryByText(/Griglia non configurata/)).toBeNull();
    expect(screen.queryByText(/Totale vendita/)).toBeNull();
  });
});
