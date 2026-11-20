import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LogoSizeControl } from "@/components/shared/LogoSizeControl";

afterEach(cleanup);
function Editor({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState(100);
  return <><LogoSizeControl value={value} onChange={setValue} disabled={disabled} /><output aria-label="Misura scelta">{value}</output></>;
}

describe("regolazione delle dimensioni del logo", () => {
  it("barra e numero cambiano la misura subito e Standard ripristina il 100%", () => {
    render(<Editor />);
    fireEvent.change(screen.getByRole("slider", { name: "Dimensione del logo" }), { target: { value: "175" } });
    expect(screen.getByLabelText("Misura scelta")).toHaveTextContent("175");
    expect(screen.getByRole("spinbutton")).toHaveValue(175);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "85" } });
    expect(screen.getByRole("slider")).toHaveValue("85");
    fireEvent.click(screen.getByRole("button", { name: "Standard" }));
    expect(screen.getByRole("slider")).toHaveValue("100");
  });
  it("consente di scrivere un numero in più passaggi e contiene i valori fuori intervallo", () => {
    render(<Editor />);
    const numero = screen.getByRole("spinbutton");
    fireEvent.change(numero, { target: { value: "" } });
    fireEvent.change(numero, { target: { value: "1" } });
    expect(screen.getByLabelText("Misura scelta")).toHaveTextContent("100");
    fireEvent.change(numero, { target: { value: "150" } });
    expect(screen.getByLabelText("Misura scelta")).toHaveTextContent("150");
    fireEvent.change(numero, { target: { value: "999" } });
    fireEvent.blur(numero);
    expect(numero).toHaveValue(250);
    fireEvent.change(numero, { target: { value: "-10" } });
    fireEvent.blur(numero);
    expect(numero).toHaveValue(25);
  });
  it("disabilita tutti i comandi quando il logo è nascosto o il modello è in sola lettura", () => {
    render(<Editor disabled />);
    expect(screen.getByRole("slider")).toBeDisabled();
    expect(screen.getByRole("spinbutton")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Standard" })).toBeDisabled();
  });
});
