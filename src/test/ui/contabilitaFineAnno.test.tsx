/**
 * Contabilità generale: la vista «Fine anno e chiusura» si apre con dati finti, mostra
 * ammortamenti e TFR dall'anteprima, l'utile della chiusura, e chiude solo dopo la conferma.
 * Con l'esercizio chiuso dice che è bloccato e chiede il motivo per riaprirlo.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  esercizio: null as null | { anno: number; chiuso_il: string | null; stampato_fino_al: string | null; stampe: unknown[] },
}));

const conti = [
  { id: "banca", codice: "06.01", descrizione: "Banca", natura: "attivo", sezione_cee: "SPA", voce_cee: "C.IV.1", mastro_id: null as string | null, movimentabile: true, attivo: true, codice_standard: "06.01" },
  { id: "ricavi", codice: "20.01", descrizione: "Ricavi delle prestazioni", natura: "ricavo", sezione_cee: "CE", voce_cee: "A.1", mastro_id: null as string | null, movimentabile: true, attivo: true, codice_standard: "20.01" },
];

function builder(table: string) {
  let singola = false;
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "range", "limit", "in", "is", "single", "not", "gte", "lte"]) b[m] = () => b;
  b.maybeSingle = () => { singola = true; return b; };
  b.then = (ok: (v: unknown) => unknown) => {
    const dati = table === "contabilita_conti" ? conti
      : table === "contabilita_esercizi" ? (singola ? state.esercizio : state.esercizio ? [state.esercizio] : [])
      : [];
    return Promise.resolve({ data: dati, error: null }).then(ok);
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => builder(t),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpc.push({ fn, args });
      if (fn === "contabilita_fine_anno") {
        return {
          data: {
            totale_ammortamenti: 2000, retribuzioni: 27000, tfr: 2000, ammortamenti_registrati: false, tfr_registrato: false, registrate: [] as string[],
          },
          error: null as { message: string } | null,
        };
      }
      // Il registro dei cespiti ha la sua anteprima (RegistroCespiti).
      if (fn === "contabilita_ammortamenti") {
        return {
          data: {
            quote: [{ id: "c1", cespite: "Escavatore finto", codice: "C01", categoria: "materiale", costo: 10000, aliquota: 20,
              fondo_inizio: 1000, fondo_stimato: true, quota: 2000, residuo: 7000, conto_bene: null as string | null, conto_fondo: null as string | null, conto_ammortamento: null as string | null }],
            totale: 2000, registrati: false, da_aggiornare: false, conti_mancanti: [] as string[],
          },
          error: null as { message: string } | null,
        };
      }
      if (fn === "contabilita_chiudi_esercizio") {
        return { data: { utile: 1234.5, conti_economici: 7, conti_patrimoniali: 9, apertura_gia_presente: false, apertura_registrata: true }, error: null as { message: string } | null };
      }
      return { data: null, error: null as { message: string } | null };
    },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-finta" } }) }));
vi.mock("@/hooks/useAnagraficaAzienda", () => ({ useAnagraficaAzienda: () => ({ data: { ragione_sociale: "Prova srl" } }) }));

import ContabilitaGenerale from "@/components/contabilita/ContabilitaGenerale";

function apri() {
  return render(
    <MemoryRouter initialEntries={["/?anno=2026&vista=fine"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ContabilitaGenerale />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.rpc = [];
  state.esercizio = null;
});
afterEach(cleanup);

it("fine anno: anteprime di ammortamenti, TFR e chiusura; si chiude solo dopo la conferma", async () => {
  apri();
  expect(await screen.findByText("Escavatore finto")).toBeTruthy();
  expect(screen.getByText(/1\. Ammortamenti e TFR al 31\/12\/2026/)).toBeTruthy();
  expect(await screen.findByText(/7 conti economici da chiudere/)).toBeTruthy();
  // Solo anteprime finché nessuno conferma.
  expect(state.rpc.every((c) => c.args.p_anteprima === true)).toBe(true);
  expect((screen.getByRole("button", { name: "Registra" }) as HTMLButtonElement).disabled).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: "Chiudi l'esercizio 2026" }));
  expect(await screen.findByText("Chiudere l'esercizio 2026?")).toBeTruthy();
  expect(state.rpc.some((c) => c.fn === "contabilita_chiudi_esercizio" && c.args.p_anteprima === false)).toBe(false);
  fireEvent.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: "Chiudi" }).find((b) => b.textContent === "Chiudi")!);
  await waitFor(() =>
    expect(state.rpc.some((c) => c.fn === "contabilita_chiudi_esercizio" && c.args.p_anteprima === false && c.args.p_anno === 2026)).toBe(true));
});

it("esercizio chiuso: lo dice, non registra e per riaprire chiede il motivo", async () => {
  state.esercizio = { anno: 2026, chiuso_il: "2027-02-15T10:00:00Z", stampato_fino_al: null, stampe: [] };
  apri();
  expect(await screen.findByText(/Esercizio 2026 chiuso il 15\/02\/2027/)).toBeTruthy();
  expect(await screen.findByText("Escavatore finto")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Registra" }) as HTMLButtonElement).disabled).toBe(true);
  // Con l'anno chiuso l'anteprima della chiusura non si chiede.
  expect(state.rpc.some((c) => c.fn === "contabilita_chiudi_esercizio")).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: "Riapri l'esercizio" }));
  const riapri = await screen.findByRole("button", { name: "Riapri" });
  expect((riapri as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByPlaceholderText("Fattura arrivata dopo la chiusura"), { target: { value: "Fattura di dicembre arrivata tardi" } });
  expect((riapri as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(riapri);
  await waitFor(() => expect(state.rpc.some((c) => c.fn === "contabilita_riapri_esercizio"
    && c.args.p_motivo === "Fattura di dicembre arrivata tardi")).toBe(true));
});
