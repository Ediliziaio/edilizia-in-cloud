import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { WindowSurveyVisual } from "@/components/sopralluoghi/WindowSurveyVisual";
import { SectionRenderer } from "@/components/surveys/engine/SectionRenderer";
import {
  INTERNAL_DOOR_TYPE,
  doorSurveySections,
} from "@/lib/surveys/doorSurvey";
import { DOOR_MOVEMENT_EXAMPLES } from "../fixtures/doorMovements";
afterEach(cleanup);
describe("Rilievo porte mobili · vista e campi pertinenti", () => {
  it("consente di scegliere il bianco solo sul lato visualizzato senza cambiare l’altro", () => {
    const onChange = vi.fn();
    const values = {
      ...DOOR_MOVEMENT_EXAMPLES[0].values,
      colore_interno: "RAL 7016",
    };
    render(
      <WindowSurveyVisual
        type={INTERNAL_DOOR_TYPE}
        values={values}
        quantity={1}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByText("Bianco di rappresentazione · colore da confermare"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: "Colore lato A" }));
    fireEvent.click(
      screen.getByRole("option", { name: /^Bianco$/ }),
    );
    expect(onChange).toHaveBeenCalledWith({
      ...values,
      colore_esterno: "#ffffff",
    });
    expect(values.colore_interno).toBe("RAL 7016");
  });
  it.each(DOOR_MOVEMENT_EXAMPLES.slice(0, 4))(
    "mostra la pianta reale di $label e i riferimenti A/B",
    (e) => {
      render(
        <WindowSurveyVisual
          type={INTERNAL_DOOR_TYPE}
          values={e.values}
          quantity={1}
        />,
      );
      expect(
        screen.getByRole("img", { name: /vista dall’alto/ }),
      ).toBeInTheDocument();
      expect(screen.getByText("LATO B", { exact: true })).toBeInTheDocument();
      expect(screen.getByText("LATO A", { exact: true })).toBeInTheDocument();
    },
  );
  it("libro: mostra ripiegamento, non le cerniere di una vecchia porta a battente", () => {
    for (const s of doorSurveySections(INTERNAL_DOOR_TYPE))
      render(
        <SectionRenderer
          section={s}
          values={{
            ...DOOR_MOVEMENT_EXAMPLES[3].values,
            rv_door_hinge: "sx",
            rv_door_swing: "tirare",
          }}
          onChange={() => {}}
        />,
      );
    expect(
      screen.queryByText("Cerniere viste dal lato A", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Esterno muro · il pannello scorre sul", {
        exact: true,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Divisorio dal bordo di raccolta · modulo porta", {
        exact: true,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Il pacchetto si ripiega verso", { exact: true }),
    ).toBeInTheDocument();
  });
});
