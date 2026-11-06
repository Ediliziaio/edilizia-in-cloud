import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";

const stato = vi.hoisted(() => ({
  tabelle: {} as Record<string, Record<string, unknown>[]>,
  chiamate: [] as { tabella: string; metodo: string; args: unknown[] }[],
  companyId: "azienda",
  structureError: null as unknown,
  impostazioni: null as unknown,
  sedi: [] as unknown[],
  tipoSede: null as string | null,
  sediSelezionate: [] as string[],
  cdg: [] as unknown[],
  errore: null as unknown,
  errori: {} as Record<string, unknown>,
  refetchSedi: vi.fn(),
  refetchStruttura: vi.fn(),
  refetchCdg: vi.fn(),
}));

vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => stato.companyId }));
vi.mock("@/lib/orders/archivedOrderScope", () => ({
  loadArchivedOrderIds: async (): Promise<string[]> => [],
  excludeArchivedOrders: <T,>(q: T) => q,
}));
vi.mock("@/hooks/controlloGestione/useCompanyStructure", () => ({
  useCompanyStructure: () => ({ data: null as unknown, error: stato.structureError, refetch: stato.refetchStruttura }),
}));
vi.mock("@/hooks/controlloGestione/useMarginalitaCommesse", () => ({
  useMarginalitaCommesse: () => ({ data: { righe: stato.cdg }, refetch: stato.refetchCdg }),
}));
vi.mock("@/hooks/useSediAnalytics", () => ({ useSediAnalytics: () => ({ data: { sedi: stato.sedi }, isLoading: false, refetch: stato.refetchSedi }) }));
vi.mock("@/store/sedeFilterStore", () => ({ useSedeFilter: () => ({ sediSelezionate: stato.sediSelezionate, tipoSede: stato.tipoSede, periodo: { da: "", a: "" } }) }));
vi.mock("@/components/sedi/SedeFilterBar", () => ({ SedeFilterBar: () => <div role="group" aria-label="Filtri sedi">Controlli sedi disponibili</div> }));
vi.mock("@/components/sedi/SedeMargineCard", () => ({
  SedeMargineCard: ({ sede }: { sede: { nome: string; margine_pct: number } }) => <div>{`${sede.nome}: ${sede.margine_pct.toFixed(1)}%`}</div>,
}));
vi.mock("@/integrations/supabase/client", () => {
  const costruttore = (tabella: string) => {
    const righe = () => stato.tabelle[tabella] ?? [];
    let da = 0, a = Infinity;
    const b: Record<string, unknown> = {};
    for (const metodo of ["select", "eq", "is", "order", "limit", "range", "in", "or", "not"]) {
      b[metodo] = (...args: unknown[]) => { stato.chiamate.push({ tabella, metodo, args }); if (metodo === "range") { da = Number(args[0]); a = Number(args[1]); } return b; };
    }
    b.maybeSingle = async () => ({ data: stato.impostazioni, error: stato.errori[tabella] ?? null });
    b.then = (ok: (r: unknown) => unknown) => ok(stato.errori[tabella] ? {data:null,error:stato.errori[tabella]} : tabella === "v_ordine_marginalita" && stato.errore
      ? { data: null, error: stato.errore, count: null }
      : { data: righe().slice(da, a + 1), error: null, count: righe().length });
    return b;
  };
  return { supabase: { from: costruttore } };
});

import MarginalitaCantieri from "@/pages/azienda/MarginalitaCantieri";

const riga = (id: string, over: Record<string, unknown>) => ({
  id, company_id: "azienda", order_code: id, description: `lavori ${id}`, preventivo_contratto: 1000, variazioni_approvate: 0,
  preventivo_totale: 1000, costo_acquisti: 0, costo_materiali_magazzino: 0, movimenti_magazzino_senza_costo: 0,
  costo_manodopera: 0, costo_provvigioni: 0, costo_diretto: 0, costo_rimborsi_km: 0, costo_errori: 0, consuntivo: 0, margine: 1000,
  margine_perc: 100, cliente_nome: "Cliente", work_start_date: null as string | null, work_end_date: null as string | null,
  percentuale_avanzamento: 0, created_at: "2026-05-01T10:00:00Z", ...over,
});

function apri() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TooltipProvider>
          <MarginalitaCantieri />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const tabella = () => screen.getByRole("table");
const codici = () => within(tabella()).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent?.match(/#([A-Z]+)/)?.[1]);

beforeEach(() => {
  stato.companyId = "azienda";
  stato.structureError = null;
  stato.chiamate = [];
  stato.errore = null;
  stato.errori = {};
  vi.clearAllMocks();
  stato.impostazioni = null;
  stato.sedi = [];
  stato.tipoSede = null;
  stato.sediSelezionate = [];
  stato.cdg = [];
  // Senza struttura né percentuale dell'azienda le fasce seguono il margine diretto.
  stato.tabelle = {
    v_ordine_marginalita: [
      riga("VUOTA", { preventivo_totale: 0, preventivo_contratto: 0, margine: 0, margine_perc: 0, cliente_nome: "" }),
      riga("PERDITA", { consuntivo: 1100, costo_manodopera: 1100, margine: -100, margine_perc: -10 }),
      riga("SOTTO", { consuntivo: 750, costo_acquisti: 750, margine: 50, margine_perc: 5 }),
      riga("MEDIA", { consuntivo: 650, costo_acquisti: 650, margine: 150, margine_perc: 15 }),
      riga("SANA", { consuntivo: 500, costo_manodopera: 400, costo_acquisti: 100, margine: 500, margine_perc: 50 }),
      riga("SENZACOSTI", { cliente_nome: "" }),
    ],
    orders: [{ id: "SENZACOSTI", client_company: "Rossi Srl", client_name: "Mario" }],
    order_errors: [],
    v_ordine_costi_mezzi_stimati: [],
  };
});

describe("Marginalità cantieri", () => {
  it("ogni commessa sta in un solo filtro e le incomplete non sono «in perdita»", async () => {
    apri();
    await waitFor(() => expect(codici()).toHaveLength(6));
    const attese: [string, string[]][] = [
      ["In perdita", ["PERDITA"]],
      ["Sotto target", ["SOTTO"]],
      ["Da monitorare", ["MEDIA"]],
      ["Sani", ["SANA"]],
      ["Dati incompleti", ["VUOTA", "SENZACOSTI"]],
    ];
    for (const [filtro, attesi] of attese) {
      fireEvent.click(screen.getByRole("button", { name: filtro }));
      expect(codici().sort()).toEqual([...attesi].sort());
    }
  });

  it("all'apertura mostra prima le perdite vere, non le righe senza margine", async () => {
    apri();
    await waitFor(() => expect(codici()).toHaveLength(6));
    expect(codici()[0]).toBe("PERDITA");
    expect(codici().slice(-2).sort()).toEqual(["SENZACOSTI", "VUOTA"]);
  });

  it("usa il nome scritto sulla commessa quando manca il profilo cliente", async () => {
    apri();
    await waitFor(() => expect(within(tabella()).getByText("Rossi Srl")).toBeTruthy());
  });

  it("mostra la proiezione solo sui lavori aperti, con l'avanzamento delle fasi", async () => {
    stato.cdg = [
      { id: "MEDIA", work_state: "open", pct_avanzamento: 0.4, margine_atteso_perc: 12.5 },
      { id: "SANA", work_state: "completed", pct_avanzamento: 0.36, margine_atteso_perc: null },
    ];
    apri();
    await waitFor(() => expect(codici()).toHaveLength(6));
    expect(within(tabella()).getByText("Avanzamento 40% · proiezione a fine lavori 12.5%")).toBeTruthy();
    expect(within(tabella()).queryByText(/Avanzamento 36%/)).toBeNull();
  });

  it("non inventa la quota di struttura se l'azienda non ha dati né percentuale", async () => {
    apri();
    await waitFor(() => expect(codici()).toHaveLength(6));
    expect(screen.getByText("struttura non disponibile")).toBeTruthy();
    expect(within(tabella()).queryByText("% azienda")).toBeNull();
    expect(screen.queryByText(/20\.0%/)).toBeNull();
  });

  it("usa la percentuale solo se è quella dell'azienda", async () => {
    stato.impostazioni = { overhead_percentuale: 8, margine_target_default: 10 };
    apri();
    await waitFor(() => expect(within(tabella()).getAllByText("% azienda").length).toBeGreaterThan(0));
    expect(screen.queryByText("struttura non disponibile")).toBeNull();
  });

  it("con una sola sede non ripete i totali in una scheda", async () => {
    stato.sedi = [{ sede_id: "S1", nome: "Sede unica", margine_pct: 70 }];
    apri();
    await waitFor(() => expect(codici()).toHaveLength(6));
    expect(screen.queryByText("Performance per Sede")).toBeNull();
    expect(screen.queryByText(/Sede unica/)).toBeNull();
    expect(stato.chiamate.some((c) => c.tabella === "orders" && c.metodo === "select" && c.args[0] === "id, sede_id")).toBe(false);
  });

  it("con più sedi il margine viene dalle commesse, non dai preventivi", async () => {
    stato.sedi = [
      { sede_id: "S1", nome: "Milano", margine_pct: 99 },
      { sede_id: "S2", nome: "Torino", margine_pct: 99 },
      { sede_id: "S3", nome: "Vuota", margine_pct: 99 },
    ];
    stato.tabelle.orders = [
      { id: "SANA", sede_id: "S1", client_company: null, client_name: null },
      { id: "PERDITA", sede_id: "S2", client_company: null, client_name: null },
      { id: "SENZACOSTI", sede_id: "S1", client_company: "Rossi Srl", client_name: "Mario" },
    ];
    apri();
    expect(await screen.findByText("Milano: 50.0%")).toBeTruthy();
    expect(screen.getByText("Torino: -10.0%")).toBeTruthy();
    expect(screen.queryByText(/Vuota/)).toBeNull();
  });

  it("legge le anomalie per azienda, senza elencare le commesse nell'indirizzo", async () => {
    apri();
    await waitFor(() => expect(codici()).toHaveLength(6));
    await waitFor(() => expect(stato.chiamate.some((c) => c.tabella === "order_errors" && c.metodo === "range")).toBe(true));
    expect(stato.chiamate.some((c) => c.tabella === "order_errors" && c.metodo === "in")).toBe(false);
  });

  it("se i dati non arrivano non dice che le commesse sono sopra il target", async () => {
    stato.tabelle.v_ordine_marginalita = [];
    stato.errore = { message: "canceling statement due to statement timeout" };
    apri();
    await waitFor(() => expect(screen.getByText(/Dati non caricati: premi Aggiorna dati/)).toBeTruthy());
    expect(screen.queryByText(/sono sopra il target/)).toBeNull();
    expect(screen.queryByText(/Nessuna commessa sotto soglia/)).toBeNull();
    stato.errore = null;
  });

  it("senza permesso sui mezzi non mostra un costo zero", async () => {
    stato.tabelle.v_ordine_costi_mezzi_stimati = [{ order_id: "SANA", costo_mezzi_stimato: 0, mezzi_usati: 0, giorni_mezzo: 0, mezzi_senza_costo: 0, dati_mezzi_visibili: false }];
    apri();
    await waitFor(() => expect(screen.getByText("non visibili con i tuoi permessi")).toBeTruthy());
  });

  it("il dettaglio spiega tutto il consuntivo, manodopera compresa", async () => {
    apri();
    await waitFor(() => expect(codici()).toHaveLength(6));
    fireEvent.click(within(tabella()).getByText("#SANA"));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Manodopera e ditte esterne")).toBeTruthy();
    expect(within(dialogo).getByText("Acquisti impegnati (ODA)")).toBeTruthy();
  });

  it("il dettaglio di una commessa senza costi non mostra un falso margine del 100%", async () => {
    apri();
    await waitFor(() => expect(codici()).toHaveLength(6));
    fireEvent.click(within(tabella()).getByText("#SENZACOSTI"));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getAllByText("Nessun costo registrato").length).toBeGreaterThan(0);
    expect(within(dialogo).queryByText("100.0%")).toBeNull();
    expect(within(dialogo).queryByText("Margine lordo")).toBeNull();
  });
});


describe("Audit pulsanti e stati limite marginalità", () => {
  it("trova un codice incollato con spazi e cancelletto", async () => {
    apri(); await waitFor(() => expect(codici()).toHaveLength(6));
    fireEvent.change(screen.getByPlaceholderText("Cerca ordine, cliente..."), {target:{value:"  #SANA  "}});
    expect(codici()).toEqual(["SANA"]);
    fireEvent.click(screen.getByRole("button",{name:"Azzera filtri"}));
    expect(codici()).toHaveLength(6);
  });
  it("nessun risultato non viene descritto come sopra target", async () => {
    apri(); await waitFor(() => expect(codici()).toHaveLength(6));
    fireEvent.change(screen.getByPlaceholderText("Cerca ordine, cliente..."), {target:{value:"INESISTENTE"}});
    expect(screen.queryByText(/sono sopra il target/)).toBeNull();
    expect(screen.queryByText(/Nessuna commessa sotto soglia/)).toBeNull();
    expect(screen.getByRole("button",{name:"Esporta vista CSV"}).hasAttribute("disabled")).toBe(true);
  });
  it("gli scenari sono locali e si possono ripristinare ai valori aziendali", async () => {
    stato.impostazioni={overhead_percentuale:8,margine_target_default:30};
    apri(); const target=screen.getByLabelText("Target dopo struttura %");
    await waitFor(()=>expect((target as HTMLInputElement).value).toBe("30"));
    fireEvent.change(target,{target:{value:"15"}});
    expect(screen.getByText(/Simulazione locale/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Ripristina valori aziendali"}));
    expect((target as HTMLInputElement).value).toBe("30");
  });
  it("Aggiorna rilegge anche impostazioni e sedi", async () => {
    apri(); await waitFor(() => expect(codici()).toHaveLength(6));
    const prima=stato.chiamate.filter(c=>c.tabella==="preventivo_impostazioni" && c.metodo==="select").length;
    fireEvent.click(screen.getByRole("button",{name:"Aggiorna dati"}));
    await waitFor(()=>expect(stato.refetchSedi).toHaveBeenCalledOnce());
    expect(stato.refetchStruttura).toHaveBeenCalledOnce();
    expect(stato.refetchCdg).toHaveBeenCalledOnce();
    expect(stato.chiamate.filter(c=>c.tabella==="preventivo_impostazioni" && c.metodo==="select").length).toBeGreaterThan(prima);
  });
  it("ordinamento e filtri espongono la selezione alla tastiera", async () => {
    apri(); await waitFor(() => expect(codici()).toHaveLength(6));
    fireEvent.click(screen.getByRole("button",{name:"Preventivo"}));
    expect(screen.getByRole("columnheader",{name:"Preventivo"}).getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(screen.getByRole("button",{name:"Preventivo"}));
    expect(screen.getByRole("columnheader",{name:"Preventivo"}).getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(screen.getByRole("button",{name:"Sani"}));
    expect(screen.getByRole("button",{name:"Sani"}).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button",{name:"Dettaglio margine SANA"})).toBeTruthy();
  });
  it("il dettaglio mantiene la perdita e un'anomalia non caricata non diventa assente", async () => {
    stato.errori.order_errors={message:"Rete assente"};
    apri(); await waitFor(() => expect(codici()).toHaveLength(6));
    fireEvent.click(screen.getByRole("button",{name:"Dettaglio margine PERDITA"}));
    const d=await screen.findByRole("dialog");
    expect(within(d).getByText("Perdita diretta")).toBeTruthy();
    expect(within(d).queryByText("Margine lordo")).toBeNull();
    expect(await within(d).findByText("Impossibile caricare le anomalie.")).toBeTruthy();
    expect(within(d).getByRole("button",{name:"Riprova anomalie"})).toBeTruthy();
    expect(within(d).queryByText("Nessuna anomalia aperta su questa commessa.")).toBeNull();
  });
  it("il dettaglio non inventa un margine per le voci senza costo", async () => {
    stato.tabelle.order_items=[{id:"item",name:"Materiale nuovo",quantity:2,unit_price:100,purchase_price:null,standard_cost:null,position:1}];
    apri(); await waitFor(() => expect(codici()).toHaveLength(6));
    fireEvent.click(screen.getByRole("button",{name:"Dettaglio margine SANA"}));
    const d=await screen.findByRole("dialog");
    expect(await within(d).findByText("Da completare")).toBeTruthy();
    expect(within(d).queryByText("100.0%")).toBeNull();
  });
});


it("nel dettaglio riporta la stessa quota e il target della vista", async () => {
  stato.impostazioni={overhead_percentuale:8,margine_target_default:30};
  apri(); await waitFor(() => expect(codici()).toHaveLength(6));
  fireEvent.click(screen.getByRole("button",{name:"Dettaglio margine SANA"}));
  const d=await screen.findByRole("dialog");
  const net=within(d).getByRole("region",{name:"Margine dopo struttura"});
  expect(net.textContent).toContain("420,00");
  expect(net.textContent).toContain("42.0%");
  expect(net.textContent).toContain("30.0%");
});


it("le simulazioni non si trasferiscono passando a un'altra azienda", async()=>{
  stato.impostazioni={overhead_percentuale:8,margine_target_default:30};
  const view=apri();await waitFor(()=>expect(codici()).toHaveLength(6));
  fireEvent.change(screen.getByLabelText("Target dopo struttura %"),{target:{value:"15"}});
  fireEvent.change(screen.getByPlaceholderText("Cerca ordine, cliente..."),{target:{value:"SANA"}});
  stato.companyId="seconda-azienda";
  stato.impostazioni={overhead_percentuale:4,margine_target_default:22};
  view.rerender(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><TooltipProvider><MarginalitaCantieri/></TooltipProvider></MemoryRouter></QueryClientProvider>);
  await waitFor(()=>expect((screen.getByLabelText("Target dopo struttura %") as HTMLInputElement).value).toBe("22"));
  expect((screen.getByPlaceholderText("Cerca ordine, cliente...") as HTMLInputElement).value).toBe("");
  expect(screen.queryByText(/Simulazione locale/)).toBeNull();
});

it("gli errori di struttura e impostazioni rimangono visibili", async()=>{
  stato.structureError={message:"Rete assente"};stato.errori.preventivo_impostazioni={message:"Rete assente"};
  apri();await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("Impostazioni di margine non caricate"));
  expect(screen.getByRole("alert").textContent).toContain("Struttura aziendale non caricata");
});

it("i mezzi oltre la prima pagina sono inclusi nel riepilogo",async()=>{
  stato.tabelle.v_ordine_costi_mezzi_stimati=[...Array.from({length:1000},(_,i)=>({order_id:`altra-${i}`,costo_mezzi_stimato:1,mezzi_usati:1,dati_mezzi_visibili:true})),{order_id:"SANA",costo_mezzi_stimato:123.45,mezzi_usati:2,dati_mezzi_visibili:true}];
  apri();await waitFor(()=>expect(screen.getByText(/123,45/)).toBeTruthy());
  expect(stato.chiamate.some(c=>c.tabella==="v_ordine_costi_mezzi_stimati"&&c.metodo==="range"&&c.args[0]===1000)).toBe(true);
});
it("completa il cliente anche quando la sua anagrafica è oltre mille commesse",async()=>{
  stato.tabelle.orders=[...Array.from({length:1000},(_,i)=>({id:`altra-${i}`,client_name:"Altro cliente"})),{id:"SENZACOSTI",client_company:"Cliente oltre pagina",client_name:null}];
  apri();await waitFor(()=>expect(within(tabella()).getByText("Cliente oltre pagina")).toBeTruthy());
});


describe("Altre simulazioni per aziende con impostazioni diverse",()=>{
 it("le commesse da monitorare compaiono anche tra le azioni da controllare",async()=>{
  apri();await waitFor(()=>expect(codici()).toHaveLength(6));
  fireEvent.click(screen.getByRole("button",{name:"Da monitorare"}));
  expect(codici()).toEqual(["MEDIA"]);
  expect(screen.getByText(/1 commessa richiede attenzione/)).toBeTruthy();
  expect(screen.queryByText(/Le commesse filtrate sono sopra/)).toBeNull();
  expect(screen.getByRole("button",{name:/#MEDIA · Cliente Margine/})).toBeTruthy();
 });
 it("un prelievo senza costo non viene classificato come sano",async()=>{
  stato.tabelle.v_ordine_marginalita=[riga("PARZIALE",{consuntivo:100,margine:900,margine_perc:90,movimenti_magazzino_senza_costo:2})];
  apri();await waitFor(()=>expect(codici()).toHaveLength(1));
  expect(within(tabella()).getByText("Dati incompleti")).toBeTruthy();
  expect(within(tabella()).queryByText("Sano")).toBeNull();
  expect(screen.getAllByText(/2 prelievi di magazzino senza costo/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button",{name:"Dettaglio margine PARZIALE"}));
  const dialog=await screen.findByRole("dialog");
  expect(within(dialog).getByText("Costi di magazzino da completare")).toBeTruthy();
  expect(within(dialog).queryByText("90.0%")).toBeNull();
 });
 it("suggerisce una causa aperta e non una anomalia già risolta",async()=>{
  stato.tabelle.v_ordine_marginalita=[riga("PERDITA",{consuntivo:1100,margine:-100,margine_perc:-10})];
  stato.tabelle.order_errors=[{id:"risolta",order_id:"PERDITA",amount:9000,detailed_cause:"Problema risolto",review_status:"risolta"},{id:"aperta",order_id:"PERDITA",amount:10,detailed_cause:"Consegna da verificare",review_status:"aperta"}];
  apri();await waitFor(()=>expect(screen.getAllByText(/Prima causa da chiudere: Consegna da verificare/).length).toBeGreaterThan(0));
  expect(screen.queryByText(/Prima causa da chiudere: Problema risolto/)).toBeNull();
 });
 it("il tipo sede applica il filtro e i comandi restano anche senza risultati",async()=>{
  stato.sedi=[{sede_id:"S1",nome:"Milano",tipo:"ufficio"},{sede_id:"S2",nome:"Torino",tipo:"magazzino"}];
  stato.tabelle.orders=[{id:"SANA",sede_id:"S1"},{id:"PERDITA",sede_id:"S2"}];
  stato.tipoSede="showroom";
  apri();await waitFor(()=>expect(screen.getByText(/Nessuna sede con commesse calcolabili/)).toBeTruthy());
  expect(screen.getByRole("group",{name:"Filtri sedi"})).toBeTruthy();
  expect(screen.queryByText(/Milano: /)).toBeNull();
  expect(screen.queryByText(/Torino: /)).toBeNull();
 });
 it("sceglie soltanto le sedi del tipo richiesto",async()=>{
  stato.sedi=[{sede_id:"S1",nome:"Milano",tipo:"ufficio"},{sede_id:"S2",nome:"Torino",tipo:"magazzino"}];
  stato.tabelle.orders=[{id:"SANA",sede_id:"S1"},{id:"PERDITA",sede_id:"S2"}];
  stato.tipoSede="magazzino";apri();
  expect(await screen.findByText("Torino: -10.0%")).toBeTruthy();
  expect(screen.queryByText(/Milano: /)).toBeNull();
 });
});

it("i pulsanti informativi funzionano con un clic anche senza hover",async()=>{
 apri();await waitFor(()=>expect(codici()).toHaveLength(6));
 fireEvent.click(screen.getByRole("button",{name:"Informazioni sul target di margine"}));
 expect(await screen.findByRole("dialog")).toBeTruthy();
 expect(screen.getByText(/Soglia minima dopo l'incidenza stimata/)).toBeTruthy();
});

describe("Pulsanti Riprova con errori simulati",()=>{
 it.each([0,1])("Riprova ripristina i dati nella vista %s",async(index)=>{
  stato.errore={message:"Connessione assente"};apri();
  const buttons=await screen.findAllByRole("button",{name:"Riprova"});
  stato.errore=null;fireEvent.click(buttons[index]);
  await waitFor(()=>expect(codici()).toHaveLength(6));
  expect(screen.queryByText(/Dati non caricati: premi Aggiorna dati/)).toBeNull();
 });
 it("Riprova ricarica le voci nel dettaglio senza perdere la commessa",async()=>{
  stato.errori.order_items={message:"Connessione assente"};apri();await waitFor(()=>expect(codici()).toHaveLength(6));
  fireEvent.click(screen.getByRole("button",{name:"Dettaglio margine SANA"}));
  const d=await screen.findByRole("dialog");await within(d).findByText("Impossibile caricare le voci d'ordine.");
  delete stato.errori.order_items;stato.tabelle.order_items=[{id:"x",name:"Materiale dopo ripristino",quantity:1,unit_price:100,purchase_price:50,standard_cost:null}];
  fireEvent.click(within(d).getByRole("button",{name:"Riprova"}));
  expect(await within(d).findByText("Materiale dopo ripristino")).toBeTruthy();
  expect(within(d).getByRole("link",{name:"#SANA"})).toBeTruthy();
 });
 it("Riprova anomalie ripristina importi e causa senza chiudere il dettaglio",async()=>{
  stato.errori.order_errors={message:"Connessione assente"};apri();await waitFor(()=>expect(codici()).toHaveLength(6));
  fireEvent.click(screen.getByRole("button",{name:"Dettaglio margine SANA"}));
  const d=await screen.findByRole("dialog");const retry=await within(d).findByRole("button",{name:"Riprova anomalie"});
  delete stato.errori.order_errors;stato.tabelle.order_errors=[{id:"x",order_id:"SANA",amount:50,detailed_cause:"Consegna ripristinata",review_status:"aperta"}];
  fireEvent.click(retry);expect(await within(d).findByText("Consegna ripristinata")).toBeTruthy();
  expect(within(d).queryByText("Impossibile caricare le anomalie.")).toBeNull();
 });
});

describe("Coerenza per aziende con target e struttura differenti",()=>{
 it.each([
  {azienda:"target-zero",target:0,struttura:0,margine:50,stato:"Da monitorare",filtro:"Da monitorare"},
  {azienda:"target-otto",target:8,struttura:0,margine:70,stato:"Sotto target",filtro:"Sotto target"},
  {azienda:"target-dieci",target:10,struttura:0,margine:100,stato:"Da monitorare",filtro:"Da monitorare"},
  {azienda:"target-venticinque",target:25,struttura:0,margine:250,stato:"Sano",filtro:"Sani"},
  {azienda:"target-trenta",target:30,struttura:0,margine:280,stato:"Sotto target",filtro:"Sotto target"},
  {azienda:"target-cento",target:100,struttura:0,margine:990,stato:"Sotto target",filtro:"Sotto target"},
  {azienda:"struttura-alta",target:10,struttura:100,margine:500,stato:"In perdita",filtro:"In perdita"},
 ])("$azienda: badge, filtro e target leggono le impostazioni della stessa azienda",async(caso)=>{
  stato.companyId=caso.azienda;stato.impostazioni={overhead_percentuale:caso.struttura,margine_target_default:caso.target};
  stato.tabelle.v_ordine_marginalita=[riga("VERIFICA",{company_id:caso.azienda,consuntivo:1000-caso.margine,margine:caso.margine,margine_perc:caso.margine/10})];
  apri();await waitFor(()=>expect(codici()).toHaveLength(1));
  await waitFor(()=>expect((screen.getByLabelText("Target dopo struttura %") as HTMLInputElement).value).toBe(String(caso.target)));
  expect(within(tabella()).getAllByText(caso.stato).length).toBeGreaterThan(0);
  fireEvent.click(within(screen.getByRole("group",{name:"Stato del margine"})).getByRole("button",{name:caso.filtro}));
  expect(codici()).toEqual(["VERIFICA"]);
  expect(stato.chiamate.filter(c=>c.tabella==="v_ordine_marginalita"&&c.metodo==="eq"&&c.args[0]==="company_id").every(c=>c.args[1]===caso.azienda)).toBe(true);
 });
});
