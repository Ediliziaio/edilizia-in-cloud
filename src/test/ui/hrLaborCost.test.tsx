import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FullLaborCostCalculator } from "@/components/hr/FullLaborCostCalculator";
import { CostoPersonaHr } from "@/components/hr/CostoPersonaHr";
import { HR_COST_FIELDS } from "@/lib/personale/laborCostPlan";

const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), permissions: { canViewPersone: true, canViewCosts: false, solaLettura: false, isLoading: false } }));
vi.mock("@/hooks/useOperai", () => ({ useCostoPersona: mocks.read, useSalvaCostoPersona: () => ({ mutate: mocks.save, isPending: false }), messaggioErroreOperai: (_e: unknown, s: string) => s, oggiRoma: () => "2026-10-13" }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => mocks.permissions }));
vi.mock("@/hooks/useHrLaborReconciliation", () => ({ useHrLaborReconciliation: () => ({ isPending: true }) }));
const cost = { ha_scheda_costo: true, costo_orario: 16, costo_orario_scritto: null as number | null, stipendio_lordo: 2000, ore_mese: 160, contributi_percento: 28 };
const values = { gross: "30000", employer: "9000", tfr: "2100", buildingFund: "3000", other: "1200", recoveries: "0", contractHours: "2080", nonProductiveHours: "320" };
const fill = () => HR_COST_FIELDS.forEach(([key, label]) => fireEvent.change(screen.getByLabelText(`${label}${key.includes("Hours") ? " (h)" : " (€)"}`), { target: { value: values[key] } }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); Object.assign(mocks.permissions, { canViewPersone: true, canViewCosts: false, solaLettura: false, isLoading: false }); mocks.read.mockReturnValue({ data: cost, isLoading: false, error: null }); });
describe("Calcolatore pieno in HR", () => {
  it("propone la tariffa ma non effettua un salvataggio automatico", () => {
    const propose = vi.fn(); render(<FullLaborCostCalculator onPropose={propose} />); fill();
    fireEvent.click(screen.getByRole("button", { name: "Usa questa tariffa nel campo costo", hidden: true }));
    expect(propose).toHaveBeenCalledWith(25.74); expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByText(/non questo prospetto annuo/)).toBeInTheDocument();
  });
  it("dati incompleti non propongono zero o una tariffa fittizia", () => {
    const propose = vi.fn(); render(<FullLaborCostCalculator onPropose={propose} />);
    fireEvent.click(screen.getByRole("button", { name: "Usa questa tariffa nel campo costo", hidden: true }));
    expect(screen.getByRole("alert", { hidden: true })).toBeInTheDocument(); expect(propose).not.toHaveBeenCalled();
  });
  it("sola lettura non può proporre la tariffa", () => {
    const propose = vi.fn(); render(<FullLaborCostCalculator onPropose={propose} disabled />);
    expect(screen.getByRole("button", { name: "Usa questa tariffa nel campo costo", hidden: true })).toBeDisabled();
  });
});
describe("Costo persona HR: salvataggio mirato e bozza protetta", () => {
  const view = () => render(<MemoryRouter><CostoPersonaHr profiloId="h" /></MemoryRouter>);
  it("carica senza loop e non abilita salvataggi di dati invariati", () => {
    view(); expect(screen.getByLabelText("Lordo al mese (€)")).toHaveValue("2000"); expect(screen.getByRole("button", { name: "Salva il costo" })).toBeDisabled();
  });
  it("scrivere solo la tariffa non riscrive stipendio, ore o contributi", () => {
    view(); fireEvent.change(screen.getByLabelText("Oppure costo orario (€)"), { target: { value: "25,74" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva il costo" }));
    expect(mocks.save).toHaveBeenCalledWith({ costo_orario: "25,74" }, expect.any(Object));
  });
  it("decorrenza: la data passata va col costo, oggi non si manda", () => {
    view(); expect(screen.queryByLabelText("Vale dal")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Oppure costo orario (€)"), { target: { value: "26" } });
    expect(screen.getByLabelText("Vale dal")).toHaveValue("2026-10-13");
    fireEvent.change(screen.getByLabelText("Vale dal"), { target: { value: "2026-10-01" } });
    expect(screen.getByText(/I rapportini dal .* prendono il costo nuovo/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salva il costo" }));
    expect(mocks.save).toHaveBeenCalledWith({ costo_orario: "26", decorrenza: "2026-10-01" }, expect.any(Object));
  });
  it("mostra da quando vale il costo e i rapportini approvati rimasti col costo di prima", () => {
    mocks.read.mockReturnValue({ data: { ...cost, valido_dal: "2026-10-01", costo_precedente: 14, rapportini_col_costo_di_prima: 3 }, isLoading: false, error: null });
    view();
    expect(screen.getByText(/Costo in vigore dal/)).toBeInTheDocument();
    expect(screen.getByText(/3 rapportini già approvati da quella data hanno ancora il costo di prima/)).toBeInTheDocument();
  });
  it("refresh remoti non cancellano una bozza; bloccano la sovrascrittura", async () => {
    const { rerender } = view(); fireEvent.change(screen.getByLabelText("Oppure costo orario (€)"), { target: { value: "25,74" } });
    mocks.read.mockReturnValue({ data: { ...cost, costo_orario_scritto: 30, costo_orario: 30 }, isLoading: false, error: null });
    rerender(<MemoryRouter><CostoPersonaHr profiloId="h" /></MemoryRouter>);
    expect(screen.getByLabelText("Oppure costo orario (€)")).toHaveValue("25,74"); expect(screen.getByRole("button", { name: "Salva il costo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Rileggi e scarta la bozza" }));
    await waitFor(() => expect(screen.getByLabelText("Oppure costo orario (€)")).toHaveValue("30"));
  });
  it("rispetta la sola lettura anche sulla scheda HR", () => {
    mocks.permissions.solaLettura = true; view();
    expect(screen.getByLabelText("Lordo al mese (€)")).toBeDisabled(); expect(screen.getByRole("button", { name: "Salva il costo" })).toBeDisabled();
  });
  it("senza permesso HR non mostra dati riservati presenti in cache", () => {
    mocks.permissions.canViewPersone = false; view(); expect(screen.queryByText("Costo per le commesse")).not.toBeInTheDocument();
  });
  it("errore di lettura non diventa un costo vuoto editabile", () => {
    mocks.read.mockReturnValue({ data: undefined, isLoading: false, error: new Error("offline") }); view();
    expect(screen.getByRole("alert")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Salva il costo" })).not.toBeInTheDocument();
  });
});
