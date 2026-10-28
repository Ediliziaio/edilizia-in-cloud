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
    fireEvent.click(screen.getByRole("button", { name: "Misura", exact: true }));
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
  it("usa la formula in alternativa alle dimensioni e segnala una formula non valida", () => {
    render(<Misure />);
    fireEvent.click(screen.getByRole("button", { name: "Misura", exact: true }));
    fireEvent.change(screen.getByLabelText("formula misura 1"), { target: { value: "2*(3+4)" } });
    expect(screen.getByLabelText("Quantità misura 1")).toHaveTextContent("14");
    expect(screen.getByLabelText("lunghezza misura 1")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("formula misura 1"), { target: { value: "1/0" } });
    expect(screen.getByLabelText("Quantità misura 1")).toHaveTextContent("Da completare");
    fireEvent.change(screen.getByLabelText("formula misura 1"), { target: { value: "" } });
    expect(screen.getByLabelText("lunghezza misura 1")).toBeEnabled();
  });
});
