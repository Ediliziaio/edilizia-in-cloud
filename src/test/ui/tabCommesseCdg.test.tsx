import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const riga = (over: Record<string, unknown>) => ({
  id: "job", order_code: "C1", description: "Bagno", cliente: "Rossi", status: null, work_state: "open", creation_year: 2026,
  pct_avanzamento: 0.5, work_start: null, work_end: null, preventivo: 7457005.84, consuntivo: 450, costo_acquisti: 0, costo_errori: 0,
  variazioni: 0, costo_manodopera: 100, ore_manodopera: 10, margine: 550, margine_perc: 18.6, costo_atteso: 900, margine_atteso: -100,
  margine_atteso_perc: -10, semaforo: "rosso", dati_economici_completi: true, ...over,
});
vi.mock("@/hooks/controlloGestione/useMarginalitaCommesse", () => ({
  useMarginalitaCommesse: () => ({
    data: {
      meta: {},
      kpi: { n_commesse: 3, n_anno: 2, n_pregresso: 1, n_in_corso: 2, n_completate: 1, n_assistenza: 0, preventivo_totale: 7457005.84,
        consuntivo_totale: 450, margine_totale: 0, margine_atteso_totale: -100, n_in_perdita: 1, n_da_completare: 1, preventivo_valutabile: 1000 },
      righe: [
        riga({}),
        riga({ id: "vecchia", order_code: "DEMO-2023", creation_year: 2023, work_state: "completed", semaforo: "verde", margine_atteso: 300, margine_atteso_perc: 30 }),
        riga({ id: "vuota", order_code: "C3", semaforo: "grigio", dati_economici_completi: false, margine_atteso: null, margine_atteso_perc: null }),
      ],
    },
  }),
}));
vi.mock("@/hooks/controlloGestione/useCompanyStructure", () => ({ useCompanyStructure: () => ({ data: null }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("@tanstack/react-query", async (orig) => ({ ...(await orig<object>()), useQuery: () => ({ data: undefined }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/controllo-gestione/ui/ExportButton", () => ({ ExportButton: () => null }));
import { TabCommesse } from "@/components/controllo-gestione/tabs/TabCommesse";

afterEach(cleanup);

describe("scheda Commesse del Controllo di gestione", () => {
  it("mostra sempre le commesse in perdita e i non valutabili con lo stesso conteggio del semaforo", () => {
    render(<MemoryRouter><TabCommesse anno={2026} /></MemoryRouter>);
    const perdita = screen.getByText("Stimate in perdita").closest("div")!;
    expect(within(perdita).getByText("1")).toBeInTheDocument();
    expect(screen.getByText(/1 senza costi o preventivo · 0 sotto il 20%/)).toBeInTheDocument();
    expect(screen.getByText("Non valutabile: 1")).toBeInTheDocument();
  });

  it("percentuali con la virgola, righe che aprono la commessa, pregresso segnalato", () => {
    render(<MemoryRouter><TabCommesse anno={2026} /></MemoryRouter>);
    expect(screen.getAllByText("(18,6%)").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /C1/ })[0]).toHaveAttribute("href", "/azienda/ordini/job");
    expect(screen.getByText(/Del 2023 · rate da incassare/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d\.\d%/);
  });
});
