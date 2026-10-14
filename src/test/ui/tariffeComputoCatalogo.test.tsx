import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  MatchTariffaPickerDialog,
  type ComputoTariffaCatalogItem,
} from "@/components/quotes/MatchTariffaPickerDialog";
import { invalidateAllTariffe } from "@/lib/tariffeQueryKeys";
import { QueryClient } from "@tanstack/react-query";

const stato = vi.hoisted(() => ({
  catalogo: [] as ComputoTariffaCatalogItem[],
  righe: [] as Array<
    ComputoTariffaCatalogItem & { attivo: boolean; attiva: boolean }
  >,
  query: null as null | (() => Promise<ComputoTariffaCatalogItem[]>),
  errore: null as null | Error,
  refetch: vi.fn(),
  select: "",
  filtri: [] as Array<[string, string]>,
  pagine: [] as Array<[number, number]>,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "company-demo" } }),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: (opts: { queryFn: () => Promise<ComputoTariffaCatalogItem[]> }) => {
    stato.query = opts.queryFn;
    return {
      data: stato.catalogo,
      isLoading: false,
      isError: !!stato.errore,
      error: stato.errore,
      refetch: stato.refetch,
    };
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let intervallo = [0, 249];
      const q = {
        select: (cols: string) => {
          stato.select = cols;
          return q;
        },
        eq: (k: string, v: string) => {
          stato.filtri.push([k, v]);
          return q;
        },
        order: () => q,
        range: (f: number, t: number) => {
          intervallo = [f, t];
          stato.pagine.push([f, t]);
          return q;
        },
        then: (ok: (r: unknown) => unknown) =>
          Promise.resolve({
            data: stato.righe.slice(intervallo[0], intervallo[1] + 1),
            error: stato.errore,
          }).then(ok),
      };
      return q;
    },
  },
}));
const voce: ComputoTariffaCatalogItem = {
  id: "t1",
  nome: "Tariffa regionale",
  tipo: "manodopera",
  codice: "REG-1049",
  fonte: "Molise 2026",
  unita: "kg",
  unita_fatturazione: "pz",
  prezzo_vendita: 0.0066,
  costo_interno: 0,
  prezzo_costo: 0.0044,
  vertical_associato: null,
};
beforeEach(() => {
  stato.catalogo = [];
  stato.righe = [];
  stato.errore = null;
  stato.filtri = [];
  stato.pagine = [];
  stato.refetch.mockClear();
});
afterEach(cleanup);
function apri(initialQuery = "") {
  const onSelect = vi.fn();
  render(
    <MatchTariffaPickerDialog
      open
      onOpenChange={vi.fn()}
      onSelect={onSelect}
      initialQuery={initialQuery}
    />,
  );
  return onSelect;
}
describe("Tariffe nel computo: completezza e prezzi aggiornati", () => {
  it("legge oltre mille voci con filtro aziendale, escludendo le archiviate", async () => {
    stato.righe = Array.from({ length: 1051 }, (_, i) => ({
      ...voce,
      id: `t${i}`,
      attivo: i !== 1050,
      attiva: true,
    }));
    apri();
    const voci = await stato.query!();
    expect(voci).toHaveLength(1050);
    expect(voci[1049].id).toBe("t1049");
    expect(stato.pagine).toContainEqual([1000, 1249]);
    expect(
      stato.filtri.every(
        ([k, v]) => k === "company_id" && v === "company-demo",
      ),
    ).toBe(true);
    expect(stato.select).toContain("costo_default");
  });
  it("cerca il codice originale e conserva piccoli importi e unità nel risultato scelto", () => {
    stato.catalogo = [voce];
    const onSelect = apri("REG-1049");
    expect(screen.getByText("0,0066", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Unità: kg")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tariffa regionale/ }));
    expect(onSelect).toHaveBeenCalledWith(voce);
  });
  it("un errore di caricamento si può riprovare e non sembra un listino vuoto", () => {
    stato.errore = new Error("Connessione interrotta");
    apri();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Connessione interrotta",
    );
    expect(screen.queryByText("Nessuna tariffa trovata")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(stato.refetch).toHaveBeenCalledOnce();
  });
  it("una modifica del listino invalida anche il catalogo già aperto nel computo", () => {
    const client = new QueryClient();
    const invalida = vi.spyOn(client, "invalidateQueries");
    invalidateAllTariffe(client);
    expect(invalida).toHaveBeenCalledWith({
      queryKey: ["computo-tariffe-picker"],
    });
  });
});
