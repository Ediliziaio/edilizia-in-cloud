import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ComputoMisure from "@/components/computo/ComputoMisure";
import type { VoceEditor } from "@/lib/computo/editorNativo";

function Misure() {
  const [misure, setMisure] = useState<VoceEditor["misure"]>([]);
  return <ComputoMisure misure={misure} onChange={setMisure} />;
}

describe("inserimento misure responsive", () => {
  it("aggiunge, calcola e duplica una misura senza condividere i campi", () => {
    render(<Misure />);
    fireEvent.click(screen.getByRole("button", { name: "Misura" }));
    fireEvent.change(screen.getByLabelText("descrizione misura 1"), { target: { value: "Bagno" } });
    fireEvent.change(screen.getByLabelText("parti misura 1"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("lunghezza misura 1"), { target: { value: "3,5" } });
    expect(screen.getByLabelText("Quantità misura 1")).toHaveTextContent("7");
    fireEvent.click(screen.getByRole("button", { name: "Duplica misura 1" }));
    expect(screen.getByLabelText("descrizione misura 2")).toHaveValue("Bagno");
    fireEvent.change(screen.getByLabelText("lunghezza misura 2"), { target: { value: "4" } });
    expect(screen.getByLabelText("Quantità misura 1")).toHaveTextContent("7");
    expect(screen.getByLabelText("Quantità misura 2")).toHaveTextContent("8");
    fireEvent.click(screen.getByRole("button", { name: "Elimina misura 1" }));
    expect(screen.getByLabelText("lunghezza misura 1")).toHaveValue("4");
    expect(screen.queryByLabelText("lunghezza misura 2")).not.toBeInTheDocument();
  });
  it("Invio passa alla riga sotto; dall'ultima ne apre una nuova col cursore sul riferimento", () => {
    render(<Misure />);
    fireEvent.click(screen.getByRole("button", { name: "Misura" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi riga" }));
    fireEvent.keyDown(screen.getByLabelText("lunghezza misura 1"), { key: "Enter" });
    expect(screen.getByLabelText("lunghezza misura 2")).toHaveFocus();
    expect(screen.queryByLabelText("descrizione misura 3")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("lunghezza misura 2"), { key: "Enter" });
    expect(screen.getByLabelText("descrizione misura 3")).toHaveFocus();
  });
  it("somma le righe arrotondate e dice quando ne manca qualcuna", () => {
    render(<Misure />);
    fireEvent.click(screen.getByRole("button", { name: "Misura" }));
    fireEvent.change(screen.getByLabelText("lunghezza misura 1"), { target: { value: "5,5" } });
    fireEvent.change(screen.getByLabelText("altezza misura 1"), { target: { value: "5,55" } });
    expect(screen.getByLabelText("Quantità misura 1")).toHaveTextContent("30,53");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi riga" }));
    expect(screen.getByText("Righe da completare")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("formula misura 2"), { target: { value: "15,45*4,7" } });
    expect(screen.getByText(/Sommano/)).toHaveTextContent("Sommano 103,15");
  });
  it("usa la formula in alternativa alle dimensioni e segnala una formula non valida", () => {
    render(<Misure />);
    fireEvent.click(screen.getByRole("button", { name: "Misura" }));
    fireEvent.change(screen.getByLabelText("formula misura 1"), { target: { value: "2*(3+4)" } });
    expect(screen.getByLabelText("Quantità misura 1")).toHaveTextContent("14");
    expect(screen.getByLabelText("lunghezza misura 1")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("formula misura 1"), { target: { value: "1/0" } });
    expect(screen.getByLabelText("Quantità misura 1")).toHaveTextContent("Da completare");
    fireEvent.change(screen.getByLabelText("formula misura 1"), { target: { value: "" } });
    expect(screen.getByLabelText("lunghezza misura 1")).toBeEnabled();
  });
});
