/**
 * Contabilità generale per lo studio (11/11/2026): il bilancio diviso in stato patrimoniale e conto
 * economico, e le scritture filtrate per origine (fatture ricevute, emesse, incassi).
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
  { id: "materie", codice: "30.01", descrizione: "Acquisti di materie prime", natura: "costo", sezione_cee: "CE", voce_cee: "B.6", mastro_id: null as string | null, movimentabile: true, attivo: true, codice_standard: "30.01" },
  { id: "fornitori", codice: "13.01", descrizione: "Debiti verso fornitori", natura: "passivo", sezione_cee: "SPP", voce_cee: "D.7", mastro_id: null as string | null, movimentabile: true, attivo: true, codice_standard: "13.01" },
  { id: "banca", codice: "06.01", descrizione: "Banca", natura: "attivo", sezione_cee: "SPA", voce_cee: "C.IV.1", mastro_id: null as string | null, movimentabile: true, attivo: true, codice_standard: "06.01" },
];

const scrittura = (numero: number, data: string, origine: string, causale: string, righe: Array<[string, number, number, string | null]>) => ({
  id: `s${numero}`, esercizio: 2026, numero, data_registrazione: data, causale, descrizione: null as string | null,
  documento_numero: `F${numero}`, documento_data: data, origine, storno_di: null as string | null,
  contabilita_righe: righe.map(([conto_id, dare, avere, descrizione], i) => ({ riga: i + 1, conto_id, dare, avere, descrizione })),
});

const scritture = [
  scrittura(1, "2026-01-05", "fattura_emessa", "Fattura emessa F1", [["clienti", 122, 0, null], ["ricavi", 0, 100, null], ["iva", 0, 22, null]]),
  scrittura(2, "2026-02-10", "incasso", "Incasso F1", [["banca", 122, 0, null], ["clienti", 0, 122, null]]),
  scrittura(3, "2026-02-20", "fattura_ricevuta", "Fattura ricevuta A7", [["materie", 40, 0, null], ["fornitori", 0, 40, null]]),
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

afterEach(cleanup);

it("il bilancio si legge diviso: stato patrimoniale e conto economico, con l'utile", async () => {
  apri("bilancio");
  const sp = await screen.findByRole("region", { name: "Stato patrimoniale" });
  const ce = screen.getByRole("region", { name: "Conto economico" });
  // Attivo: banca 122 · Passivo: IVA 22 + fornitori 40 = 62, più l'utile 60
  expect(sp.textContent).toMatch(/Attivo122,00/);
  expect(sp.textContent).toMatch(/Passivo e netto122,00/);
  expect(sp.textContent).toContain("Utile dell'esercizio");
  expect(ce.textContent).toMatch(/Costi100,00/);
  expect(ce.textContent).toMatch(/Ricavi100,00/);
  fireEvent.click(screen.getByRole("button", { name: "Bilancio di verifica" }));
  expect(await screen.findByText("Dare")).toBeTruthy();
});

it("le scritture si filtrano per origine: fatture ricevute, emesse, incassi", async () => {
  apri("scritture");
  const gruppo = await screen.findByRole("group", { name: "Da dove vengono le scritture" });
  expect(gruppo.textContent).toContain("Tutte 3");
  fireEvent.click(screen.getByRole("button", { name: /Fatture ricevute \(costi\)/ }));
  await waitFor(() => expect(screen.queryByText("Fattura emessa F1")).toBeNull());
  expect(screen.getByText("Fattura ricevuta A7")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Fatture emesse \(ricavi\)/ }));
  expect(await screen.findByText("Fattura emessa F1")).toBeTruthy();
  expect(screen.queryByText("Incasso F1")).toBeNull();
});
