import "@testing-library/jest-dom/vitest";
import {cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {CronoprogrammaCommessa} from "@/components/orders/CronoprogrammaCommessa";
const m = vi.hoisted(() => ({mobile: false, costs: false, amounts: false, loading: false, phaseError: false, reportError: false, phases: [] as object[], reports: [] as object[], refetchPhases: vi.fn(), refetchReports: vi.fn()}));
vi.mock("@/hooks/use-mobile", () => ({useIsMobile: () => m.mobile}));
vi.mock("@/hooks/usePermissions", () => ({usePermissions: () => ({canViewCosts: m.costs, canViewOrderAmounts: m.amounts})}));
vi.mock("@/hooks/useOrderWorkPhases", () => ({useOrderWorkPhases: () => ({phases: m.phases, materials: [] as unknown[], allAssignments: [] as unknown[], isLoading: m.loading, isError: m.phaseError, refetch: m.refetchPhases})}));
vi.mock("@/hooks/useCalendarioCantiere", () => ({ useCalendarioCantiere: () => ({ lavorativo: () => true, sabato: false, setSabato: () => {} }) }));
vi.mock("@/hooks/useSottofasi", () => ({useSottofasi: () => ({perFase: new Map()})}));
vi.mock("@/hooks/useCronoprogramma", () => ({useCronoprogramma: () => ({rapportini: m.reports, firmaPreventivo: null as null, isLoading: false, isError: m.reportError, refetch: m.refetchReports})}));
vi.mock("@/hooks/useCostiMaterialiFasi", () => ({useCostiMaterialiFasi: () => ({data: undefined as undefined})}));
vi.mock("@/hooks/useVociPrevisteFasi", () => ({ useVociPrevisteFasi: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useAvanzamentoCommessa", () => ({useAvanzamentoCommessa: () => ({daMostrare: (n: number) => n})}));
const order = {created_at: "2025-12-15", work_start_date: "2025-03-25", work_end_date: "2025-05-10", expected_date: "2026-03-15"};
const phase = (extra = {}) => ({id: "f", name: "Allestimento e demolizioni", status: "completata", percentuale: 0, start_date: "2025-03-25", end_date: "2025-03-30", completata_il: "2026-10-09", ...extra});
beforeEach(() => {vi.clearAllMocks(); m.mobile = false; m.costs = false; m.amounts = false; m.loading = false; m.phaseError = false; m.reportError = false; m.phases = [phase()]; m.reports = [];});
afterEach(cleanup);
const draw = (onOpenLavorazioni = vi.fn()) => render(<CronoprogrammaCommessa orderId="o" order={order} onOpenLavorazioni={onOpenLavorazioni} />);
describe("cronoprogramma utilizzabile senza alterare dati", () => {
  it("mostra un lavoro completato senza un falso allarme aperto di 558 giorni", () => {
    draw(); expect(screen.getByText("Lavori completati · 1/1 fasi")).toBeInTheDocument();
    expect(screen.queryByText(/1 fase in ritardo/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 fase chiusa oltre/)).toBeInTheDocument();
    expect(screen.getByText(/Periodo visualizzato: 22\/03\/2025 → 13\/05\/2025/)).toBeInTheDocument();
  });
  it("mostra la chiusura senza inventare un intervallo reale", () => {
    draw(); expect(screen.getByTestId("chiusura-f")).toHaveTextContent("09/10/2026");
    expect(screen.queryByTestId("reale-f")).not.toBeInTheDocument(); expect(screen.queryByTestId("oltre-f")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: /Allestimento e demolizioni:/}));
    expect(screen.getByText(/Chiusura registrata 09\/10\/2026 · inizio non rilevato/)).toBeInTheDocument();
  });
  it("il confronto include le date reali e non allunga i lavori chiusi fino a oggi", () => {
    draw(); fireEvent.click(screen.getByRole("button", {name: "Mostra tutto il confronto"}));
    expect(screen.getByText(/Periodo visualizzato: 22\/03\/2025 → 12\/10\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Mostra tutto il confronto"})).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Previsto e reale"})).toHaveAttribute("aria-pressed", "true");
  });
  it("da telefono usa una vera agenda, senza Gantt o selettori di scala inutili", () => {
    m.mobile = true; draw();
    expect(screen.queryByRole("region", {name: /Grafico delle fasi/})).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", {name: "Scala del cronoprogramma"})).not.toBeInTheDocument();
    expect(screen.getByText("Allestimento e demolizioni", {selector: "h3"})).toBeInTheDocument();
    expect(screen.getByText("Chiusura 09/10/2026 · inizio non rilevato")).toBeInTheDocument();
    expect(screen.getByText("Dettagli della fase").closest("details")).not.toHaveAttribute("open");
  });
  it("permette tabella e cambio scala senza cambiare commessa o inviare mutation", () => {
    draw(); fireEvent.change(screen.getByRole("combobox", {name: "Scala del cronoprogramma"}), {target: {value: "settimane"}});
    expect(screen.getByRole("combobox", {name: "Scala del cronoprogramma"})).toHaveValue("settimane");
    // «Elenco fasi» non c'è più (31/10/2026): si passa dal grafico alla tabella.
    expect(screen.queryByRole("button", {name: "Elenco fasi"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Tabella"}));
    expect(screen.queryByRole("region", {name: /Grafico delle fasi/})).not.toBeInTheDocument();
    expect(screen.getByRole("table", {name: "Tabella del cronoprogramma"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Scarica PDF"})).toBeInTheDocument();
    expect(m.refetchPhases).not.toHaveBeenCalled(); expect(m.refetchReports).not.toHaveBeenCalled();
  });
  it("non espone costi o venduto senza il relativo permesso", () => {
    m.mobile = true; draw();
    expect(screen.queryByText("Costo previsto")).not.toBeInTheDocument(); expect(screen.queryByText("Venduto")).not.toBeInTheDocument();
  });
  it("un errore sui rapportini non diventa un consuntivo vuoto e Riprova li ricarica", () => {
    m.reportError = true; draw(); expect(screen.queryByRole("region", {name: "Cronoprogramma della commessa"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Riprova"})); expect(m.refetchPhases).toHaveBeenCalledOnce(); expect(m.refetchReports).toHaveBeenCalledOnce();
  });
  it("mantiene fasi senza date in agenda e manda la pianificazione all'editor esistente", () => {
    m.mobile = true; m.phases = [phase({start_date: null, end_date: null, completata_il: null})]; const open = vi.fn(); draw(open);
    expect(screen.getByText("Inizio da definire → Fine da definire")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Gestisci fasi e date"})); expect(open).toHaveBeenCalledOnce();
  });
  it("un rapportino inviato porta l'inizio reale senza completare la fase", () => {
    m.phases = [phase({status: "in_corso", completata_il: null, percentuale: 40, start_date: "2026-10-01", end_date: "2026-12-01"})];
    m.reports = [{data_lavoro: "2026-10-12", stato: "inviato", fasi_lavorate: [{phase_id: "f", ore: 8}]}]; draw();
    fireEvent.click(screen.getByRole("button", {name: /Allestimento e demolizioni:/}));
    expect(screen.getByText(/dal 12\/10\/2026, in corso/)).toBeInTheDocument();
    expect(screen.getByText(/8 h dichiarate/)).toBeInTheDocument(); expect(screen.queryByText(/Lavori completati ·/)).not.toBeInTheDocument();
  });
  it("un cantiere ancora aperto parte dal confronto, con oggi raggiungibile", () => {
    m.phases = [phase({status: "in_corso", completata_il: null, percentuale: 40})]; draw();
    expect(screen.getByRole("button", {name: "Previsto e reale"})).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", {name: "Vai a oggi"})).toBeInTheDocument();
    expect(screen.getByText(/1 fase in ritardo/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Periodo previsto"}));
    expect(screen.getByRole("button", {name: "Periodo previsto"})).toHaveAttribute("aria-pressed", "true");
  });
  it("un cantiere privo di fasi ha un invito operativo e non uno 0% ingannevole", () => {
    m.phases = []; draw(); expect(screen.getByRole("button", {name: "Vai alle lavorazioni"})).toBeInTheDocument();
    expect(screen.queryByText(/Nessun ritardo/)).not.toBeInTheDocument();
  });
  it("le date incoerenti restano visibili e non generano barre reali arbitrarie", () => {
    m.mobile = true; m.phases = [phase({start_date: "2025-04-20"})]; draw();
    const card = screen.getByText("Allestimento e demolizioni", {selector: "h3"}).closest("article")!;
    expect(within(card).getByText("Verifica le date della fase.")).toBeInTheDocument();
    expect(screen.queryByText(/Scostamento storico: \+/)).not.toBeInTheDocument();
  });
});
