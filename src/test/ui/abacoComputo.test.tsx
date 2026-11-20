import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TabellaAbaco } from "@/components/orders/materiali/AbacoComputo";
import { abacoDalComputo } from "@/lib/distinta/abacoComputo";
import { vociGenzano } from "../support/vociGenzano";
afterEach(cleanup);
describe("abaco consultabile nella commessa", () => {
  it("mostra misure documentali e minimi separati e filtra i vani da rilevare", () => {
    render(<TabellaAbaco righe={abacoDalComputo(vociGenzano())} />);
    expect(screen.getByText(/154 righe di abaco/)).toHaveTextContent("100 righe con dimensioni · 54 da rilevare");
    expect(screen.getAllByRole("row")).toHaveLength(155);
    fireEvent.click(screen.getByRole("checkbox", { name: "Solo dimensioni mancanti" }));
    expect(screen.getAllByRole("row")).toHaveLength(55);
    expect(screen.getAllByText("Da rilevare")).toHaveLength(54);
  });
  it("seleziona soltanto i serramenti senza confondere il numero degli avvolgibili", () => {
    render(<TabellaAbaco righe={abacoDalComputo(vociGenzano())} />);
    fireEvent.change(screen.getByLabelText("Famiglia dell'abaco"), { target: { value: "serramento" } });
    expect(screen.getAllByRole("row")).toHaveLength(106);
  });
});
