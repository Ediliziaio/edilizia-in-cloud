import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WindowAbacoPanel } from "@/components/sopralluoghi/WindowAbacoPanel";
import { windowAbaco } from "@/lib/surveys/windowAbaco";
afterEach(cleanup);
describe("Abaco accessibile e consultabile senza scritture", () => {
  it("separa le quote, conserva mancanti e mostra pianta e sezione condivise", () => {
    render(
      <WindowAbacoPanel
        abaco={windowAbaco(
          {
            rv_abaco_counterframe: "nuovo",
            rv_abaco_window_width: 1180,
            rv_abaco_swing: "interno",
          },
          [{ tipo: "battente", lato: "sx" }],
          { width: 1200, height: 1400, isRough: true },
        )}
      />,
    );
    expect(
      screen.getByText("Abaco tecnico · misure e posa").closest("details"),
    ).toHaveAttribute("open");
    expect(screen.getByRole("table")).toHaveAccessibleName(
      /Misure indipendenti/,
    );
    expect(
      within(
        screen.getByRole("row", { name: /Infisso · esterno telaio/ }),
      ).getByText(/1\.?180 mm/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Pianta · apertura e posa/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Sezione verticale/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Da rilevare")).toHaveLength(3);
    expect(
      screen.getByRole("img", { name: /Pianta · apertura e posa/ }),
    ).toHaveAccessibleName(/non in scala/);
  });
});
