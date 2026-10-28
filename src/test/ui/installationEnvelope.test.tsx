import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WindowSurveyVisual } from "@/components/sopralluoghi/WindowSurveyVisual";
import {
  ENVELOPE_EXAMPLES,
  envelopeExampleType,
} from "../fixtures/installationEnvelopes";
afterEach(cleanup);
it.each(ENVELOPE_EXAMPLES)(
  "$label: mostra misure e ingombri senza simulare un profilo esecutivo",
  (e) => {
    render(
      <WindowSurveyVisual
        type={envelopeExampleType(e)}
        values={e.values}
        quantity={1}
      />,
    );
    expect(screen.getByText(/Spessori e ingombri di posa/)).toBeInTheDocument();
    expect(
      screen.getByText(/non sezioni esecutive dei profili/),
    ).toBeInTheDocument();
    if (e.type === "portoncino_blindato") {
      expect(
        screen.getByLabelText(
          "Anta · sola profondità. 85 mm. Schema di ingombro.",
        ),
      ).toBeInTheDocument();
    }
    if (e.label.includes("incompatibilità"))
      expect(
        screen.getByText(/più spesso del massimo ammesso/),
      ).toBeInTheDocument();
  },
);
