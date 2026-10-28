import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DocumentoTecnicoPos,
  FontiTecnicheScheda,
} from "../../../supabase/functions/_shared/posFontiTecniche";
const s = vi.hoisted(() => ({
  allowed: true,
  readonly: false,
  error: false,
  rows: [] as unknown[],
  open: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSicurezzaCantiere: s.allowed,
    solaLettura: s.readonly,
  }),
}));
vi.mock("@/hooks/useDocumentiTecniciPos", () => ({
  useDocumentiTecniciPos: () => ({
    data: { documenti: s.rows },
    isLoading: false,
    isFetching: false,
    isError: s.error,
    refetch: s.read,
  }),
  apriDocumentoTecnicoPos: (...v: unknown[]) => s.open(...v),
}));
import { FontiSchedaTecnicaPos } from "@/components/sicurezza/pos/FontiSchedaTecnicaPos";
import { normalizzaDocumentoTecnico } from "../../../supabase/functions/_shared/posFontiTecniche";
const doc = (): DocumentoTecnicoPos =>
  normalizzaDocumentoTecnico({
    id: "11111111-1111-4111-8111-111111111111",
    order_id: "ordine",
    tipo: "attrezzatura",
    titolo: "TEST Manuale",
    file_name: "manuale.pdf",
    revisione: "1",
    data_rilascio: "2026-10-01",
    stato: "verificato",
    disponibile: true,
    confermata: false,
    impronta: "a".repeat(64),
  });
function Harness({
  tipo = "rischio",
  initial,
  ro = false,
}: {
  tipo?: "rischio" | "attrezzatura";
  initial?: FontiTecnicheScheda;
  ro?: boolean;
}) {
  const [f, set] = useState(initial);
  return (
    <>
      <FontiSchedaTecnicaPos
        id="r1"
        tipo={tipo}
        companyId="azienda"
        orderId="ordine"
        dal="2026-11-01"
        al="2026-11-30"
        ro={ro}
        value={f}
        onChange={set}
      />
      <output data-testid="fonte">{JSON.stringify(f)}</output>
    </>
  );
}
beforeEach(() => {
  s.allowed = true;
  s.readonly = false;
  s.error = false;
  s.rows = [doc()];
  s.open.mockReset();
  s.read.mockReset();
});
afterEach(cleanup);
describe("Selezione fonti tecniche", () => {
  it("collega una versione congelata senza confermare la pertinenza automaticamente", () => {
    render(<Harness />);
    fireEvent.change(
      screen.getByLabelText("Fonte rischio: documenti o dichiarazione"),
      { target: { value: "documenti" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Scegli dal fascicolo tecnico" }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Documento tecnico r1" }),
      { target: { value: doc().id } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Collega versione selezionata" }),
    );
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByTestId("fonte").textContent).toContain(
      '"impronta":"' + "a".repeat(64) + '"',
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByTestId("fonte").textContent).toContain(
      '"confermata":true',
    );
  });
  it("rilettura diversa segnala il cambiamento e mantiene la fotografia selezionata", () => {
    const r = render(
      <Harness
        initial={{
          modalita: "documenti",
          motivazione: "",
          documenti: [{ ...doc(), confermata: true }],
        }}
      />,
    );
    s.rows = [{ ...doc(), impronta: "b".repeat(64) }];
    r.rerender(
      <Harness
        initial={{ modalita: "documenti", motivazione: "", documenti: [doc()] }}
      />,
    );
    expect(
      screen.getByText(/Fonte cambiata o non più disponibile/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("fonte").textContent).toContain("a".repeat(64));
  });
  it("errore di lettura non viene mostrato come archivio vuoto", () => {
    s.error = true;
    render(
      <Harness
        initial={{ modalita: "documenti", motivazione: "", documenti: [] }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Scegli dal fascicolo tecnico" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Documenti non disponibili",
    );
    expect(
      screen.getByRole("button", { name: "Collega versione selezionata" }),
    ).toBeDisabled();
  });
  it("distingue il testo POS dall'originale allegato e conserva visibili i documenti da risolvere", () => {
    render(
      <Harness
        initial={{ modalita: "documenti", motivazione: "", documenti: [doc()] }}
      />,
    );
    fireEvent.change(
      screen.getByLabelText("Fonte rischio: documenti o dichiarazione"),
      { target: { value: "testo_pos" } },
    );
    expect(
      screen.getByText(/senza documento originale allegato/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rimuovi documento 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Motiva la fonte della valutazione nel POS"),
    ).toHaveValue("");
  });
  it("non espone dati senza permesso e in sola lettura non propone nuovi collegamenti", () => {
    s.allowed = false;
    const r = render(
      <Harness
        initial={{ modalita: "documenti", motivazione: "", documenti: [doc()] }}
      />,
    );
    expect(
      screen.queryByText(/TEST Manuale/, { selector: "p" }),
    ).not.toBeInTheDocument();
    s.allowed = true;
    s.readonly = true;
    r.rerender(
      <Harness
        initial={{ modalita: "documenti", motivazione: "", documenti: [doc()] }}
      />,
    );
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Scegli dal fascicolo tecnico" }),
    ).not.toBeInTheDocument();
  });
});
