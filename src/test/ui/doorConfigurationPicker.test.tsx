import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { DoorConfigurationPicker } from "@/components/sopralluoghi/DoorConfigurationPicker";
import { WindowSurveyVisual } from "@/components/sopralluoghi/WindowSurveyVisual";
import { INTERNAL_DOOR_TYPE } from "@/lib/surveys/doorSurvey";
afterEach(cleanup);
describe("Configurazioni illustrate senza misure implicite", () => {
  it("sceglie una forma ma non importa le misure usate dalle miniature", () => {
    const changed = vi.fn();
    render(
      <DoorConfigurationPicker
        values={{ larghezza: 93, altezza: 214, rv_door_swing: "tirare" }}
        onChange={changed}
      />,
    );
    fireEvent.click(screen.getByText("Scegli la forma dal disegno"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Configurazione: Anta con due fiancoluce",
      }),
    );
    const value = changed.mock.calls[0][0];
    expect(value).toMatchObject({
      larghezza: 93,
      altezza: 214,
      rv_door_swing: "tirare",
      rv_door_sidelights: "entrambi",
    });
    for (const key of [
      "rv_door_sidelight_left_width",
      "rv_door_sidelight_right_width",
      "rv_door_split_mm",
      "rv_door_toplight_height",
      "rv_door_hinge",
    ])
      expect(value[key]).toBeUndefined();
  });
  it("non permette di cambiare configurazione con una nota pendente", () => {
    const changed = vi.fn();
    render(<DoorConfigurationPicker values={{}} onChange={changed} disabled />);
    fireEvent.click(screen.getByText("Scegli la forma dal disegno"));
    expect(
      screen.getByRole("button", { name: "Configurazione: Anta unica" }),
    ).toBeDisabled();
    expect(changed).not.toHaveBeenCalled();
  });
  it("porta interna: parte dal lato A e mantiene distinti A e B", () => {
    render(
      <WindowSurveyVisual
        type={INTERNAL_DOOR_TYPE}
        values={{
          larghezza: 800,
          altezza: 2100,
          tipologia: "battente",
          rv_door_hinge: "sx",
          rv_door_swing: "spingere",
          rv_door_side_a: "Ingresso",
          rv_door_side_b: "Camera",
        }}
        quantity={1}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Lato A · riferimento" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByRole("button", { name: "Da fuori" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lato B · retro" }));
    expect(
      screen.getByRole("button", { name: "Lato B · retro" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
