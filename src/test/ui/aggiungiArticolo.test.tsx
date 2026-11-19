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
vi.mock("@/components/orders/SupplierSelect", () => ({ SupplierSelect: ({ value, onValueChange }: { value?: string; onValueChange: (id: string | undefined) => void }) => <select aria-label="Fornitore" value={value ?? ""} onChange={e => onValueChange(e.target.value || undefined)}><option value="">Nessun fornitore</option><option value="fornitore-a">Fornitore A</option><option value="fornitore-b">Fornitore B</option></select> }));

import { AggiungiArticoloDialog } from "@/components/orders/articoli/AggiungiArticoloDialog";
import type { OrderItem } from "@/components/orders/OrderItemsList";
import type { EsitoSuMisura } from "@/components/orders/articoli/FormSuMisura";

function monta(over: Partial<Parameters<typeof AggiungiArticoloDialog>[0]> = {}) {
  const props = {
    open: true, onOpenChange: vi.fn(), companyId: "az", canViewCosts: true, azzera: 0,
    onAggiungiRiga: vi.fn(() => true), onSalvaPreparazione: vi.fn(async () => {}), fornitori:[{id:"fornitore-a",name:"Fornitore A"},{id:"fornitore-b",name:"Fornitore B"}], onPrendiDaMagazzino: vi.fn(), onEsitoSuMisura: vi.fn(),
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

describe("Prepara articoli per fornitore", () => {
  it("un prezzo inserito riaprendo le misure sostituisce il da definire",async()=>{
    dati.tabelle.article_families=[];const p=monta();await screen.findByText("Silicone bianco");scrivi(cerca(),"Cassonetto speciale");
    fireEvent.click(await screen.findByText("Aggiungi «Cassonetto speciale» su misura, con le posizioni"));
    scrivi(await screen.findByLabelText("Riferimento posizione 1"),"Cucina");fireEvent.click(screen.getByRole("button",{name:"Aggiungi"}));
    fireEvent.click(screen.getByRole("button",{name:"Modifica misure"}));
    scrivi(await screen.findByLabelText("Costo, posizione 1"),"120");fireEvent.click(screen.getByRole("button",{name:"Salva"}));
    fireEvent.click(screen.getByRole("button",{name:"Salva preparazione"}));await waitFor(()=>expect(p.onSalvaPreparazione).toHaveBeenCalled());
    expect(chiamate(p.onSalvaPreparazione)[0][0][0]).toMatchObject({purchase_price:120,prezzo_da_definire:false});
  });
  it("zero esplicito rimane conosciuto quando si riaprono le posizioni",async()=>{
    dati.tabelle.article_families=[];const p=monta();await screen.findByText("Silicone bianco");scrivi(cerca(),"Cassonetto gratuito");
    fireEvent.click(await screen.findByText("Aggiungi «Cassonetto gratuito» su misura, con le posizioni"));
    scrivi(await screen.findByLabelText("Riferimento posizione 1"),"Cucina");scrivi(screen.getByLabelText("Costo, posizione 1"),"0");fireEvent.click(screen.getByRole("button",{name:"Aggiungi"}));
    fireEvent.click(screen.getByRole("button",{name:"Modifica misure"}));expect(await screen.findByLabelText("Costo, posizione 1")).toHaveValue("0");
    scrivi(screen.getByLabelText("Dettagli posizione 1"),"Omaggio concordato");fireEvent.click(screen.getByRole("button",{name:"Salva"}));
    fireEvent.click(screen.getByRole("button",{name:"Salva preparazione"}));await waitFor(()=>expect(p.onSalvaPreparazione).toHaveBeenCalled());
    expect(chiamate(p.onSalvaPreparazione)[0][0][0]).toMatchObject({purchase_price:0,prezzo_da_definire:false});
  });
  it("i dettagli di una riga del catalogo conservano il collegamento e il codice",async()=>{
    dati.tabelle.article_templates=[{id:"a",name:"Cemento",supplier_id:"fornitore-a",standard_cost:10,vat_rate:22,sku:"CEM01",category:"edilizia"}];
    const p=monta();fireEvent.click(await screen.findByText("Cemento"));fireEvent.click(screen.getByRole("button",{name:"Dettagli"}));
    scrivi(screen.getByLabelText("Note e specifiche"),"Consegna al piano");fireEvent.click(screen.getByRole("button",{name:"Aggiungi"}));
    fireEvent.click(screen.getByRole("button",{name:"Salva preparazione"}));await waitFor(()=>expect(p.onSalvaPreparazione).toHaveBeenCalled());
    expect(chiamate(p.onSalvaPreparazione)[0][0][0]).toMatchObject({article_template_id:"a",product_code:"CEM01",categoria:"edilizia",description:"Consegna al piano"});
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
  it("riapre profondità e dettagli della posizione, aggiornando solo ciò che cambia", async () => {
    const r: OrderItem = { id: "cass", name: "Cassonetto", quantity: 1, status: "da_ordinare", position: 0, gruppo_id: "cass-gruppo", riferimento: "P1", supplier_id: "fornitore-a", vat_rate: 22, description: "Ispezione frontale", misure_preventivo: { larghezza_mm: 1800, altezza_mm: 300, profondita_mm: 250 }, measure_status: "da_rilevare", purchase_price: 80, prezzo_fonte: "manuale" };
    const p = monta({ gruppoDaModificare: { righe: [r] } });
    expect(await screen.findByLabelText("Profondità in mm, posizione 1")).toHaveValue("250");
    expect(screen.getByLabelText("Dettagli posizione 1")).toHaveValue("Ispezione frontale");
    scrivi(screen.getByLabelText("Profondità in mm, posizione 1"), "270");
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    const e = chiamate(p.onEsitoSuMisura)[0][0] as EsitoSuMisura;
    expect(e.aggiornate[0].dopo).toMatchObject({ id: "cass", supplier_id: "fornitore-a", description: "Ispezione frontale", misure_preventivo: { profondita_mm: 270 } });
  });
  it("ricerca unica con listino, magazzino e recenti", async()=>{
    monta();await screen.findByText("Silicone bianco");await screen.findByText("Finestra PVC");await screen.findByText("Viti 4x40");
    expect(screen.queryByRole("tab")).toBeNull();
  });
  it("più articoli dello stesso fornitore si preparano insieme, senza salvataggi intermedi", async()=>{
    dati.tabelle.article_templates=[{id:"a",name:"Cemento",supplier_id:"fornitore-a",standard_cost:10,vat_rate:22},{id:"b",name:"Lastre",supplier_id:"fornitore-a",standard_cost:20,vat_rate:22}];
    const p=monta();fireEvent.click(await screen.findByText("Cemento"));fireEvent.click(screen.getByRole("option",{name:/Lastre/}));
    expect(screen.getAllByLabelText("Quantità")).toHaveLength(2);expect(p.onSalvaPreparazione).not.toHaveBeenCalled();
    scrivi(screen.getAllByLabelText("Quantità")[0],"3");
    fireEvent.click(screen.getByRole("button",{name:"Salva preparazione"}));
    await waitFor(()=>expect(p.onSalvaPreparazione).toHaveBeenCalledTimes(1));
    const righe=chiamate(p.onSalvaPreparazione)[0][0] as OrderItem[];
    expect(righe.map(r=>r.supplier_id)).toEqual(["fornitore-a","fornitore-a"]);
    expect(righe[0]).toMatchObject({quantity:3,purchase_price:10,origine_materiale:"manuale"});
  });
  it("il totale riga rimane esatto e il prezzo è netto nel payload",async()=>{
    const p=monta();fireEvent.click(await screen.findByText("Viti 4x40"));
    scrivi(screen.getByLabelText("Quantità"),"3");scrivi(screen.getByLabelText("Totale riga €"),"500");
    fireEvent.click(screen.getByRole("button",{name:"Salva preparazione"}));
    await waitFor(()=>expect(p.onSalvaPreparazione).toHaveBeenCalled());
    const r=(chiamate(p.onSalvaPreparazione)[0][0] as OrderItem[])[0];
    expect(Math.round(r.purchase_price!*r.quantity*100)).toBe(50000);expect(r.preparazione_prezzo?.modo).toBe("totale");
  });
  it("ripartisce il totale fornitura sulle righe una sola volta",async()=>{
    dati.tabelle.article_templates=[{id:"a",name:"Cemento",supplier_id:"fornitore-a",standard_cost:10,vat_rate:22},{id:"b",name:"Lastre",supplier_id:"fornitore-a",standard_cost:20,vat_rate:22}];
    const p=monta();fireEvent.click(await screen.findByText("Cemento"));fireEvent.click(screen.getByRole("option",{name:/Lastre/}));
    scrivi(screen.getByLabelText(/Totale fornitura · IVA esclusa/),"100");fireEvent.click(screen.getByRole("button",{name:"Ripartisci totale"}));
    fireEvent.click(screen.getByRole("button",{name:"Salva preparazione"}));await waitFor(()=>expect(p.onSalvaPreparazione).toHaveBeenCalled());
    const rows=chiamate(p.onSalvaPreparazione)[0][0] as OrderItem[];
    expect(rows.reduce((n,r)=>n+Math.round(r.purchase_price!*r.quantity*100),0)).toBe(10000);
    expect(rows.every(r=>r.preparazione_prezzo?.ripartizione)).toBe(true);
  });
  it("un totale non ripartito impedisce il salvataggio senza perdere le righe",async()=>{
    const p=monta();fireEvent.click(await screen.findByText("Viti 4x40"));scrivi(screen.getByLabelText(/Totale fornitura · IVA esclusa/),"100");
    fireEvent.click(screen.getByRole("button",{name:"Salva preparazione"}));await screen.findByText(/ripartisci il totale sulle righe oppure/);
    expect(p.onSalvaPreparazione).not.toHaveBeenCalled();expect(screen.getByLabelText("Quantità")).toBeVisible();
  });
  it("un errore di salvataggio conserva la preparazione e il retry riusa la richiesta",async()=>{
    const salva=vi.fn().mockRejectedValueOnce(new Error("Errore simulato")).mockResolvedValueOnce(undefined);
    monta({onSalvaPreparazione:salva});fireEvent.click(await screen.findByText("Viti 4x40"));
    fireEvent.click(screen.getByRole("button",{name:"Salva preparazione"}));await screen.findByText("Errore simulato");
    const id=salva.mock.calls[0][1];
    fireEvent.click(screen.getByRole("button",{name:"Salva preparazione"}));await waitFor(()=>expect(salva).toHaveBeenCalledTimes(2));expect(salva.mock.calls[1][1]).toBe(id);
  });
  it("la fornitura senza prezzo si salva come da definire, distinto da zero",async()=>{
    dati.tabelle.article_templates=[{id:"a",name:"Articolo nuovo",standard_cost:null,supplier_id:null}];
    const p=monta();fireEvent.click(await screen.findByText("Articolo nuovo"));fireEvent.click(screen.getByRole("button",{name:"Salva preparazione"}));
    await waitFor(()=>expect(p.onSalvaPreparazione).toHaveBeenCalled());expect(chiamate(p.onSalvaPreparazione)[0][0][0]).toMatchObject({prezzo_da_definire:true,purchase_price:0});
  });
  it("beni manuali con profondità e note entrano nella preparazione prima del salvataggio",async()=>{
    dati.tabelle.article_families=[];const p=monta();await screen.findByText("Silicone bianco");scrivi(cerca(),"Cassonetto speciale");
    fireEvent.click(await screen.findByText("Aggiungi «Cassonetto speciale» su misura, con le posizioni"));
    scrivi(await screen.findByLabelText("Larghezza in mm, posizione 1"),"1800");scrivi(screen.getByLabelText("Altezza in mm, posizione 1"),"300");
    fireEvent.click(screen.getByRole("switch",{name:"Mostra profondità"}));scrivi(screen.getByLabelText("Profondità in mm, posizione 1"),"250");scrivi(screen.getByLabelText("Dettagli posizione 1"),"Ispezione frontale");
    fireEvent.click(screen.getByRole("button",{name:"Aggiungi"}));expect(p.onEsitoSuMisura).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Salva preparazione"}));await waitFor(()=>expect(p.onSalvaPreparazione).toHaveBeenCalled());
    expect(chiamate(p.onSalvaPreparazione)[0][0][0]).toMatchObject({description:"Ispezione frontale",misure_preventivo:{larghezza_mm:1800,altezza_mm:300,profondita_mm:250}});
  });
  it("senza permesso di costo non mostra cifre monetarie neppure in tabella",async()=>{
    monta({canViewCosts:false});fireEvent.click(await screen.findByText("Viti 4x40"));
    expect(screen.queryByLabelText("Prezzo cad. €")).toBeNull();expect(screen.getByRole("dialog").textContent).not.toContain("€");
  });
  it("un nuovo articolo senza fornitore non eredita quello del listino precedente",async()=>{
    dati.tabelle.article_templates=[{id:"a",name:"Cemento",standard_cost:10,supplier_id:"fornitore-a"}];
    monta();fireEvent.click(await screen.findByText("Cemento"));fireEvent.click(screen.getByRole("button",{name:"Aggiungi riga libera"}));
    expect(screen.getByRole("region",{name:"Fornitura senza fornitore"})).toBeVisible();expect(screen.getByRole("region",{name:"Fornitura Fornitore A"})).toBeVisible();
  });
  it("i prezzi da documenti sono visibili separatamente dalle nuove stime",()=>{
    monta({articoli:[{id:"x",name:"Articolo ordinato",quantity:2,position:0,status:"ordinato",supplier_id:"fornitore-a",purchase_price:120,prezzo_fonte:"ordine",costo_stimato_iniziale:100}]});
    expect(screen.getByText(/Fornitore A · 2 pz · ODA/)).toBeVisible();
    expect(screen.queryByLabelText("Prezzo cad. €")).toBeNull();
  });
});
