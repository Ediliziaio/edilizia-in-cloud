import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const dati = vi.hoisted(() => ({
  tabelle: {} as Record<string, unknown[]>,
  inserite: [] as unknown[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const costruttore = (tabella: string) => {
    const q: Record<string, unknown> = {};
    let soloAttivi = false;
    const risposta = () => ({ data: tabella === "article_families" && (q as { _una?: boolean })._una ? (dati.tabelle.famiglia?.[0] ?? null) : (dati.tabelle[tabella] ?? []).filter(r => !soloAttivi || (r as { attivo?: boolean }).attivo !== false), error: null as null });
    for (const m of ["select", "eq", "is", "in", "order", "limit"]) q[m] = () => q;
    q.eq = (key: string, value: unknown) => { if (tabella === "article_templates" && key === "attivo" && value === true) soloAttivi = true; return q; };
    q.maybeSingle = () => { (q as { _una?: boolean })._una = true; return Promise.resolve(risposta()); };
    q.single = () => Promise.resolve({ data: { id: "nuovo" }, error: null });
    q.insert = (riga: unknown) => { dati.inserite.push(riga); return q; };
    q.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(risposta()).then(ok, ko);
    return q;
  };
  return { supabase: { from: (t: string) => costruttore(t) } };
});
vi.mock("@/hooks/useFamilyPricing", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useFamilyPricing")>()),
  useFamilyGrid: () => ({ data: [{ valore_x: 1500, valore_y: 1800, prezzo_vendita: 800, prezzo_acquisto_netto: 450 }] }),
}));
vi.mock("@/components/orders/SupplierSelect", () => ({ SupplierSelect: () => <div data-testid="fornitore" /> }));

import { AggiungiArticoloDialog } from "@/components/orders/articoli/AggiungiArticoloDialog";
import type { OrderItem } from "@/components/orders/OrderItemsList";
import type { EsitoSuMisura } from "@/components/orders/articoli/FormSuMisura";

function monta(over: Partial<Parameters<typeof AggiungiArticoloDialog>[0]> = {}) {
  const props = {
    open: true, onOpenChange: vi.fn(), companyId: "az", canViewCosts: true, azzera: 0,
    onAggiungiRiga: vi.fn(() => true), onPrendiDaMagazzino: vi.fn(), onEsitoSuMisura: vi.fn(),
    ...over,
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const avvolto = (figli: ReactNode) => <QueryClientProvider client={qc}>{figli}</QueryClientProvider>;
  render(avvolto(<AggiungiArticoloDialog {...props} />));
  return props;
}

const chiamate = (f: unknown) => (f as ReturnType<typeof vi.fn>).mock.calls;
const cerca = () => screen.getByPlaceholderText("Cerca o scrivi il nome dell'articolo…");
const scrivi = (el: Element, v: string) => fireEvent.change(el, { target: { value: v } });

beforeAll(() => {
  // jsdom non li ha: li usa la lista della ricerca (cmdk).
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  dati.inserite.length = 0;
  dati.tabelle = {
    warehouse_stock: [{ id: "s1", name: "Silicone bianco", quantity: 4, unit_cost: 3, tracking_mode: "fungible", warehouse: { id: "w", name: "Sede" } }],
    article_templates: [],
    article_families: [{ id: "f1", nome: "Finestra PVC", codice: null, descrizione: null, immagine_url: null, prezzo_base_acquisto: 0, prezzo_base_vendita: 0, categoria_id: null, manodopera_costo_acquisto: 0, supplier_id: null, vat_rate: 10, unit_of_measure: "pz", prezzo_base_mode: "vendita", sconto_fornitore_1: 0, sconto_fornitore_2: 0, markup_tipo: null, markup_valore: 0, vertical: "serramenti", modalita_prezzo_base: "griglia" }],
    listino_categorie: [], article_family_axes: [], order_items: [{ name: "Viti 4x40", product_code: null, purchase_price: 7, vat_rate: 22, supplier_id: null, unita_misura: "scatola", categoria: null, article_template_id: null }],
    external_teams: [],
    famiglia: [{ id: "f1", nome: "Finestra PVC", vertical: "serramenti", modalita_prezzo_base: "griglia", prezzo_base_mode: "vendita", prezzo_base_vendita: 0, prezzo_base_acquisto: 0, vat_rate: 10, supplier_id: null, axes: [], custom_field_values: {} }],
  };
});

describe("Aggiungi articolo", () => {
  it("propone solo i materiali attivi e lascia gli inattivi fuori dalle nuove commesse", async () => {
    dati.tabelle.article_templates = [
      { id: "active", name: "Calcestruzzo verificato", standard_cost: 80, attivo: true },
      { id: "inactive", name: "Calcestruzzo storico", standard_cost: 70, attivo: false },
    ];
    monta();
    await screen.findByText("Calcestruzzo verificato");
    expect(screen.queryByText("Calcestruzzo storico")).toBeNull();
  });

  it("modifica prima del salvataggio: le righe senza id non si raddoppiano", async () => {
    const riga: OrderItem = { name: "Finestra PVC", quantity: 1, status: "da_ordinare", position: 0, gruppo_id: "g", riferimento: "Cucina", family_id: "f1", axis_selections: {}, misure_preventivo: { larghezza_mm: 1200, altezza_mm: 1400, mq: 1 }, measure_status: "da_rilevare", purchase_price: 450, prezzo_fonte: "listino" };
    const p = monta({ gruppoDaModificare: { righe: [riga] } });
    scrivi(await screen.findByLabelText("Larghezza in mm, posizione 1"), "1500");
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(p.onEsitoSuMisura).toHaveBeenCalled());
    const e = chiamate(p.onEsitoSuMisura)[0][0] as EsitoSuMisura;
    expect(e.nuove).toHaveLength(0);
    expect(e.tolte).toHaveLength(0);
    expect(e.aggiornate[0].prima).toBe(riga);
  });

  it("una ricerca sola: magazzino, listino con Su misura, usati, senza schede", async () => {
    monta();
    await screen.findByText("Silicone bianco");
    await screen.findByText("Su misura");
    await screen.findByText("Viti 4x40");
    expect(screen.queryByRole("tab")).toBeNull();
    scrivi(cerca(), "Tassello 8");
    await screen.findByText(/Aggiungi «Tassello 8»$/);
    expect(screen.queryByText("Silicone bianco")).toBeNull();
  });

  it("articolo nuovo: non va nel catalogo, Invio aggiunge e si torna alla ricerca", async () => {
    const p = monta();
    await screen.findByText("Silicone bianco");
    scrivi(cerca(), "Tassello 8");
    fireEvent.click(await screen.findByText(/Aggiungi «Tassello 8»$/));
    const q = await screen.findByLabelText("Quantità");
    expect(screen.getByLabelText("Solo per questa commessa")).toBeChecked();
    scrivi(q, "12,5");
    fireEvent.change(screen.getByLabelText("Unità"), { target: { value: "kg" } });
    fireEvent.change(screen.getByLabelText("Costo cad. €"), { target: { value: "2,40" } });
    fireEvent.keyDown(q, { key: "Enter" });
    await waitFor(() => expect(p.onAggiungiRiga).toHaveBeenCalledTimes(1));
    const riga = chiamate(p.onAggiungiRiga)[0][0] as OrderItem;
    expect(riga).toMatchObject({ name: "Tassello 8", quantity: 12.5, unita_misura: "kg", purchase_price: 2.4, status: "da_ordinare" });
    expect(riga.gruppo_id).toBeUndefined();
    expect(dati.inserite).toHaveLength(0);
    await waitFor(() => expect(cerca()).toBeTruthy());
  });

  it("se l'articolo c'è già a scaffale lo dice e porta al prelievo, senza ordinarlo", async () => {
    const p = monta();
    await screen.findByText("Silicone bianco");
    scrivi(cerca(), "Silicone");
    fireEvent.click(await screen.findByText(/Aggiungi «Silicone»$/));
    const nome = await screen.findByLabelText("Nome");
    expect(screen.queryByText(/Ce l'hai già in magazzino/)).toBeNull();
    scrivi(nome, "silicone bianco");
    expect(await screen.findByText(/Ce l'hai già in magazzino: 4 disponibili in Sede/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Prendi dal magazzino" }));
    expect(await screen.findByLabelText("Quantità")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preleva" })).toBeTruthy();
    expect(p.onAggiungiRiga).not.toHaveBeenCalled();
  });

  it("«Salva nel catalogo» entra nel catalogo solo se lo si sceglie", async () => {
    const p = monta();
    await screen.findByText("Silicone bianco");
    scrivi(cerca(), "Tassello 8");
    fireEvent.click(await screen.findByText(/Aggiungi «Tassello 8»$/));
    await screen.findByLabelText("Quantità");
    fireEvent.click(screen.getByLabelText("Salva nel catalogo"));
    fireEvent.keyDown(screen.getByLabelText("Quantità"), { key: "Enter" });
    await waitFor(() => expect(p.onAggiungiRiga).toHaveBeenCalledTimes(1));
    expect(dati.inserite).toHaveLength(1);
    expect(dati.inserite[0]).toMatchObject({ company_id: "az", name: "Tassello 8" });
    expect((chiamate(p.onAggiungiRiga)[0][0] as OrderItem).article_template_id).toBe("nuovo");
  });

  it("doppio Invio aggiunge una volta sola", async () => {
    const p = monta();
    await screen.findByText("Silicone bianco");
    fireEvent.click(screen.getByText("Viti 4x40"));
    const q = await screen.findByLabelText("Quantità");
    fireEvent.keyDown(q, { key: "Enter" });
    fireEvent.keyDown(q, { key: "Enter" });
    await waitFor(() => expect(p.onAggiungiRiga).toHaveBeenCalledTimes(1));
  });

  it("senza permesso nessuna cifra", async () => {
    monta({ canViewCosts: false });
    await screen.findByText("Silicone bianco");
    expect(document.body.textContent).not.toMatch(/€/);
    fireEvent.click(screen.getByText("Viti 4x40"));
    await screen.findByLabelText("Quantità");
    expect(screen.queryByLabelText("Costo cad. €")).toBeNull();
  });

  it("su misura: una riga per posizione con lo stesso gruppo e il costo del listino", async () => {
    const p = monta();
    fireEvent.click(await screen.findByText("Finestra PVC"));
    scrivi(await screen.findByLabelText("Riferimento posizione 1"), "Cucina");
    scrivi(screen.getByLabelText("Larghezza in mm, posizione 1"), "1200");
    scrivi(screen.getByLabelText("Altezza in mm, posizione 1"), "1400");
    scrivi(screen.getByLabelText("Pezzi, posizione 1"), "2");
    fireEvent.click(screen.getByRole("button", { name: "Posizione" }));
    scrivi(await screen.findByLabelText("Riferimento posizione 2"), "Bagno");
    const bottone = screen.getByRole("button", { name: "Aggiungi" });
    fireEvent.click(bottone);
    fireEvent.click(bottone);
    await waitFor(() => expect(p.onEsitoSuMisura).toHaveBeenCalledTimes(1));
    const { nuove } = chiamate(p.onEsitoSuMisura)[0][0] as EsitoSuMisura;
    expect(nuove).toHaveLength(2);
    expect(nuove[0].gruppo_id).toBe(nuove[1].gruppo_id);
    expect(nuove[0]).toMatchObject({ riferimento: "Cucina", quantity: 2, family_id: "f1", purchase_price: 450, prezzo_fonte: "listino", measure_status: "da_rilevare", misure_preventivo: { larghezza_mm: 1200, altezza_mm: 1400 } });
    expect(nuove[1]).toMatchObject({ riferimento: "Bagno", purchase_price: 0, prezzo_fonte: null, measure_status: "da_rilevare", misure_preventivo: null });
  });

  it("«Non ho il listino» lascia il costo da definire", async () => {
    const p = monta();
    fireEvent.click(await screen.findByText("Finestra PVC"));
    scrivi(await screen.findByLabelText("Larghezza in mm, posizione 1"), "1200");
    scrivi(screen.getByLabelText("Altezza in mm, posizione 1"), "1400");
    fireEvent.click(screen.getByRole("switch", { name: "Non ho il listino" }));
    expect(screen.getByLabelText("Costo, posizione 1")).toHaveAttribute("placeholder", "da definire");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(p.onEsitoSuMisura).toHaveBeenCalled());
    const { nuove } = chiamate(p.onEsitoSuMisura)[0][0] as EsitoSuMisura;
    expect(nuove[0]).toMatchObject({ purchase_price: 0, standard_cost: 0, prezzo_fonte: null });
  });

  it("magazzino: non si preleva più di quanto c'è", async () => {
    const p = monta();
    fireEvent.click(await screen.findByText("Silicone bianco"));
    const q = await screen.findByLabelText("Quantità");
    scrivi(q, "5");
    fireEvent.keyDown(q, { key: "Enter" });
    await screen.findByText(/ce ne sono 4/);
    expect(p.onPrendiDaMagazzino).not.toHaveBeenCalled();
    scrivi(q, "3");
    fireEvent.keyDown(q, { key: "Enter" });
    await waitFor(() => expect(p.onPrendiDaMagazzino).toHaveBeenCalledTimes(1));
    expect(chiamate(p.onPrendiDaMagazzino)[0][1]).toBe(3);
  });

  it("modifica di un gruppo: scrive solo le righe cambiate", async () => {
    const riga = (id: string, riferimento: string, larghezza_mm: number): OrderItem => ({
      id, name: "Finestra PVC", quantity: 1, status: "da_ordinare", position: 0, gruppo_id: "g", riferimento, family_id: "f1", axis_selections: {},
      misure_preventivo: { larghezza_mm, altezza_mm: 1400, mq: 1 }, measure_status: "da_rilevare", purchase_price: 450, prezzo_fonte: "listino",
    });
    const p = monta({ gruppoDaModificare: { righe: [riga("a", "Cucina", 1200), riga("b", "Bagno", 800)] } });
    scrivi(await screen.findByLabelText("Larghezza in mm, posizione 2"), "900");
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(p.onEsitoSuMisura).toHaveBeenCalled());
    const e = chiamate(p.onEsitoSuMisura)[0][0] as EsitoSuMisura;
    expect(e.nuove).toHaveLength(0);
    expect(e.tolte).toHaveLength(0);
    expect(e.aggiornate.map((r) => r.dopo.id)).toEqual(["b"]);
    expect(e.aggiornate[0].dopo.misure_preventivo?.larghezza_mm).toBe(900);
  });
});
