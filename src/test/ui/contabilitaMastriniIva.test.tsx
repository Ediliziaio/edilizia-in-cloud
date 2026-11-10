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
        },
        error: null as { message: string } | null,
      };
    },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-finta" } }) }));
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
  apri("iva");
  expect(await screen.findByText("gennaio 2026")).toBeTruthy();
  expect(screen.getByText("dicembre 2026")).toBeTruthy();
  await waitFor(() => expect(state.rpc.filter((c) => c.fn === "contabilita_liquida_iva")).toHaveLength(12));
  expect(state.rpc.every((c) => c.args.p_anteprima === true)).toBe(true);
  const registra = screen.getAllByRole("button", { name: "Registra" });
  expect(registra).toHaveLength(2);
  expect((registra[0] as HTMLButtonElement).disabled).toBe(false);
  expect((registra[1] as HTMLButtonElement).disabled).toBe(true);
});

it("liquidazione IVA: un periodo registrato lo dice e sblocca il successivo", async () => {
  state.liquidati.add("2026-01-01");
  apri("iva");
  expect(await screen.findByText("registrata")).toBeTruthy();
  const registra = screen.getAllByRole("button", { name: "Registra" });
  expect(registra).toHaveLength(1);
  expect((registra[0] as HTMLButtonElement).disabled).toBe(false);
});
