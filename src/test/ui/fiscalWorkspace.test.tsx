import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const state = vi.hoisted(() => ({
  calls: [] as string[],
  fail: false,
  company: "company-a",
  permission: true,
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => state.company,
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    isAdmin: true,
    isLoading: false,
    solaLettura: false,
    canViewBilling: state.permission,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const key of [
        "select",
        "eq",
        "is",
        "gte",
        "lte",
        "in",
        "not",
        "order",
        "range",
        "abortSignal",
      ])
        chain[key] = () => chain;
      chain.then = (resolve: (v: unknown) => void) => {
        state.calls.push(table);
        return Promise.resolve({
          data:
            table === "documenti_fiscali"
              ? [
                  {
                    id: "s",
                    tipo: "fattura",
                    numero: "FPR 1",
                    data_emissione: "2026-10-01",
                    cliente_snapshot: { ragione_sociale: "Cliente" },
                    imponibile_totale: 100,
                    iva_totale: 22,
                    totale_documento: 122,
                    riepilogo_iva: [
                      { aliquota_iva: "22", imponibile: 100, imposta: 22 },
                    ],
                  },
                ]
              : [],
          error: state.fail ? { message: "network failed" } : null,
        }).then(resolve);
      };
      return chain;
    },
    rpc: vi.fn(() => {
      throw Error("RPC forbidden on navigation");
    }),
  },
}));
vi.mock("@/components/contabilita/LiquidazioneIVA", () => ({
  LiquidazioneIVA: () => <p>Prospetto senza scritture</p>,
}));
vi.mock("@/hooks/useLiquidazioneIVA", () => ({
  useLiquidazioneIVA: () => ({}),
}));
vi.mock("@/components/fatturazione/FiscalWorkspace", () => ({
  FiscalLegacyRedirect: () => <p>Legacy redirect</p>,
}));
vi.mock("@/components/fatturazione/FiscalSourceViewer", () => ({
  FiscalSourceViewer: ({ label }: { label: string }) => (
    <button>{label}</button>
  ),
}));
import RegistroIVA from "@/pages/azienda/fatturazione/RegistroIVA";
function Location() {
  return <output data-testid="url">{useLocation().search}</output>;
}
function setup(url = "/azienda/documenti?tab=fiscalita&anno=2026&mese=10") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <RegistroIVA embedded />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  state.calls = [];
  state.fail = false;
  state.company = "company-a";
  state.permission = true;
});
afterEach(cleanup);
describe("registro fiscale reale, senza scritture", () => {
  it("shows correct historical VAT rate, preserves billing shell URL and does not preload other modules", async () => {
    setup();
    expect(await screen.findByText("22%")).toBeVisible();
    expect(screen.queryByText("0%")).toBeNull();
    expect(screen.queryByText(/^IVA documentale /)).toBeNull();
    expect(screen.getByText("0 documenti da verificare")).toBeVisible();
    expect(new Set(state.calls)).toEqual(
      new Set(["documenti_fiscali", "fatture_ricevute_periodo_iva"]),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Registro acquisti" }));
    expect(screen.getByTestId("url").textContent).toContain(
      "registro=acquisti",
    );
    expect(screen.getByTestId("url").textContent).toContain("anno=2026");
  });
  it("does not show zero totals or empty records when loading fails", async () => {
    state.fail = true;
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dati fiscali non disponibili",
    );
    expect(screen.queryByText("0,00 €")).toBeNull();
    expect(screen.queryByRole("button", { name: "Esporta CSV" })).toBeNull();
  });
  it("distinguishes a genuinely empty period and search from an error", async () => {
    setup();
    await screen.findByText("22%");
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca nel registro IVA" }),
      { target: { value: "not found" } },
    );
    expect(screen.getByText(/Nessun documento corrisponde/)).toBeVisible();
    expect(screen.getByText(/La ricerca filtra l’elenco/)).toBeVisible();
    expect(screen.getByText(/IVA dei risultati:/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Esporta CSV" })).toBeDisabled();
  });
  it("can retry without writing to any register", async () => {
    state.fail = true;
    setup();
    await screen.findByRole("alert");
    state.fail = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Riprova caricamento" }),
    );
    await waitFor(() => expect(screen.getByText("22%")).toBeVisible());
  });
});
