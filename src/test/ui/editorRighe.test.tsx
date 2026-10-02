import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useReducer } from "react";

vi.mock("@/hooks/useArticoliNative", () => ({ useArticoliNative: () => ({ data: [] as unknown[] }) }));

import { EditorRigheSection } from "@/pages/azienda/fatturazione/editor/EditorRigheSection";
import { createEmptyRiga, editorReducer } from "@/pages/azienda/fatturazione/editor/useEditorState";

function Harness() {
  const [state, dispatch] = useReducer(editorReducer as never, { tipo: "fattura", righe: [createEmptyRiga(1)] } as never) as [never, never];
  return (
    <>
      <EditorRigheSection state={state} dispatch={dispatch} />
      <pre data-testid="righe">{JSON.stringify((state as { righe: unknown[] }).righe.map((r: any) => [r.descrizione, r.aliquota_iva, r.categoria ?? ""]))}</pre>
    </>
  );
}

describe("riga dell'editor come in Fatture in Cloud", () => {
  it("mostra subito tutti i campi: codice, nome, quantità, U.M., prezzo, descrizione, sconto, IVA, importo, categoria", () => {
    render(<Harness />);
    for (const etichetta of ["Codice", "Nome prodotto", "Quantità", "U.M.", "Prezzo", "Descrizione", "Sconto %", "IVA", "Importo totale", "Categoria"]) {
      expect(screen.getByText(etichetta), etichetta).toBeTruthy();
    }
    expect(screen.getByText(/Articolo non imponibile/)).toBeTruthy();
    expect(screen.getByText(/Beni significativi/)).toBeTruthy();
  });

  it("la categoria resta sulla riga e non tocca il riferimento amministrazione", () => {
    render(<Harness />);
    fireEvent.change(screen.getAllByPlaceholderText("—")[0], { target: { value: "Infissi" } });
    expect(screen.getByTestId("righe").textContent).toContain("Infissi");
  });

  it("beni significativi, dal valore dei beni: nascono le righe al 10% e al 22%", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText(/Beni significativi/));
    fireEvent.click(screen.getByText("Ho il valore dei beni"));
    fireEvent.change(screen.getByPlaceholderText("es. Caldaia a condensazione 25 kW"), { target: { value: "Caldaia 25 kW" } });
    fireEvent.change(screen.getByPlaceholderText("2.000,00"), { target: { value: "2000" } });
    fireEvent.change(screen.getByPlaceholderText("800,00"), { target: { value: "800" } });
    fireEvent.click(screen.getByText("Aggiungi le righe"));
    const righe = JSON.parse(screen.getByTestId("righe").textContent ?? "[]") as unknown[][];
    const aliquote = righe.map((r) => r[1]);
    expect(aliquote).toContain("10");
    expect(aliquote).toContain("22");
    // Le altre prestazioni scritte nel popover diventano una riga vera.
    expect(righe.map((r) => r[0])).toContain("Manodopera e altre prestazioni");
  });

  it("beni significativi, dal prezzo concordato: il totale della fattura torna al centesimo (FPR 73/26)", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText(/Beni significativi/));
    fireEvent.change(screen.getByPlaceholderText("es. Caldaia a condensazione 25 kW"), { target: { value: "16 infissi + 1 portoncino" } });
    fireEvent.change(screen.getByPlaceholderText("27.500,00"), { target: { value: "27500" } });
    fireEvent.change(screen.getByPlaceholderText("800,00"), { target: { value: "11120" } });
    expect(screen.getByText("Valore dei beni significativi").parentElement?.textContent).toContain("13.608,52");
    expect(screen.queryByText(/non torna esatto/)).toBeNull();
    fireEvent.click(screen.getByText("Aggiungi le righe"));
    const righe = JSON.parse(screen.getByTestId("righe").textContent ?? "[]") as unknown[][];
    expect(righe.map((r) => r[0])).toContain("valore bene significativo (dm 29/12/1999) 13608.52");
    expect(righe.map((r) => r[0])).toContain("16 infissi + 1 portoncino — quota residua beni significativi");
  });
});

describe("righe chiuse come riepilogo", () => {
  it("una riga con nome sta chiusa e si riapre con un clic; una senza importo è ammessa", () => {
    render(<Harness />);
    fireEvent.change(screen.getAllByRole("textbox")[1], { target: { value: "PORTE" } });
    fireEvent.click(screen.getByLabelText("Chiudi riga"));
    expect(screen.getByText("PORTE")).toBeTruthy();
    expect(screen.queryByText("Nome prodotto")).toBeNull();
    fireEvent.click(screen.getByLabelText("Modifica la riga 1"));
    expect(screen.getByText("Nome prodotto")).toBeTruthy();
  });
});
