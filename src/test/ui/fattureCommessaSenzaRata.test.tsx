import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useFattureByOrdine } from "@/hooks/billing/useFatturaOrdineLink";

const stato = vi.hoisted(() => ({
  diretti: [] as Record<string, unknown>[],
  legami: [] as Record<string, unknown>[],
  collegati: [] as Record<string, unknown>[],
  erroreCollegati: null as Error | null,
  filtri: [] as Array<{ tabella: string; campo: string; valore: unknown }>,
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-demo" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from(tabella: string) {
    let perId = false;
    const query = {
      select: () => query,
      eq: (campo: string, valore: unknown) => { stato.filtri.push({ tabella, campo, valore }); return query; },
      is: () => query,
      in: () => { perId = true; return query; },
      then(resolve: (result: { data: Record<string, unknown>[]; error: Error | null }) => unknown) {
        return Promise.resolve({ data: tabella === "fattura_ordine" ? stato.legami : perId ? stato.collegati : stato.diretti,
          error: perId ? stato.erroreCollegati : null }).then(resolve);
      },
    };
    return query;
  },
} }));
beforeEach(() => { stato.diretti = []; stato.legami = []; stato.collegati = []; stato.erroreCollegati = null; stato.filtri = []; });
afterEach(cleanup);
const apri = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useFattureByOrdine("commessa-demo"), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
};
describe("Documenti della commessa indipendenti dal piano rate", () => {
  it("trova una bozza collegata direttamente anche senza alcuna rata associata", async () => {
    stato.diretti = [{ id: "bozza", stato: "bozza", tipo: "fattura", totale_documento: 122 }];
    const { result } = apri();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([expect.objectContaining({ id: "bozza", stato: "bozza" })]);
  });
  it("trova i collegamenti multipli senza duplicare il documento e mantiene la quota", async () => {
    const fattura = { id: "bozza", stato: "bozza", tipo: "fattura", totale_documento: 122 };
    stato.diretti = [fattura]; stato.collegati = [fattura]; stato.legami = [{ fattura_id: "bozza", importo_associato: 61 }];
    const { result } = apri();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([expect.objectContaining({ id: "bozza", importo_associato: 61 })]);
    expect(stato.filtri.filter(f => f.tabella === "documenti_fiscali" && f.campo === "company_id")).toHaveLength(2);
  });
  it("non trasforma un errore di lettura dei documenti collegati in un elenco vuoto", async () => {
    stato.legami = [{ fattura_id: "bozza" }]; stato.erroreCollegati = new Error("lettura non disponibile");
    const { result } = apri();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("lettura non disponibile");
    expect(result.current.data).toBeUndefined();
  });
});
