import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { BonificoParlanteFields } from "@/components/fatturazione/BonificoParlanteFields";
import { nuovoBonificoForm } from "@/lib/fatturazione/bonificiParlanti";
import type { RitenutaBonifico } from "@/lib/fatturazione/bonificiParlanti";
const state = vi.hoisted(() => ({
  fail: false,
  canEdit: true,
  mutate: vi.fn(),
  rows: [] as RitenutaBonifico[],
}));
vi.mock("@/hooks/useRitenuteBonifici", () => ({
  useRitenuteBonifici: () => ({
    data: state.rows,
    isLoading: false,
    isError: state.fail,
    canEdit: state.canEdit,
    refetch: vi.fn(),
    mutation: { mutate: state.mutate, isPending: false },
  }),
}));
import RitenuteBonificiPanel from "@/components/fatturazione/RitenuteBonificiPanel";
beforeEach(() => {
  state.fail = false;
  state.canEdit = true;
  state.mutate.mockReset();
  state.rows = [
    {
      id: "r1",
      company_id: "demo",
      documento_id: "d1",
      movimento_id: "m1",
      numero_fattura: "TEST/26",
      data_accredito: "2026-10-01",
      lordo: 11000,
      ritenuta: 991.8,
      commissioni: 2,
      netto: 10006.2,
      banca: "Banca prova",
      riferimento: "TRN-123",
      stato: "verificata",
      certificazione: null,
      motivo_storno: null,
      revisione: 1,
      aliquota_prevista: 11,
      ritenuta_prevista: 991.8,
    },
  ];
});
afterEach(cleanup);
function panel() {
  render(
    <MemoryRouter initialEntries={["/?anno=2026&mese=10"]}>
      <RitenuteBonificiPanel />
    </MemoryRouter>,
  );
}
it("requires review after a proposal and resets review when actual amounts change", () => {
  function Form() {
    const [v, set] = useState({ ...nuovoBonificoForm(), banca: "Banca prova" });
    return (
      <BonificoParlanteFields
        lordo={11000}
        data="2026-10-01"
        riferimento="TRN-123"
        value={v}
        onChange={set}
      />
    );
  }
  render(<Form />);
  expect(screen.getByRole("checkbox")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Usa come proposta" }));
  expect(screen.getByLabelText("Ritenuta effettiva €")).toHaveValue(991.8);
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("checkbox")).toBeChecked();
  fireEvent.change(screen.getByLabelText("Commissioni trattenute €"), {
    target: { value: "2" },
  });
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByRole("checkbox")).toBeDisabled();
});
it("does not turn an unavailable backend into zero taxes or an empty register", () => {
  state.fail = true;
  panel();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Registro non disponibile",
  );
  expect(
    screen.queryByRole("group", { name: "Ritenute verificate nel periodo" }),
  ).not.toBeInTheDocument();
});
it("requires reference and confirmation before certification or reversal", () => {
  panel();
  expect(
    screen.getByRole("group", { name: "Ritenute verificate nel periodo" }),
  ).toHaveTextContent("991,80");
  fireEvent.click(
    screen.getByRole("button", { name: "Riscontra certificazione" }),
  );
  expect(screen.getByRole("button", { name: "Conferma" })).toBeDisabled();
  fireEvent.change(
    screen.getByLabelText("Riferimento della certificazione verificata"),
    { target: { value: "Certificazione annuale banca, pagina 3" } },
  );
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
  expect(state.mutate).toHaveBeenCalledWith(
    expect.objectContaining({ id: "r1", revisione: 1, azione: "certifica" }),
    expect.anything(),
  );
});
it("excludes reversed receipts from totals and never offers write controls read-only", () => {
  state.rows[0].stato = "stornata";
  state.canEdit = false;
  panel();
  expect(
    screen.getByRole("group", { name: "Ritenute verificate nel periodo" }),
  ).toHaveTextContent("0,00");
  expect(screen.queryByRole("button", { name: "Storna" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Riscontra certificazione" }),
  ).toBeNull();
});
