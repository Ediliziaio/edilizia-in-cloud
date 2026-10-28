import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { EnergySurveyVisual } from "@/components/sopralluoghi/EnergySurveyVisual";
import { EnergyQuoteReview } from "@/components/sopralluoghi/EnergyQuoteImport";
import { SurveyElementPhotos } from "@/components/sopralluoghi/SurveyElementPhotos";
import ClmStep from "@/pages/azienda/climatizzazione/ClimatizzazioneWizard/StepComputo";
import IdrStep from "@/pages/azienda/termoidraulico/TermoidraulicoWizard/StepComputo";
import {
  makeEnergySurvey,
  type EnergyScenario,
} from "../fixtures/energySurvey";
import { energyComputoRows } from "@/lib/surveys/energyQuote";
import { surveyMedia } from "../fixtures/surveyDetail";
const m = vi.hoisted(() => ({
  scenario: "clima" as string,
  save: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@/components/computo/VoiceComputoDialog",()=>({VoiceComputoDialog:()=>null}));
vi.mock("@/components/computo/ComputoUploadModal",()=>({ComputoUploadModal:()=>null}));
vi.mock("@/hooks/useSurveyDetail", () => ({
  useSurveyDetail: () => ({
    allowed: true,
    isPending: false,
    data: makeEnergySurvey(m.scenario as EnergyScenario),
  }),
}));
vi.mock("@/hooks/useClimatizzazioneProgetto", () => ({
  useEffectiveCompanyId: () => "company1",
  useSaveComputo: () => ({ mutateAsync: m.save, isPending: false }),
}));
vi.mock("@/hooks/useTermoidraulicoProgetto", () => ({
  useEffectiveCompanyId: () => "company1",
  useSaveComputo: () => ({ mutateAsync: m.save, isPending: false }),
}));
vi.mock("@/hooks/useClimatizzazioneListino", () => ({
  useListinoVociSearch: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/useTermoidraulicoListino", () => ({
  useListinoVociSearch: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/lib/api/surveys", async (original) => ({
  ...(await original<typeof import("@/lib/api/surveys")>()),
  uploadMedia: m.upload,
}));
vi.mock("@/components/climatizzazione/ComputoEditor/ComputoEditor", () => ({
  default: () => null,
}));
vi.mock("@/components/termoidraulico/ComputoEditor/ComputoEditor", () => ({
  default: () => null,
}));
beforeEach(() => {
  vi.clearAllMocks();
  m.save.mockResolvedValue({});
  m.upload.mockResolvedValue(surveyMedia({ id: "uploaded" }));
});
afterEach(cleanup);
function checkedReview(scenario: EnergyScenario, onApply = vi.fn()) {
  const d = makeEnergySurvey(scenario);
  render(
    <MemoryRouter>
      <EnergyQuoteReview
        detail={d}
        companyId="company1"
        module={scenario === "clima" ? "climatizzazione" : "termoidraulico"}
        onApply={onApply}
      />
    </MemoryRouter>,
  );
  return d;
}
describe("Interfaccia sopralluogo energia", () => {
  it("disegno e warning reagiscono alle misure senza cambiare la quantità", () => {
    const d = makeEnergySurvey(),
      e = d.elements[0],
      t = d.template.schema.element_types[0];
    function Example() {
      const [values, setValues] = useState(e.values);
      return (
        <EnergySurveyVisual type={t} values={values} onChange={setValues} />
      );
    }
    render(<Example />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/6 × 5 m/);
    fireEvent.click(screen.getByRole("button", { name: "Sposta modulo ←" }));
    expect(screen.getByText(/Modulo 1 nella fascia/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Disponi i moduli/ }));
    expect(screen.queryByText(/Modulo 1 nella fascia/)).not.toBeInTheDocument();
  });
  it("non permette di confermare senza scelte e consenso espliciti", () => {
    checkedReview("clima");
    expect(
      screen.getByRole("button", { name: /Conferma e inserisci/ }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Unità interna soggiorno/ }),
    );
    expect(
      screen.getByRole("button", { name: /Conferma e inserisci/ }),
    ).toBeDisabled();
  });
  it("blocca prezzo mancante e consente un’importazione sola dopo la conferma", () => {
    const apply = vi.fn((d, rows, prices) =>
      energyComputoRows(rows, prices, "company1", "project", []),
    );
    checkedReview("clima", apply);
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Unità interna soggiorno/ }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Confermo voci/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /Conferma e inserisci/ }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/prezzo/);
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "900" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Conferma e inserisci/ }),
    );
    expect(
      screen.getByRole("button", { name: /Dati inseriti/ }),
    ).toBeDisabled();
    expect(apply).toHaveBeenCalledTimes(2);
  });
  it("nega il modulo sbagliato e dati di altra azienda", () => {
    const d = makeEnergySurvey("pdc");
    const { rerender } = render(
      <MemoryRouter>
        <EnergyQuoteReview
          detail={d}
          companyId="company1"
          module="climatizzazione"
          onApply={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/altro preventivatore/);
    rerender(
      <MemoryRouter>
        <EnergyQuoteReview
          detail={d}
          companyId="other"
          module="termoidraulico"
          onApply={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/azienda/);
  });
  it.each(["clima", "pdc", "ibrido"] as const)(
    "%s usa il salvataggio del computo nativo",
    async (scenario) => {
      m.scenario = scenario;
      const Step = scenario === "clima" ? ClmStep : IdrStep;
      render(
        <MemoryRouter
          initialEntries={[`/?rilievo=simulation-energy-${scenario}`]}
        >
          <Step progettoId="project" initialComputo={[]} />
        </MemoryRouter>,
      );
      fireEvent.click(screen.getAllByRole("checkbox")[0]);
      fireEvent.change(screen.getByRole("spinbutton"), {
        target: { value: "1200" },
      });
      fireEvent.click(screen.getByRole("checkbox", { name: /Confermo voci/ }));
      fireEvent.click(
        screen.getByRole("button", { name: /Conferma e inserisci/ }),
      );
      await waitFor(() => expect(m.save).toHaveBeenCalled(), { timeout: 5000 });
      const payload = m.save.mock.calls[0][0];
      expect(JSON.stringify(payload)).toContain(
        `rilievo:simulation-energy-${scenario}`,
      );
      expect(JSON.stringify(payload)).toContain("1200");
    },
  );
  it("foto: mantiene la coda dopo errore e ritenta nel contesto corretto", async () => {
    const d = makeEnergySurvey(),
      e = d.elements[0],
      t = d.template.schema.element_types[0],
      added = vi.fn();
    m.upload
      .mockRejectedValueOnce(new Error("Rete assente"))
      .mockResolvedValueOnce(surveyMedia({ id: "uploaded" }));
    render(
      <SurveyElementPhotos
        surveyId={d.survey.id}
        companyId="company1"
        element={e}
        checklist={t.required_photos}
        media={[]}
        disabled={false}
        onStateChange={vi.fn()}
        onAdded={added}
      />,
    );
    fireEvent.change(screen.getByLabelText("Scegli foto dell’elemento"), {
      target: { files: [new File(["fake"], "sim.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Carica.*1/ }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Rete assente"),
    );
    expect(added).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Carica.*1/ }));
    await waitFor(() => expect(added).toHaveBeenCalledTimes(1));
    expect(m.upload.mock.calls[1][2]).toMatchObject({
      expectedCompanyId: "company1",
      elementId: e.id,
      areaId: e.area_id,
    });
  });
});
