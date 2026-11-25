/**
 * Contabilità generale: le viste «Mastrini e partitari» e «Liquidazione IVA» si aprono
 * con dati finti, mostrano le partite per soggetto, il mastrino di uno e i periodi IVA.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  liquidati: new Set<string>(),
  // Da dove vengono gli importi di ciascun periodo (per data d'inizio): LIPE confermata se non indicato.
  fonte: {} as Record<string, "lipe" | "scritture">,
  registrata: {} as Record<string, { vendite: number; acquisti: number }>,
}));

const conti = [
  { id: "clienti", codice: "05.01", descrizione: "Crediti verso clienti", natura: "attivo", sezione_cee: "SPA", voce_cee: "C.II.1", mastro_id: null as string | null, movimentabile: true, attivo: true, codice_standard: "05.01" },
  { id: "ricavi", codice: "20.01", descrizione: "Ricavi delle prestazioni", natura: "ricavo", sezione_cee: "CE", voce_cee: "A.1", mastro_id: null as string | null, movimentabile: true, attivo: true, codice_standard: "20.01" },
  { id: "iva", codice: "13.10", descrizione: "IVA su vendite", natura: "passivo", sezione_cee: "SPP", voce_cee: "D.12", mastro_id: null as string | null, movimentabile: true, attivo: true, codice_standard: "13.10" },
  { id: "banca", codice: "06.01", descrizione: "Banca", natura: "attivo", sezione_cee: "SPA", voce_cee: "C.IV.1", mastro_id: null as string | null, movimentabile: true, attivo: true, codice_standard: "06.01" },
];

const scrittura = (numero: number, data: string, righe: Array<[string, number, number, string | null]>) => ({
  id: `s${numero}`, esercizio: 2026, numero, data_registrazione: data, causale: "Fattura emessa", descrizione: null as string | null,
  documento_numero: `F${numero}`, documento_data: data, origine: "fattura_emessa", storno_di: null as string | null,
  contabilita_righe: righe.map(([conto_id, dare, avere, descrizione], i) => ({ riga: i + 1, conto_id, dare, avere, descrizione })),
});

const scritture = [
  scrittura(1, "2026-01-05", [["clienti", 122, 0, "Cliente Alfa Srl"], ["ricavi", 0, 100, null], ["iva", 0, 22, null]]),
  scrittura(2, "2026-02-10", [["banca", 100, 0, null], ["clienti", 0, 100, "Pagamento Cliente Alfa Srl"]]),
  scrittura(3, "2026-02-20", [["clienti", 61, 0, "Cliente Beta Spa"], ["ricavi", 0, 50, null], ["iva", 0, 11, null]]),
];

function builder(table: string) {
  const dati = table === "contabilita_conti" ? conti : table === "contabilita_scritture" ? scritture : [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "range", "limit", "in", "is", "maybeSingle", "single"]) b[m] = () => b;
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: dati, error: null }).then(ok);
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => builder(t),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpc.push({ fn, args });
      if (fn !== "contabilita_liquida_iva") return { data: null, error: null };
      const gennaio = args.p_dal === "2026-01-01";
      const febbraio = args.p_dal === "2026-02-01";
      return {
        data: {
          iva_vendite: gennaio ? 22 : febbraio ? 11 : 0, iva_acquisti: 0, saldo: gennaio ? 22 : febbraio ? 11 : 0,
          credito_precedente: 0, compensato: 0, da_versare: gennaio ? 22 : febbraio ? 11 : 0, a_credito: 0,
          gia_liquidato: state.liquidati.has(String(args.p_dal)),
          fonte: state.fonte[String(args.p_dal)] ?? "lipe",
          registrata_iva_vendite: state.registrata[String(args.p_dal)]?.vendite ?? null,
          registrata_iva_acquisti: state.registrata[String(args.p_dal)]?.acquisti ?? null,
        },
        error: null as { message: string } | null,
      };
    },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-finta" } }) }));
const accesso = vi.hoisted(() => ({ fatturazione: true }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isLoading: false, canViewBilling: accesso.fatturazione }) }));
vi.mock("@/hooks/useFeatureAccess", () => ({ useFeatureAccess: () => ({ isLoading: false, isEnabled: true, isPreview: false }) }));
// Registro IVA e liquidazione periodica sono quelli di Fatture → Fiscalità, provati nei loro test: qui conta che ci siano.
vi.mock("@/pages/azienda/fatturazione/RegistroIVA", () => ({
  default: (p: { onApriLiquidazione?: () => void }) => <button type="button" onClick={p.onApriLiquidazione}>REGISTRO IVA DI FISCALITÀ</button>,
}));
vi.mock("@/pages/azienda/ContabilitaFiscale", () => ({
  LiquidazioneIvaEF24: (p: { chiaveVista?: string }) => <div>LIQUIDAZIONE E F24 DI FISCALITÀ ({p.chiaveVista})</div>,
}));
const controllo = vi.hoisted(() => ({ stato: undefined as undefined | import("@/hooks/useControlloIva").StatoControlloIva }));
const rilegge = vi.hoisted(() => ({ volte: 0, fn: () => { rilegge.volte += 1; return Promise.resolve(); } }));
vi.mock("@/hooks/useControlloIva", () => ({ useControlloIva: () => ({ data: controllo.stato, refetch: rilegge.fn }) }));
const csv = vi.hoisted(() => ({ file: [] as Array<{ nome: string; contenuto: string }> }));
vi.mock("@/lib/csv", () => ({ scaricaCsv: (nome: string, contenuto: string) => { csv.file.push({ nome, contenuto }); } }));
vi.mock("@/hooks/useAnagraficaAzienda", () => ({ useAnagraficaAzienda: () => ({ data: { ragione_sociale: "Prova srl" } }) }));

import ContabilitaGenerale from "@/components/contabilita/ContabilitaGenerale";

function apri(vista: string) {
  return render(
    <MemoryRouter initialEntries={[`/?anno=2026&vista=${vista}`]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ContabilitaGenerale />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.fonte = {};
  state.registrata = {};
  controllo.stato = undefined;
  accesso.fatturazione = true;
  state.rpc = [];
  state.liquidati = new Set();
});
afterEach(cleanup);

it("mastrini: il conto clienti si apre a partite, un soggetto apre il suo mastrino", async () => {
  apri("mastrini");
  expect(await screen.findByText("CLIENTE ALFA SRL")).toBeTruthy();
  expect(screen.getByText("CLIENTE BETA SPA")).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "Cliente" })).toBeTruthy();

  fireEvent.click(screen.getByText("CLIENTE ALFA SRL"));
  expect(await screen.findByText(/2 movimenti/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /Stampa scheda/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Tutti i soggetti/ })).toBeTruthy();
});

it("liquidazione IVA: dodici mesi, il primo da registrare e i successivi in attesa", async () => {
  apri("iva&iva=contabile");
  expect(await screen.findByText("gennaio 2026")).toBeTruthy();
  expect(screen.getByText("dicembre 2026")).toBeTruthy();
  await waitFor(() => expect(state.rpc.filter((c) => c.fn === "contabilita_liquida_iva")).toHaveLength(12));
  // La vista IVA chiede anche il piano (per i registri): qui contano le liquidazioni.
  expect(state.rpc.filter((c) => c.fn === "contabilita_liquida_iva").every((c) => c.args.p_anteprima === true)).toBe(true);
  const registra = screen.getAllByRole("button", { name: "Registra" });
  expect(registra).toHaveLength(2);
  expect((registra[0] as HTMLButtonElement).disabled).toBe(false);
  expect((registra[1] as HTMLButtonElement).disabled).toBe(true);
});

it("liquidazione IVA: un periodo registrato lo dice e sblocca il successivo", async () => {
  state.liquidati.add("2026-01-01");
  apri("iva&iva=contabile");
  expect(await screen.findByText("registrata")).toBeTruthy();
  const registra = screen.getAllByRole("button", { name: "Registra" });
  expect(registra).toHaveLength(1);
  expect((registra[0] as HTMLButtonElement).disabled).toBe(false);
});

it("liquidazione IVA in contabilità: si stampa e si scarica (23/11/2026)", async () => {
  csv.file = [];
  apri("iva&iva=contabile");
  expect(await screen.findByText("gennaio 2026")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Esporta/ }));
  expect(csv.file).toHaveLength(1);
  expect(csv.file[0].nome).toBe("liquidazioni-iva-2026-mensili");
  expect(csv.file[0].contenuto.split("\r\n")).toHaveLength(13);
  expect(screen.getByRole("button", { name: /Stampa liquidazioni/ })).toBeTruthy();
});

it("vista IVA: si apre sui registri IVA, che portano alla liquidazione periodica con LIPE e F24", async () => {
  apri("iva");
  fireEvent.click(await screen.findByRole("button", { name: "REGISTRO IVA DI FISCALITÀ" }));
  expect(await screen.findByText("LIQUIDAZIONE E F24 DI FISCALITÀ (iva_vista)")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Liquidazione periodica, LIPE e F24", pressed: true })).toBeTruthy();
});

it("vista IVA: senza il permesso sulla fatturazione i registri lo dicono", async () => {
  accesso.fatturazione = false;
  apri("iva");
  expect(await screen.findByText(/servono il permesso di vedere la fatturazione/)).toBeTruthy();
  expect(screen.queryByText("REGISTRO IVA DI FISCALITÀ")).toBeNull();
});

it("scritture: «Stampa registri IVA» porta ai registri", async () => {
  apri("scritture");
  fireEvent.click(await screen.findByRole("button", { name: /Stampa registri IVA/ }));
  expect(await screen.findByText("REGISTRO IVA DI FISCALITÀ")).toBeTruthy();
});

it("vista IVA: il percorso guidato dice il passo da fare e porta dove si fa (23/11/2026)", async () => {
  controllo.stato = {
    impostazioniCompilate: false, periodicita: null, acquistiSenzaRicezione: 732, lipe: [], lipeRegistrate: 0, f24Iva: { daPagare: 0, pagati: 0 },
    senzaImporti: [{ data: "2026-01-10", lato: "emesse" }, { data: "2026-07-03", lato: "ricevute" }],
  };
  apri("iva&iva=contabile");
  expect(await screen.findByRole("region", { name: "Percorso IVA 2026" })).toBeTruthy();
  expect(screen.getByText("Da fare adesso: Impostazioni IVA 2026")).toBeTruthy();
  // Chiuso è una riga sola col passo da fare; i sei passi si aprono a richiesta (24/11/2026).
  expect(screen.queryByText(/732 fatture ricevute sono senza data di ricezione SDI/)).toBeNull();
  fireEvent.click(screen.getByText("Mostra i passi"));
  expect(screen.getByText(/732 fatture ricevute sono senza data di ricezione SDI/)).toBeTruthy();
  expect(screen.getByText(/1 emessa e 1 ricevuta col solo totale \(gennaio, luglio\)/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Compila" }));
  expect(await screen.findByText("LIQUIDAZIONE E F24 DI FISCALITÀ (iva_vista)")).toBeTruthy();
  // Cambiando scheda il percorso si rilegge (una LIPE confermata o un giroconto ne cambiano lo stato).
  expect(rilegge.volte).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Registro acquisti" }));
  expect(await screen.findByText("REGISTRO IVA DI FISCALITÀ")).toBeTruthy();
});

it("un solo calcolo: senza LIPE confermata il periodo è un'anteprima e porta a confermarla", async () => {
  state.fonte["2026-01-01"] = "scritture";
  controllo.stato = { impostazioniCompilate: true, periodicita: "mensile", acquistiSenzaRicezione: 0, senzaImporti: [{ data: "2026-01-10", lato: "ricevute" }], lipe: [], lipeRegistrate: 0, f24Iva: null };
  apri("iva&iva=contabile");
  expect(await screen.findByText("anteprima dalle scritture")).toBeTruthy();
  expect(screen.getByText("1 ricevuta senza importi: importi parziali nelle scritture")).toBeTruthy();
  expect(screen.getByText(/Periodicità/).textContent).toContain("mensile");
  // Gennaio non si registra: c'è «Conferma la LIPE», e febbraio (dalla LIPE) aspetta gennaio.
  expect(screen.getAllByRole("button", { name: "Registra" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Conferma la LIPE" }));
  expect(await screen.findByText("LIQUIDAZIONE E F24 DI FISCALITÀ (iva_vista)")).toBeTruthy();
});

it("un solo calcolo: un periodo registrato con importi diversi dalla LIPE lo dice", async () => {
  state.liquidati.add("2026-01-01");
  state.registrata["2026-01-01"] = { vendite: 30, acquisti: 0 };
  apri("iva&iva=contabile");
  expect(await screen.findByText(/Registrata con importi diversi dalla LIPE/)).toBeTruthy();
  // A video gli importi della scrittura registrata, non i saldi a zero.
  expect(screen.getAllByText("30,00 €").length).toBeGreaterThan(0);
});
