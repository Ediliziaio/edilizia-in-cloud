import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WindowSurveyVisual } from "@/components/sopralluoghi/WindowSurveyVisual";
import { SurveyElementEditor } from "@/components/sopralluoghi/SurveyElementEditor";
import { makeWindowSurveyDetail } from "../fixtures/windowSurvey";
import { WINDOW_PINS, type WindowValues } from "@/lib/surveys/windowSurvey";
const state = vi.hoisted(() => ({
  save: vi.fn(),
  readonly: false,
  cache: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "company1" } }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    solaLettura: state.readonly,
    canViewSopralluoghi: true,
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    setQueriesData: state.cache,
    invalidateQueries: vi.fn(),
  }),
}));
vi.mock("@/lib/surveys/saveElement", () => ({ saveSurveyElement: state.save }));
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  state.readonly = false;
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Visual({
  values: initial = {},
  readonly = false,
}: {
  values?: WindowValues;
  readonly?: boolean;
}) {
  const detail = makeWindowSurveyDetail(),
    type = detail.template.schema.element_types[0];
  const [values, setValues] = useState({
    ...detail.elements[0].values,
    ...initial,
  });
  return (
    <>
      <WindowSurveyVisual
        type={type}
        values={values}
        quantity={2}
        headerValues={detail.survey.header_data}
        onChange={readonly ? undefined : setValues}
      />
      <output data-testid="draft">{JSON.stringify(values)}</output>
    </>
  );
}
describe("Rilievo visuale · esperienza e salvataggio esplicito", () => {
  it("cassonetto anomalo: schema come riferimento, quote vere e proporzioni consultabili senza scritture", () => {
    const type = makeWindowSurveyDetail().template.schema.element_types.find(
      (t) => t.key === "cassonetto_standalone",
    )!;
    const change = vi.fn();
    render(
      <WindowSurveyVisual
        type={type}
        values={{ larghezza: 120, altezza: 270, profondita: 22 }}
        quantity={1}
        onChange={change}
      />,
    );
    expect(
      screen.getByRole("img", {
        name: /Schema illustrativo non in scala.*H 2700 mm.*C da rilevare/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /H 2700 mm.*L 1200 mm/,
    );
    expect(
      screen.getByText("Da rilevare", { exact: true }),
    ).toBeInTheDocument();
    const section = screen
      .getByText("Sezione laterale · altezza e profondità", {
        selector: "summary",
      })
      .closest("details");
    expect(section).not.toHaveAttribute("open");
    fireEvent.click(
      screen.getByRole("button", { name: "Mostra proporzioni rilevate" }),
    );
    expect(
      screen.getByRole("img", { name: /Proporzioni rilevate.*H 2700 mm/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Torna allo schema" }));
    expect(
      screen.getByRole("img", { name: /Schema illustrativo non in scala/ }),
    ).toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });
  it("cassonetto 3D come riferimento, passaggio al frontale per annotare senza salvare", () => {
    const detail = makeWindowSurveyDetail();
    const type = detail.template.schema.element_types.find(
      (t) => t.key === "cassonetto_standalone",
    )!;
    render(
      <WindowSurveyVisual
        type={type}
        values={{
          larghezza: 130,
          altezza: 25,
          profondita: 22,
          rv_cielino_depth: 300,
        }}
        quantity={1}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("img", { name: /Cassonetto in assonometria.*C 300 mm/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vista 3D" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Aggiungi nota sul disegno" }),
    );
    expect(
      screen.getByRole("button", { name: "Frontale e note" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", {
        name: "Scegli il punto della nota sul disegno",
      }),
    ).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
  });
  it("divide anche le sezioni aziendali miste: misure prima e verso porta nei dettagli", () => {
    vi.stubGlobal("innerWidth", 390);
    const detail = makeWindowSurveyDetail(),
      type = detail.template.schema.element_types.find(
        (t) => t.key === "portoncino_blindato",
      )!;
    type.sections = [
      {
        key: "sezione_aziendale",
        label: "Dati portoncino",
        fields: type.sections.flatMap((s) => s.fields),
      },
    ];
    detail.elements[0].element_type = type.key;
    detail.elements[0].values = {
      larghezza: 90,
      altezza: 210,
      tipologia: "1_anta",
      apertura: "dx",
    };
    render(
      <SurveyElementEditor
        detail={detail}
        element={detail.elements[0]}
        onStateChange={vi.fn()}
        onCancel={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("spinbutton", { name: /Larghezza/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2. Dettagli" }));
    expect(
      screen.getByRole("radio", { name: "Spingendo verso l’interno" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "A Destra" }),
    ).not.toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
  });
  it.each([390, 820])(
    "telefono/tablet %spx: quattro passi e dati conservati tra le sezioni",
    (width) => {
      vi.stubGlobal("innerWidth", width);
      const detail = makeWindowSurveyDetail();
      render(
        <SurveyElementEditor
          detail={detail}
          element={detail.elements[0]}
          onStateChange={vi.fn()}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
        />,
      );
      expect(
        screen.getByRole("navigation", { name: "Passi della scheda rilievo" }),
      ).toBeInTheDocument();
      const input = screen.getByRole("spinbutton", { name: "Larghezza" });
      expect(input).toHaveAttribute("inputmode", "decimal");
      fireEvent.change(input, { target: { value: "123" } });
      fireEvent.click(screen.getByRole("button", { name: "2. Dettagli" }));
      expect(
        screen.queryByRole("spinbutton", { name: "Larghezza" }),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "1. Misure" }));
      expect(screen.getByRole("spinbutton", { name: "Larghezza" })).toHaveValue(
        123,
      );
      expect(state.save).not.toHaveBeenCalled();
    },
  );
  it("mostra quote vere, cambio vista e non salva per sola consultazione", () => {
    render(<Visual readonly />);
    expect(
      screen.getByRole("img", { name: /Serramento 1200 per 1400.*interna/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Da fuori" }));
    expect(
      screen.getByRole("img", { name: /Serramento 1200 per 1400.*esterna/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Aggiungi nota sul disegno" }),
    ).not.toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
  });
  it("i complementi non ereditano le misure dell’infisso", () => {
    render(<Visual values={{ complementi: ["cassonetto"] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Cassonetto" }));
    expect(
      screen.queryByRole("img", { name: /Serramento/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Nessuna misura di esempio/)).toBeInTheDocument();
  });
  it("aggiunge una nota da tastiera nella vista corretta e la elimina soltanto dalla bozza", () => {
    render(<Visual />);
    fireEvent.click(screen.getByRole("button", { name: "Da fuori" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Aggiungi nota sul disegno" }),
    );
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Scegli il punto della nota sul disegno",
      }),
      { key: "Enter" },
    );
    fireEvent.change(screen.getByLabelText("Nota sul punto selezionato"), {
      target: { value: "Verificare mazzetta" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Aggiungi alla bozza" }),
    );
    const values = JSON.parse(screen.getByTestId("draft").textContent!);
    expect(values[WINDOW_PINS][0]).toMatchObject({
      x: 0.5,
      y: 0.5,
      view: "esterna",
      component: "primary",
      text: "Verificare mazzetta",
    });
    expect(
      screen.getByRole("list", { name: "Note del disegno" }),
    ).toHaveTextContent("Verificare mazzetta");
    fireEvent.click(screen.getByRole("button", { name: "Elimina nota 1" }));
    expect(
      JSON.parse(screen.getByTestId("draft").textContent!)[WINDOW_PINS],
    ).toEqual([]);
    expect(state.save).not.toHaveBeenCalled();
  });
  it("rende disponibili le quote finite soltanto con una verifica completa", () => {
    const { rerender } = render(
      <Visual
        values={{
          rv_order_checked: true,
          rv_order_width: 1180,
          rv_order_height: 1380,
        }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Finite verificate" }),
    ).not.toBeInTheDocument();
    rerender(
      <Visual
        key="checked"
        values={{
          rv_order_checked: true,
          rv_order_width: 1180,
          rv_order_height: 1380,
          rv_order_reference: "TEST tecnico",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Finite verificate" }));
    expect(
      screen.getByRole("img", { name: /Serramento 1180 per 1380/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Aggiungi nota sul disegno" }),
    ).not.toBeInTheDocument();
  });
  it("aggiorna il disegno mentre scrivi e salva solo premendo Salva elemento", async () => {
    const detail = makeWindowSurveyDetail(),
      saved = vi.fn(),
      changed = vi.fn();
    state.save.mockImplementation(async (_, element, draft) => ({
      ...element,
      ...draft,
    }));
    render(
      <SurveyElementEditor
        detail={detail}
        element={detail.elements[0]}
        onStateChange={changed}
        onCancel={vi.fn()}
        onSaved={saved}
      />,
    );
    const form = screen.getByRole("form", {
      name: "Modifica elemento del sopralluogo",
    });
    fireEvent.change(
      within(form).getByRole("spinbutton", { name: "Larghezza" }),
      { target: { value: "123" } },
    );
    expect(
      screen.getByRole("img", { name: /Serramento 1230 per 1400/ }),
    ).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salva elemento" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(state.save.mock.calls[0][2].values.larghezza_foro).toBe(123);
    expect(detail.elements[0].values.larghezza_foro).toBe(120);
  });
  it("protegge una nota in compilazione da salvataggi e navigazioni involontari", async () => {
    const detail = makeWindowSurveyDetail(),
      changed = vi.fn();
    render(
      <SurveyElementEditor
        detail={detail}
        element={detail.elements[0]}
        onStateChange={changed}
        onCancel={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Aggiungi nota sul disegno" }),
    );
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Scegli il punto della nota sul disegno",
      }),
      { key: "Enter" },
    );
    await waitFor(() =>
      expect(changed).toHaveBeenLastCalledWith({ dirty: true, saving: false }),
    );
    expect(
      screen.getByRole("button", { name: "Salva elemento" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Annulla posizionamento" }),
    );
    await waitFor(() =>
      expect(changed).toHaveBeenLastCalledWith({ dirty: false, saving: false }),
    );
    expect(state.save).not.toHaveBeenCalled();
  });
  it("non lascia salvare in sola lettura", () => {
    state.readonly = true;
    const detail = makeWindowSurveyDetail();
    render(
      <SurveyElementEditor
        detail={detail}
        element={detail.elements[0]}
        onStateChange={vi.fn()}
        onCancel={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Salva elemento" }),
    ).toBeDisabled();
    expect(state.save).not.toHaveBeenCalled();
  });
});
