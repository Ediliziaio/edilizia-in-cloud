import "@testing-library/jest-dom/vitest";
import { afterEach, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WindowSurveyVisual } from "@/components/sopralluoghi/WindowSurveyVisual";
import { makeCompleteWindowSurvey } from "../fixtures/completeWindowSurvey";
afterEach(cleanup);
const d = makeCompleteWindowSurvey();
it.each([0, 7])(
  "mostra il sistema %s con le stesse scene condivise col PDF",
  (i) => {
    const e = d.elements[i],
      type = d.template.schema.element_types.find(
        (t) => t.key === e.element_type,
      )!;
    render(<WindowSurveyVisual type={type} values={e.values} quantity={1} />);
    expect(
      screen.getByText(
        i === 0 ? "Monoblocco del serramento" : "Guide / telaio a sporgere",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        i === 0
          ? /Monoblocco · ingombro esterno\./
          : /Apertura a sporgere · vista laterale\./,
      ),
    ).toBeInTheDocument();
  },
);
