import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import type { F24Entry } from "@/hooks/useF24";

const state = vi.hoisted(() => ({
  fail: false,
  entries: [] as F24Entry[],
  save: vi.fn(),
  preview: vi.fn(),
}));
vi.mock("@/hooks/useF24", () => ({
  TRIBUTI_PREDEFINITI: [],
  useF24: () => ({
    entries: state.entries,
    companyId: "demo",
    isLoading: false,
    isError: state.fail,
    canEdit: false,
    salva: state.save,
    anteprima: state.preview,
    isSalvando: false,
    scadentiProssimi30gg: [] as F24Entry[],
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useLiquidazioneIVA", () => ({
  useLiquidazioneIVA: () => ({}),
}));
vi.mock("@/components/contabilita/LiquidazioneIVA", () => ({
  LiquidazioneIVA: () => <p>Prospetto separato</p>,
}));
vi.mock("@/components/fatturazione/FiscalWorkspace", () => ({
  FiscalLegacyRedirect: (): null => null,
  FiscalStandaloneWorkspace: (): null => null,
}));
vi.mock("@/components/fatturazione/FiscalPeriodControl", () => ({
  FiscalPeriodControl: () => <p>Gestione mese separata</p>,
}));
import ContabilitaFiscale from "@/pages/azienda/ContabilitaFiscale";

function entry(id: string, mese: number | null, importo: number): F24Entry {
  return {
    id,
    company_id: "demo",
    anno: 2026,
    mese,
    tributo_code: id,
    tributo_descrizione: `Voce ${id}`,
    importo,
    stato: "da_pagare",
    data_scadenza: null,
    data_pagamento: null,
    note: null,
    pdf_url: null,
    created_at: "2026-10-01",
  };
}
function setup(period = "mese=10") {
  render(
    <MemoryRouter initialEntries={[`/?anno=2026&${period}`]}>
      <ContabilitaFiscale embedded />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  state.fail = false;
  state.entries = [
    entry("6001", 10, 100),
    entry("6002", 11, 200),
    entry("1040", null, 900),
  ];
  vi.clearAllMocks();
});
afterEach(cleanup);
it("separates annual unassigned records from the monthly total without writing", () => {
  setup();
  expect(
    screen.getByRole("group", { name: "Registrazioni da pagare nel periodo" }),
  ).toHaveTextContent("100,00");
  expect(
    screen.getByText(/1 registrazione del 2026 senza mese valido/),
  ).toBeVisible();
  expect(screen.queryByText("Voce 6002")).toBeNull();
  fireEvent.click(
    screen.getByText(/1 registrazione del 2026 senza mese valido/),
  );
  expect(screen.getByText(/Codice 1040/)).toBeVisible();
  expect(state.save).not.toHaveBeenCalled();
  expect(state.preview).not.toHaveBeenCalled();
});
it("uses the entire selected quarter, not the annual unassigned amount", () => {
  setup("periodo=trimestrale&trimestre=4&mese=10");
  expect(
    screen.getByRole("group", { name: "Registrazioni da pagare nel periodo" }),
  ).toHaveTextContent("300,00");
  expect(screen.getByText("Voce 6002")).toBeVisible();
  expect(state.save).not.toHaveBeenCalled();
});
it("does not turn failed queries into zero totals or unassigned records", () => {
  state.fail = true;
  setup();
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.queryByText(/Registrazioni da pagare nel periodo/)).toBeNull();
  expect(screen.queryByText(/senza mese valido/)).toBeNull();
});
