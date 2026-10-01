import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useReducer } from "react";

vi.mock("@/hooks/useArticoliNative", () => ({ useArticoliNative: () => ({ data: [] }) }));

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

  it("beni significativi: dal popover nascono le righe al 10% e al 22%", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText(/Beni significativi/));
    fireEvent.change(screen.getByPlaceholderText("es. Sostituzione caldaia"), { target: { value: "Sostituzione caldaia" } });
    fireEvent.change(screen.getByPlaceholderText("es. Caldaia a condensazione 25 kW"), { target: { value: "Caldaia 25 kW" } });
    fireEvent.change(screen.getByPlaceholderText("2.000,00"), { target: { value: "2000" } });
    fireEvent.change(screen.getByPlaceholderText("800,00"), { target: { value: "800" } });
    fireEvent.click(screen.getByText("Aggiungi le righe"));
    const aliquote = JSON.parse(screen.getByTestId("righe").textContent ?? "[]").map((r: unknown[]) => r[1]);
    expect(aliquote).toContain("10");
    expect(aliquote).toContain("22");
  });
});
