import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CostoLavorazioneEditor } from "@/components/settings/CostoLavorazioneEditor";
import { AreeManodopera } from "@/components/settings/AreeManodopera";
import { leggiCostoLavorazione } from "@/lib/tariffe/costoLavorazione";
afterEach(cleanup);
function Editor() {
  const [value, setValue] = useState(leggiCostoLavorazione(null));
  const [manuale, setManuale] = useState("80");
  return <CostoLavorazioneEditor value={value} onChange={setValue} costoManuale={manuale} onCostoManuale={setManuale} unita="pz" dipendenti={[{ id: "1", first_name: "Operatore", last_name: "Demo", costo_orario: 30 }]} />;
}
describe("Scelta del costo di esecuzione", () => {
  it("calcola e conserva i due scenari quando si cambia modalità", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Squadra interna" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi operatore / qualifica" }));
    fireEvent.change(screen.getByLabelText("Numero operatori 1"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Ore per operatore 1"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Costo orario operatore 1"), { target: { value: "25" } });
    expect(screen.getByRole("status")).toHaveTextContent("150,00");
    fireEvent.change(screen.getByLabelText("Costo subappalto"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Subappalto" }));
    expect(screen.getByRole("status")).toHaveTextContent("120,00");
    fireEvent.click(screen.getByRole("button", { name: "Squadra interna" }));
    expect(screen.getByRole("status")).toHaveTextContent("150,00");
    fireEvent.click(screen.getByRole("button", { name: "Costo diretto" }));
    expect(screen.getByRole("status")).toHaveTextContent("80,00");
  });
  it("copia solo il costo orario scelto dall'anagrafica", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Squadra interna" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi operatore / qualifica" }));
    fireEvent.change(screen.getByLabelText("Dipendente per operatore 1"), { target: { value: "1" } });
    expect(screen.getByLabelText("Nome operatore 1")).toHaveValue("Operatore Demo");
    expect(screen.getByLabelText("Costo orario operatore 1")).toHaveValue(30);
    expect(screen.getByRole("status")).toHaveTextContent("Completa i dati");
  });
  it("rende raggiungibili tutte le aree e mantiene comuni separate", () => {
    const onChange = vi.fn();
    render(<AreeManodopera tariffe={[{ vertical_associato: "bagno" }, { vertical_associato: null as null }]} value="all" onChange={onChange} />);
    const aree = within(screen.getByRole("group", { name: "Aree della manodopera" }));
    fireEvent.click(aree.getByRole("button", { name: /Bagni/ }));
    expect(onChange).toHaveBeenCalledWith("area:bagni");
    expect(aree.getByRole("button", { name: /Comuni \/ non assegnate/ })).toHaveTextContent("1");
    expect(aree.getAllByRole("button").length).toBeGreaterThanOrEqual(12);
  });
});
