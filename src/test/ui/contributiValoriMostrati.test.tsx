// Il modulo mostrava 20% e 4% ma il dato restava vuoto: la ritenuta usciva a zero (09/11/2026).
import { useReducer } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EditorContributiRitenuteSection } from "@/pages/azienda/fatturazione/editor/EditorContributiRitenuteSection";
import { createEmptyRiga, editorReducer, type EditorState } from "@/pages/azienda/fatturazione/editor/useEditorState";

function Harness({ iniziale = {} }: { iniziale?: Partial<EditorState> }) {
  const [state, dispatch] = useReducer(editorReducer, {
    tipo: "fattura", stato: "bozza",
    righe: [{ ...createEmptyRiga(1), descrizione: "Lavori", quantita: 1, prezzo_unitario: 1000, imponibile: 1000, imposta: 220, totale_riga: 1220 }],
    ...iniziale,
  } as unknown as EditorState);
  return (
    <>
      <EditorContributiRitenuteSection state={state} dispatch={dispatch} />
      <pre data-testid="stato">{JSON.stringify(state)}</pre>
    </>
  );
}

const stato = () => JSON.parse(screen.getByTestId("stato").textContent ?? "{}");

function accendi(etichetta: string) {
  const riga = screen.getByText(etichetta).parentElement as HTMLElement;
  fireEvent.click(riga.querySelector('[role="switch"]') as HTMLElement);
}

describe("Contributi e ritenute: il valore mostrato è quello calcolato", () => {
  it("accendendo la ritenuta entra il 20% e l'importo si calcola", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Contributi e Ritenute"));
    accendi("Ritenuta d'acconto");
    const s = stato();
    expect(s.ritenuta_acconto).toBe(true);
    expect(s.ritenuta_aliquota).toBe(20);
    expect(s.ritenuta_importo).toBe(200);
    expect(s.ritenuta_tipo).toBe("RT01");
    expect(s.ritenuta_causale).toBe("A");
  });

  it("la cassa entra col 4% e il tipo mostrato", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Contributi e Ritenute"));
    accendi("Cassa previdenziale");
    const s = stato();
    expect(s.cassa_aliquota).toBe(4);
    expect(s.cassa_tipo).toBe("TC06");
    expect(s.cassa_importo).toBe(40);
  });

  it("non copre un'aliquota già scelta", () => {
    render(<Harness iniziale={{ ritenuta_aliquota: 4 }} />);
    fireEvent.click(screen.getByText("Contributi e Ritenute"));
    accendi("Ritenuta d'acconto");
    expect(stato().ritenuta_aliquota).toBe(4);
  });
});
