import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";

const stato = vi.hoisted(() => ({
  tabelle: {} as Record<string, Record<string, unknown>[]>,
  chiamate: [] as { tabella: string; metodo: string; args: unknown[] }[],
  impostazioni: null as unknown,
  sedi: [] as unknown[],
  cdg: [] as unknown[],
  errore: null as unknown,
}));

vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda" }));
vi.mock("@/lib/orders/archivedOrderScope", () => ({
  loadArchivedOrderIds: async (): Promise<string[]> => [],
  excludeArchivedOrders: <T,>(q: T) => q,
}));
vi.mock("@/hooks/controlloGestione/useCompanyStructure", () => ({
  useCompanyStructure: () => ({ data: null as unknown, refetch: vi.fn() }),
}));
vi.mock("@/hooks/controlloGestione/useMarginalitaCommesse", () => ({
  useMarginalitaCommesse: () => ({ data: { righe: stato.cdg }, refetch: vi.fn() }),
}));
vi.mock("@/hooks/useSediAnalytics", () => ({ useSediAnalytics: () => ({ data: { sedi: stato.sedi }, isLoading: false }) }));
vi.mock("@/store/sedeFilterStore", () => ({ useSedeFilter: () => ({ sediSelezionate: [] as string[], periodo: { da: "", a: "" } }) }));
vi.mock("@/components/sedi/SedeFilterBar", () => ({ SedeFilterBar: (): null => null }));
vi.mock("@/components/sedi/SedeMargineCard", () => ({
  SedeMargineCard: ({ sede }: { sede: { nome: string; margine_pct: number } }) => <div>{`${sede.nome}: ${sede.margine_pct.toFixed(1)}%`}</div>,
}));
vi.mock("@/integrations/supabase/client", () => {
  const costruttore = (tabella: string) => {
    const righe = () => stato.tabelle[tabella] ?? [];
    const b: Record<string, unknown> = {};
    for (const metodo of ["select", "eq", "is", "order", "limit", "range", "in", "or", "not"]) {
      b[metodo] = (...args: unknown[]) => { stato.chiamate.push({ tabella, metodo, args }); return b; };
    }
    b.maybeSingle = async () => ({ data: stato.impostazioni, error: null as unknown });
    b.then = (ok: (r: unknown) => unknown) => ok(tabella === "v_ordine_marginalita" && stato.errore
      ? { data: null, error: stato.errore, count: null }
      : { data: righe(), error: null, count: righe().length });
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
  stato.chiamate = [];
  stato.impostazioni = null;
  stato.sedi = [];
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
    expect(stato.chiamate.some((c) => c.tabella === "orders" && c.metodo === "range")).toBe(false);
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
