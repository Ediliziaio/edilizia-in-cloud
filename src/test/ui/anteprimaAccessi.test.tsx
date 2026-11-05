import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnteprimaAccessi } from "@/components/users/AnteprimaAccessi";

const aree = [{ id: "f", label: "Finanza", modules: [{ label: "Costi", viewKey: "can_view_costs" }] }];

describe("AnteprimaAccessi", () => {
  it("dice da dove si apre un'area sensibile", () => {
    render(<AnteprimaAccessi nome="Giusy" permessi={{ can_view_costs: true }} aree={aree} />);
    expect(screen.getByText("Cosa vede davvero Giusy")).toBeTruthy();
    expect(screen.getByText("3 aree sensibili")).toBeTruthy();
    expect(screen.getAllByText(/Si apre con: Costi/).length).toBe(3);
    expect(screen.getByText("Finanza:")).toBeTruthy();
  });

  it("senza permessi non segnala nulla di aperto", () => {
    render(<AnteprimaAccessi nome="Luca" permessi={{}} aree={aree} solaLettura />);
    expect(screen.getByText("0 aree sensibili")).toBeTruthy();
    expect(screen.getByText("Nessuna sezione accesa.")).toBeTruthy();
    expect(screen.getByText(/È in sola lettura/)).toBeTruthy();
  });
});
