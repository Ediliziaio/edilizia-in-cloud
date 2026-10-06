import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CronoprogrammaCommessa } from "@/components/orders/CronoprogrammaCommessa";

/**
 * Cronoprogramma della commessa (06/10/2026): il Gantt con contratto, fasi
 * previste e reali, oggi, ritardi e i numeri economici secondo i permessi.
 */

const stato = vi.hoisted(() => ({
  permessi: { canViewOrderAmounts: true, canViewCosts: true, canViewMargins: true },
  phases: [] as unknown[],
  materials: [] as unknown[],
  assegnazioni: [] as unknown[],
  rapportini: [] as unknown[],
  firma: null as string | null,
}));

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/hooks/useOrderWorkPhases", () => ({
  useOrderWorkPhases: () => ({
    phases: stato.phases, materials: stato.materials, allAssignments: stato.assegnazioni,
    isLoading: false, isError: false, refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useCronoprogramma", () => ({
  useCronoprogramma: () => ({ rapportini: stato.rapportini, firmaPreventivo: stato.firma, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useOrderScheduleHealth", () => ({ useOrderScheduleHealth: () => ({ data: { stato: "in_ritardo", n_fasi_datate: 3, fasi: [] as unknown[] } }) }));
vi.mock("@/hooks/useCostiMaterialiFasi", () => ({ useCostiMaterialiFasi: () => ({ data: { acquisti: [] as unknown[], movimenti: [] as unknown[] } }) }));

const fase = (extra: Record<string, unknown>): Record<string, unknown> => ({
  id: "f", order_id: "o", name: "Fase", position: 0, status: "da_iniziare", start_date: null, end_date: null,
  notes: null, percentuale: 0, completata_il: null, assignments: [], ...extra,
});
const ordine = { quote_id: "q1", created_at: "2026-07-14T09:00:00Z", work_start_date: "2026-08-03", work_end_date: "2026-09-05", expected_date: null as string | null };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-20T10:00:00"));
  stato.permessi = { canViewOrderAmounts: true, canViewCosts: true, canViewMargins: true };
  stato.phases = [
    fase({ id: "f1", name: "Demolizioni", status: "completata", start_date: "2026-08-03", end_date: "2026-08-10", percentuale: 100, completata_il: "2026-08-14" }),
    fase({ id: "f2", name: "Impianti", status: "in_corso", start_date: "2026-08-11", end_date: "2026-08-18", percentuale: 40 }),
    fase({ id: "f3", name: "Pavimenti", start_date: "2026-08-25", end_date: "2026-09-05" }),
    fase({ id: "f4", name: "Finiture" }),
  ];
  stato.materials = [{ id: "r1", phase_id: "f1", quantity: 1, unit_price: 3000, discount_percent: 0, purchase_price: null, standard_cost: null }];
  stato.assegnazioni = [{ id: "a1", phase_id: "f1", source: "employee", cost_preventivo: 1000, cost_consuntivo: 1200 }];
  stato.rapportini = [
    { data_lavoro: "2026-08-04", stato: "approvato", fasi_lavorate: [{ phase_id: "f1", ore: 8 }] },
    { data_lavoro: "2026-08-12", stato: "inviato", fasi_lavorate: [{ phase_id: "f2", ore: 6 }] },
  ];
  stato.firma = "2026-07-12";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Cronoprogramma", () => {
  it("in cima: contratto firmato, lavori previsti, fasi in ritardo", () => {
    render(<CronoprogrammaCommessa orderId="o" order={ordine} />);
    expect(screen.getByText("Contratto firmato").nextSibling).toHaveTextContent("12/07/2026");
    expect(screen.getByText("Lavori previsti").nextSibling).toHaveTextContent("03/08 → 05/09");
    expect(screen.getByText("2 fasi in ritardo, fino a 4 giorni")).toBeInTheDocument();
    // la media delle fasi, come la testata della commessa: (100 + 40 + 0 + 0) / 4
    expect(screen.getByLabelText("Avanzamento 35%")).toBeInTheDocument();
  });

  it("senza firma del preventivo dice quando è stata aperta la commessa", () => {
    stato.firma = null;
    render(<CronoprogrammaCommessa orderId="o" order={ordine} />);
    expect(screen.getByText("Commessa aperta").nextSibling).toHaveTextContent("14/07/2026");
    expect(screen.getByTitle("Commessa aperta: 14/07/2026")).toHaveTextContent("Commessa aperta 14/07");
    expect(screen.queryByText(/^Contratto/)).not.toBeInTheDocument();
  });

  it("ogni fase datata ha la barra prevista; quella chiusa tardi la reale e la parte oltre la fine", () => {
    render(<CronoprogrammaCommessa orderId="o" order={ordine} />);
    expect(screen.getByTestId("previsto-f1")).toBeInTheDocument();
    expect(screen.getByTestId("reale-f1")).toBeInTheDocument();
    expect(screen.getByTestId("oltre-f1")).toHaveAttribute("title", "Oltre la fine prevista: +4 giorni");
    // in corso oltre la fine prevista: la parte rossa arriva a oggi
    expect(screen.getByTestId("oltre-f2")).toBeInTheDocument();
    // non ancora iniziata: solo la prevista
    expect(screen.getByTestId("previsto-f3")).toBeInTheDocument();
    expect(screen.queryByTestId("reale-f3")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Demolizioni: Completata, 100%, in ritardo di 4 giorni$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pavimenti: Da iniziare, 0%$/ })).toBeInTheDocument();
  });

  it("una fase mai iniziata con la fine prevista passata è rossa fino a oggi; una partita tardi ma chiusa in tempo no", () => {
    stato.phases = [
      fase({ id: "g1", name: "Intonaci", start_date: "2026-08-03", end_date: "2026-08-10" }),
      fase({ id: "g2", name: "Massetti", status: "completata", percentuale: 100, start_date: "2026-08-03", end_date: "2026-08-10", completata_il: "2026-08-10" }),
    ];
    stato.rapportini = [{ data_lavoro: "2026-08-07", stato: "approvato", fasi_lavorate: [{ phase_id: "g2", ore: 8 }] }];
    render(<CronoprogrammaCommessa orderId="o" order={ordine} />);
    expect(screen.getByTestId("oltre-g1")).toHaveAttribute("title", "Oltre la fine prevista: +10 giorni, ancora aperta");
    expect(screen.getByRole("button", { name: /^Intonaci: Da iniziare, 0%, in ritardo di 10 giorni$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Massetti: Completata, 100%$/ })).toBeInTheDocument();
    expect(screen.queryByTestId("oltre-g2")).not.toBeInTheDocument();
    expect(screen.getByText("1 fase in ritardo, fino a 10 giorni")).toBeInTheDocument();
  });

  it("una fase che doveva già partire ma ha la fine davanti: inizio in ritardo, a parte", () => {
    stato.phases = [fase({ id: "h1", name: "Serramenti", start_date: "2026-08-15", end_date: "2026-08-30" })];
    stato.rapportini = [];
    render(<CronoprogrammaCommessa orderId="o" order={ordine} />);
    expect(screen.getByRole("button", { name: /^Serramenti: Da iniziare, 0%, inizio in ritardo di 5 giorni$/ })).toHaveTextContent("inizio +5 gg");
    expect(screen.getByText("1 fase con l'inizio in ritardo")).toBeInTheDocument();
    expect(screen.queryByText(/fasi? in ritardo, fino a/)).not.toBeInTheDocument();
  });

  it("tutto in tempo: nessuna fase in ritardo", () => {
    stato.phases = [fase({ id: "k1", name: "Pavimenti", start_date: "2026-08-25", end_date: "2026-09-05" })];
    render(<CronoprogrammaCommessa orderId="o" order={ordine} />);
    expect(screen.getByText("Nessuna fase in ritardo")).toBeInTheDocument();
  });

  it("le fasi senza date sono elencate a parte, con la strada per aggiungerle", () => {
    const vai = vi.fn();
    render(<CronoprogrammaCommessa orderId="o" order={ordine} onOpenLavorazioni={vai} />);
    expect(screen.queryByRole("button", { name: /^Finiture/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Senza date previste/)).toHaveTextContent("Finiture");
    fireEvent.click(screen.getByRole("button", { name: "Vai alle lavorazioni" }));
    expect(vai).toHaveBeenCalled();
  });

  it("i traguardi: contratto, inizio e fine lavori", () => {
    render(<CronoprogrammaCommessa orderId="o" order={ordine} />);
    expect(screen.getByTitle("Contratto firmato: 12/07/2026")).toBeInTheDocument();
    expect(screen.getByTitle("Inizio lavori previsto: 03/08/2026")).toBeInTheDocument();
    expect(screen.getByTitle("Fine lavori prevista: 05/09/2026")).toBeInTheDocument();
  });

  it("al clic su una fase il dettaglio: previsto, reale, ritardo, ore e i numeri economici", () => {
    render(<CronoprogrammaCommessa orderId="o" order={ordine} />);
    expect(screen.getByText("costo +200,00 €")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Demolizioni/ }));
    const dettaglio = screen.getByRole("dialog");
    expect(within(dettaglio).getByText("dal 03/08/2026 al 10/08/2026 (8 giorni)")).toBeInTheDocument();
    expect(within(dettaglio).getByText("dal 04/08/2026 al 14/08/2026")).toBeInTheDocument();
    expect(within(dettaglio).getByText("inizio +1 giorno · fine +4 giorni")).toBeInTheDocument();
    expect(within(dettaglio).getByText("8 h dai rapportini")).toBeInTheDocument();
    expect(within(dettaglio).getByText("3.000,00 €")).toBeInTheDocument();
    expect(within(dettaglio).getByText("1.200,00 € (+200,00 €)")).toBeInTheDocument();
  });

  it("senza permesso sui costi e sugli importi: le date sì, i soldi no", () => {
    stato.permessi = { canViewOrderAmounts: false, canViewCosts: false, canViewMargins: false };
    render(<CronoprogrammaCommessa orderId="o" order={ordine} />);
    expect(screen.queryByText(/costo \+/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Demolizioni/ }));
    const dettaglio = screen.getByRole("dialog");
    expect(within(dettaglio).getByText("dal 03/08/2026 al 10/08/2026 (8 giorni)")).toBeInTheDocument();
    expect(within(dettaglio).queryByText("Venduto")).not.toBeInTheDocument();
    expect(within(dettaglio).queryByText("Costo consuntivo")).not.toBeInTheDocument();
  });

  it("senza fasi invita a crearle", () => {
    stato.phases = [];
    render(<CronoprogrammaCommessa orderId="o" order={ordine} onOpenLavorazioni={() => {}} />);
    expect(screen.getByText(/servono le fasi di lavoro/)).toBeInTheDocument();
  });
});
