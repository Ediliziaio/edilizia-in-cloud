/** Fornitori → «Fornitori dalle fatture»: chi manca, scelta, creazione a blocchi da 200, esteri e non validi a parte. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => ({ cedenti: [] as unknown[], chiamate: [] as string[][] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (fn: string, args: { p_chiavi?: string[] }) => {
      if (fn === "acquisti_fornitori_dalle_fatture_anteprima") return { data: state.cedenti, error: null as Error | null };
      state.chiamate.push(args.p_chiavi ?? []);
      return { data: { creati: args.p_chiavi?.length ?? 0, agganciati: 0, fatture: 1, saltati: [] as Array<{ chiave: string; nome?: string; motivo: string }> }, error: null as Error | null };
    },
  },
}));
vi.mock("@/lib/suppliers/cacheFornitori", () => ({ invalidaFornitori: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BLOCCO, FornitoriDalleFatture, creabile, type CedenteMancante } from "@/components/suppliers/FornitoriDalleFatture";

const ced = (chiave: string, over: Partial<CedenteMancante> = {}): CedenteMancante => ({
  chiave, nome: `Fornitore ${chiave}`, piva: chiave, codice_fiscale: null, paese: "IT", fatture: 2, totale: 100, ultima: "2026-10-01",
  identificativo_valido: true, gia_in_rubrica: null, omonimi: 0, ...over,
});

function apri() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FornitoriDalleFatture companyId="c" /></QueryClientProvider>);
}
afterEach(() => { cleanup(); state.cedenti = []; state.chiamate = []; });

describe("fornitori dalle fatture", () => {
  it("niente da fare: niente avviso", async () => {
    apri();
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText(/non hanno un fornitore/)).toBeNull();
  });

  it("separa i creabili da quelli da fare a mano, segnala gli omonimi, crea solo i scelti", async () => {
    state.cedenti = [ced("00743110157", { omonimi: 1 }), ced("01234567897", { gia_in_rubrica: "s1" }), ced("DE1", { paese: "DE", identificativo_valido: false })];
    apri();
    fireEvent.click(await screen.findByRole("button", { name: /Rivedi e crea/ }));
    expect(screen.getByText(/nome uguale a un fornitore con altra P.IVA/)).toBeInTheDocument();
    expect(screen.getByText(/già in rubrica/)).toBeInTheDocument();
    expect(screen.getByText("Da creare a mano (1)")).toBeInTheDocument();
    expect(screen.getByText(/fornitore estero/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Scegli Fornitore 00743110157" }));
    fireEvent.click(screen.getByRole("button", { name: /Crea e collega 1/ }));
    await waitFor(() => expect(state.chiamate).toEqual([["00743110157"]]));
  });

  it("tanti fornitori: si creano a blocchi da 200", async () => {
    state.cedenti = Array.from({ length: 450 }, (_, i) => ced(String(10000000000 + i)));
    apri();
    fireEvent.click(await screen.findByRole("button", { name: /Rivedi e crea/ }));
    fireEvent.click(screen.getByRole("button", { name: "Seleziona tutti (450)" }));
    fireEvent.click(screen.getByRole("button", { name: /Crea e collega 450/ }));
    await waitFor(() => expect(state.chiamate.map((c) => c.length)).toEqual([BLOCCO, BLOCCO, 50]));
  });

  it("creabile solo con identificativo valido o se è già in rubrica; la pagina Fornitori lo mostra a chi può modificare", () => {
    expect(creabile(ced("x", { identificativo_valido: false }))).toBe(false);
    expect(creabile(ced("x", { identificativo_valido: false, gia_in_rubrica: "s" }))).toBe(true);
    expect(readFileSync("src/pages/azienda/settings/SettingsSuppliers.tsx", "utf8")).toContain('{tab === "anagrafica" && puoModificare && effectiveCompany?.id && <FornitoriDalleFatture');
  });
});
