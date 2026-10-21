import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { TabDashboard } from "@/components/controllo-gestione/tabs/TabDashboard";

const q = <T,>(data: T) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });
const voce = (codice: string, valore: number) => ({ codice, label: codice, tipo: "voce", valore });

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/controlloGestione/useCEriclassificato", () => ({
  useCEriclassificato: () => q({ meta: {}, voci: [voce("01", 4655616.76), voce("A", 4655616.76), voce("E", 530795.43), voce("F", 460255.63), voce("L", 287444.44)] }),
  useBEP: () => q({ gia_raggiunto: true, bep_data: "2026-09-03", giorni_residui: -48 }),
}));
vi.mock("@/hooks/controlloGestione/useStatoPatrimoniale", () => ({
  useStatoPatrimoniale: () => q({ quadratura: { quadrato: false, differenza: 1346331.55 } }),
  useRating: () => q({ anno: 2026, classe: "AAA", score: 95, attendibile: false, motivi: ["Stato patrimoniale non riconciliato: differenza 1346331.55 €"], indicatori: [] }),
}));
vi.mock("@/hooks/controlloGestione/useCashFlow", () => ({
  useCashFlow: () => q({ meta: { saldo_apertura: 250111.8, saldo_chiusura: 120000 }, mesi: [{ mese: 11, saldo_fine: 180000, sotto_zero: false }, { mese: 12, saldo_fine: 120000, sotto_zero: false }] }),
}));
vi.mock("@/hooks/controlloGestione/usePFN", () => ({ usePFN: () => q({ pfn: -6611.8 }) }));
vi.mock("@/hooks/controlloGestione/useIndiciAvanzati", () => ({ useIndiciAvanzati: () => q({ altman: { classe: "safe" }, dscr: { valore: null, classe: "na" } }) }));
vi.mock("@/hooks/controlloGestione/useMarginalitaCommesse", () => ({
  useMarginalitaCommesse: () => q({ righe: [{}], kpi: { n_in_perdita: 10, n_in_corso: 5, n_completate: 3, margine_atteso_totale: 1000 } }),
}));
vi.mock("@/hooks/controlloGestione/useBudget", () => ({ useBudgetConfronto: () => q({ haBudget: false, righe: [] }) }));
vi.mock("recharts", () => ({
  ResponsiveContainer: () => null, LineChart: () => null, Line: () => null, XAxis: () => null,
  YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
}));

afterEach(cleanup);

describe("Dashboard del controllo di gestione", () => {
  it("i riquadri mostrano importi interi e leggibili, con il valore pieno nel tooltip", () => {
    render(<MemoryRouter><TabDashboard anno={2026} /></MemoryRouter>);
    const ricavi = screen.getByText("4,66 Mln €");
    expect(ricavi).toHaveAttribute("title", expect.stringContaining("4.655.616,76"));
    expect(screen.getByText("530.795 €")).toBeInTheDocument();
    expect(screen.getByText("Margine 11,4%")).toBeInTheDocument();
    expect(screen.queryByText(/del PIL/)).not.toBeInTheDocument();
  });

  it("il banner dei dati da riconciliare scrive gli importi all'italiana", () => {
    render(<MemoryRouter><TabDashboard anno={2026} /></MemoryRouter>);
    const banner = screen.getAllByRole("alert").find((el) => el.textContent?.includes("Dati da riconciliare"))!;
    expect(banner).toHaveTextContent("1.346.331,55 €");
    expect(banner).not.toHaveTextContent("1346331.55");
  });

  it("le commesse in perdita dicono cosa contano", () => {
    render(<MemoryRouter><TabDashboard anno={2026} /></MemoryRouter>);
    expect(screen.getByText(/10 commesse stimate in perdita a fine lavori \(margine atteso sotto zero, aperte e chiuse\)/)).toBeInTheDocument();
  });
});
