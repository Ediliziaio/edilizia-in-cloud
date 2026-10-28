import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TecnicaLavorazionePos } from "@/components/sicurezza/pos/TecnicaLavorazionePos";
import {
  lavorazioneVuota,
  posVuoto,
  type PosContenuto,
} from "../../../supabase/functions/_shared/posModello";
import {
  invalidaRiesameTecnico,
  tecnicaPosVuota,
} from "../../../supabase/functions/_shared/posTecnica";
function Harness({ readonly = false }: { readonly?: boolean }) {
  const [p, set] = useState(() => {
    const p = posVuoto();
    p.versione_tecnica = 1;
    p.lavorazioni = [{ ...lavorazioneVuota("l"), tecnica: tecnicaPosVuota() }];
    return p;
  });
  const modifica = (fn: (p: PosContenuto) => void) =>
    set((old) => {
      const next = structuredClone(old);
      fn(next);
      invalidaRiesameTecnico(old, next);
      return next;
    });
  return (
    <>
      <TecnicaLavorazionePos d={p} n={0} ro={readonly} modifica={modifica} />
      <output data-testid="stato">
        {JSON.stringify(p.lavorazioni[0].tecnica)}
      </output>
    </>
  );
}
afterEach(cleanup);
describe("Schede tecniche nel POS", () => {
  it("non inventa valutazioni e consente rischi distinti con campi indipendenti", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText(/Rischi, misure e valutazioni/));
    fireEvent.click(
      screen.getByRole("button", { name: "Aggiungi rischio specifico" }),
    );
    expect(
      screen.getByLabelText(
        "Valutazione iniziale e metodo adottato · rischio 1",
      ),
    ).toHaveValue("");
    fireEvent.change(
      screen.getByLabelText("Pericolo e evento temuto · rischio 1"),
      { target: { value: "TEST pericolo" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Aggiungi rischio specifico" }),
    );
    expect(
      screen.getByLabelText("Pericolo e evento temuto · rischio 2"),
    ).toHaveValue("");
    expect(screen.getByTestId("stato").textContent).toContain("TEST pericolo");
  });
  it("riesame esplicito viene revocato dopo una modifica tecnica", () => {
    render(<Harness />);
    const c = screen.getByRole("checkbox");
    fireEvent.click(c);
    expect(c).toBeChecked();
    fireEvent.change(screen.getByLabelText("Area di lavoro e accessi"), {
      target: { value: "TEST area" },
    });
    expect(c).not.toBeChecked();
    fireEvent.click(c);
    expect(c).toBeChecked();
  });
  it("attrezzature reali richiedono identificazione e riferimenti, nessuna richiede un motivo", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText(/Attrezzature e opere provvisionali/));
    fireEvent.change(
      screen.getByLabelText(
        "Sono previste attrezzature, macchine, impianti o opere provvisionali?",
      ),
      { target: { value: "si" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Aggiungi attrezzatura effettiva" }),
    );
    expect(
      screen.getByLabelText(
        "Identificazione dell’attrezzatura effettiva · attrezzatura 1",
      ),
    ).toHaveValue("");
    fireEvent.change(
      screen.getByLabelText(
        "Sono previste attrezzature, macchine, impianti o opere provvisionali?",
      ),
      { target: { value: "no" } },
    );
    expect(
      screen.getByLabelText("Motivo dell’assenza di attrezzature"),
    ).toHaveValue("");
    expect(screen.getByTestId("stato").textContent).toContain(
      '"attrezzature":[{',
    );
  });
  it("sola lettura non permette aggiunte, conferme o modifica dei testi", () => {
    render(<Harness readonly />);
    expect(
      screen.queryByRole("button", { name: "Aggiungi rischio specifico" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Area di lavoro e accessi")).toHaveAttribute(
      "readonly",
    );
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
  it("la componente non scrive neppure se riceve un evento in sola lettura", () => {
    const p = posVuoto();
    p.versione_tecnica = 1;
    p.lavorazioni = [lavorazioneVuota("l")];
    const change = vi.fn();
    render(<TecnicaLavorazionePos d={p} n={0} ro modifica={change} />);
    fireEvent.change(screen.getByLabelText("Area di lavoro e accessi"), {
      target: { value: "NON SALVARE" },
    });
    expect(change).not.toHaveBeenCalled();
  });
});

// Exercise the actual section controls as well as the isolated technical form.
import { SezioneLavorazioni } from "@/components/sicurezza/pos/PosSezioni";
function SezioneHarness() {
  const [d, set] = useState(() => {
    const p = posVuoto();
    p.lavorazioni = [
      { ...lavorazioneVuota("l"), rischi: "TEST riepilogo precedente" },
    ];
    return p;
  });
  const modifica = (fn: (p: PosContenuto) => void) =>
    set((old) => {
      const next = structuredClone(old);
      fn(next);
      invalidaRiesameTecnico(old, next);
      return next;
    });
  return (
    <>
      <SezioneLavorazioni
        d={d}
        modifica={modifica}
        ro={false}
        mancanti={0}
        contesto={null}
        onProponiAi={() => {}}
        proponendo={false}
      />
      <output data-testid="contenuto">{JSON.stringify(d)}</output>
    </>
  );
}
describe("Adozione e duplicazione dalla sezione lavorazioni", () => {
  it("l’attivazione conserva i riepiloghi precedenti e richiede un nuovo riesame", () => {
    render(<SezioneHarness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Attiva schede tecniche" }),
    );
    expect(screen.getByTestId("contenuto").textContent).toContain(
      '"versione_tecnica":1',
    );
    expect(screen.getByLabelText("Rischi")).toHaveValue(
      "TEST riepilogo precedente",
    );
    expect(
      screen.getByRole("checkbox", { name: /Ho riesaminato rischi/ }),
    ).not.toBeChecked();
  });
  it("duplica l’intera scheda tecnica senza ereditare la conferma", () => {
    render(<SezioneHarness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Attiva schede tecniche" }),
    );
    const c = screen.getByRole("checkbox", { name: /Ho riesaminato rischi/ });
    fireEvent.click(c);
    expect(c).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Duplica" }));
    const p = JSON.parse(screen.getByTestId("contenuto").textContent || "{}");
    expect(p.lavorazioni).toHaveLength(2);
    expect(p.lavorazioni[0].tecnica.riesaminata).toBe(true);
    expect(p.lavorazioni[1].tecnica.riesaminata).toBe(false);
    expect(p.lavorazioni[1].verificata).toBe(false);
  });
});
