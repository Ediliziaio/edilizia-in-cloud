/**
 * Elenco dei preventivi: il totale di un preventivo fotovoltaico è quello della sua pagina (06/10/2026).
 *
 * Il totale IVA inclusa lo scrive solo il calcolo finanziario: una bozza col prezzo scritto a mano, o con un kit, non
 * ha ancora `prezzo_vendita_iva_inclusa`. La pagina del Fotovoltaico lo ricava da `importoPreventivoFv` (prezzo a
 * corpo o kit + aliquota); l'elenco unificato leggeva solo la colonna e mostrava «—» (e li lasciava fuori dai totali
 * di pipeline): in produzione 3 bozze su 45. Qui l'elenco vero, con righe di tre tipi:
 *   · prezzo scritto a mano 5.500 € + 10%  → 6.050 €
 *   · kit da 10.000 € + 22%                → 12.200 €
 *   · totale già calcolato, 11.000 €       → 11.000 €
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

const finti = vi.hoisted(() => ({ nulla: (): null => null }));

vi.mock("@/integrations/supabase/client", () => {
  const FV: Array<Record<string, unknown>> = [
    {
      id: "fv1", numero: "FV-2026-0001", stato: "bozza", prezzo_vendita_iva_inclusa: null, prezzo_vendita_manuale: 5500, kit_bundle_id: null, kit_prezzo: null,
      iva_aliquota: 0.1, created_by: "u1", created_at: "2026-10-01T08:00:00Z", updated_at: "2026-10-02T08:00:00Z", cliente: { first_name: "Mario", last_name: "Rossi" },
    },
    {
      id: "fv2", numero: "FV-2026-0002", stato: "bozza", prezzo_vendita_iva_inclusa: null, prezzo_vendita_manuale: null, kit_bundle_id: "k1", kit_prezzo: 10000,
      iva_aliquota: 0.22, created_by: "u1", created_at: "2026-10-01T09:00:00Z", updated_at: "2026-10-02T09:00:00Z", cliente: { first_name: "Anna", last_name: "Verdi" },
    },
    {
      id: "fv3", numero: "FV-2026-0003", stato: "emesso", prezzo_vendita_iva_inclusa: 11000, prezzo_vendita_manuale: null, kit_bundle_id: null, kit_prezzo: null,
      iva_aliquota: 0.1, created_by: "u1", created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-02T10:00:00Z", cliente: { first_name: "Luca", last_name: "Bianchi" },
    },
  ];
  const RIGHE: Record<string, unknown[]> = { fv_progetti: FV };
  const costruttore = (tabella: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "or", "in", "is", "not", "gte", "gt", "lte", "lt", "ilike", "order", "range", "limit", "filter", "returns", "maybeSingle", "single"]) {
      b[m] = () => b;
    }
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: RIGHE[tabella] ?? [], error: null, count: (RIGHE[tabella] ?? []).length }).then(ok, ko);
    return b;
  };
  return { supabase: { from: (t: string) => costruttore(t), rpc: () => costruttore("rpc"), channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: (): void => undefined } };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: "company_admin", user: { id: "u1" }, effectiveCompany: { id: "c1", name: "Azienda di prova" } }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => new Proxy({}, { get: (_t, p) => (typeof p === "string" && p.startsWith("can") ? true : p === "onlyAssigned" ? false : undefined) }) }));
vi.mock("@/lib/moduli-vendita", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/moduli-vendita")>()),
  useModuliVendita: () => ({ moduli: [{ modulo: { slug: "fotovoltaico" }, isEnabled: true }] }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));
vi.mock("@/components/marketing/preventivi/UnifiedFiltersSheet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/marketing/preventivi/UnifiedFiltersSheet")>()),
  UnifiedFiltersSheet: finti.nulla,
}));
vi.mock("@/components/marketing/preventivi/UnifiedBulkToolbar", () => ({ UnifiedBulkToolbar: finti.nulla, spostaNelCestino: vi.fn() }));
vi.mock("@/components/marketing/preventivi/PreventiviCestinoDialog", () => ({ PreventiviCestinoDialog: finti.nulla }));
// I grafici non servono: in jsdom non hanno una larghezza.
vi.mock("recharts", () => {
  const vuoto = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { BarChart: vuoto, Bar: vuoto, XAxis: finti.nulla, YAxis: finti.nulla, CartesianGrid: finti.nulla, Tooltip: finti.nulla, ResponsiveContainer: vuoto, PieChart: vuoto, Pie: vuoto, Cell: finti.nulla, Legend: finti.nulla };
});

import { UnifiedPreventiviList } from "@/components/marketing/preventivi/UnifiedPreventiviList";

afterEach(() => cleanup());

const riga = (numero: string) => (screen.getAllByText(numero)[0].closest("tr") as HTMLElement).textContent?.replace(/\s+/g, " ") ?? "";

describe("elenco unificato: il totale del Fotovoltaico", () => {
  it("una bozza col prezzo scritto a mano, o con un kit, ha il totale della sua pagina (non «—»)", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/azienda/marketing/preventivi"]}>
          <TooltipProvider><UnifiedPreventiviList /></TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByText("FV-2026-0001").length).toBeGreaterThan(0), { timeout: 8000 });
    // 5.500 + 10% = 6.050
    expect(riga("FV-2026-0001")).toMatch(/6\.050,00/);
    // kit 10.000 + 22% = 12.200
    expect(riga("FV-2026-0002")).toMatch(/12\.200,00/);
    // totale già calcolato: com'era
    expect(riga("FV-2026-0003")).toMatch(/11\.000,00/);
  });
});
