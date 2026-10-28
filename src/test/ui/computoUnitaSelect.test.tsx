import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ComputoUnitaSelect from "@/components/computo/ComputoUnitaSelect";

function Editor({ initial = "mq" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <><ComputoUnitaSelect value={value} onChange={setValue} /><output aria-label="Unità salvata">{value}</output></>;
}
beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
describe("unità del computo", () => {
  it("seleziona metri cubi e ore senza trasformarli in corpo", async () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("combobox", { name: "Unità di misura" }));
    fireEvent.click(await screen.findByRole("option", { name: "mc - Metri cubi", exact: true }));
    expect(screen.getByLabelText("Unità salvata")).toHaveTextContent("mc");
    fireEvent.click(screen.getByRole("combobox", { name: "Unità di misura" }));
    fireEvent.click(await screen.findByRole("option", { name: "h - Ore", exact: true }));
    expect(screen.getByLabelText("Unità salvata")).toHaveTextContent("h");
  });
  it("conserva un'unità fuori elenco e consente di modificarla o tornare a una standard", async () => {
    render(<Editor initial="m³/ora" />);
    expect(screen.getByLabelText("Unità personalizzata")).toHaveValue("m³/ora");
    fireEvent.change(screen.getByLabelText("Unità personalizzata"), { target: { value: "lotto" } });
    expect(screen.getByLabelText("Unità salvata")).toHaveTextContent("lotto");
    fireEvent.click(screen.getByRole("combobox", { name: "Unità di misura" }));
    fireEvent.click(await screen.findByRole("option", { name: "cad - Cadauno", exact: true }));
    expect(screen.getByLabelText("Unità salvata")).toHaveTextContent("cad");
    expect(screen.queryByLabelText("Unità personalizzata")).not.toBeInTheDocument();
  });
});
