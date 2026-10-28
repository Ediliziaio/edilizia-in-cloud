import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SurveyPhotoPlacementEditor } from "@/components/sopralluoghi/SurveyPhotoPlacementEditor";
import { SurveyElementPhotos } from "@/components/sopralluoghi/SurveyElementPhotos";
import { surveyMedia } from "../fixtures/surveyDetail";
import { makeEnergySurvey } from "../fixtures/energySurvey";
const mocks = vi.hoisted(() => ({ export: vi.fn(), upload: vi.fn() }));
vi.mock("@/lib/surveys/photoPlacement", async (original) => ({
  ...(await original<typeof import("@/lib/surveys/photoPlacement")>()),
  loadPlacementImage: () =>
    Promise.resolve({ naturalWidth: 1200, naturalHeight: 800 }),
  renderPhotoPlacement: mocks.export,
}));
vi.mock("@/lib/api/surveys", async (original) => ({
  ...(await original<typeof import("@/lib/api/surveys")>()),
  uploadMedia: mocks.upload,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.export.mockResolvedValue(
    new File(["jpg"], "posizionamento-proposto.jpg", { type: "image/jpeg" }),
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function addSplit() {
  const button = screen.getByRole("button", {
    name: "+ Aggiungi clima interno",
  });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}
describe("Foto con apparecchiature proposte", () => {
  it("aggiunge, sposta, ruota, annota ed esporta senza toccare l’originale", async () => {
    const saved = vi.fn();
    render(
      <SurveyPhotoPlacementEditor
        source={{
          url: "https://example.test/photo.jpg",
          name: "ambiente.jpg",
          mediaId: "original",
        }}
        onSave={saved}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Usa questa proposta" }),
    ).toBeDisabled();
    await addSplit();
    fireEvent.change(screen.getByLabelText("Nome del componente sulla foto"), {
      target: { value: "Sopra ingresso" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Sposta componente →" }),
    );
    fireEvent.change(screen.getByLabelText("Rotazione del componente"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText("Note di posizionamento"), {
      target: { value: "Passaggio tubi da verificare" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Usa questa proposta" }),
    );
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(saved.mock.calls[0][1]).toMatchObject({
      sourceMediaId: "original",
      originalFilename: "ambiente.jpg",
      notToScale: true,
      items: [
        { kind: "split", label: "Sopra ingresso", x: 0.52, rotation: 12 },
      ],
    });
  });
  it("rimozione ultimo componente impedisce esportazioni vuote", async () => {
    render(
      <SurveyPhotoPlacementEditor
        source={{ url: "https://example.test/a.jpg", name: "foto" }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await addSplit();
    fireEvent.click(
      screen.getByRole("button", { name: "Rimuovi componente selezionato" }),
    );
    expect(
      screen.getByRole("button", { name: "Usa questa proposta" }),
    ).toBeDisabled();
  });
  it("conserva la proposta dopo un errore di esportazione", async () => {
    mocks.export.mockRejectedValueOnce(new Error("Foto non esportabile"));
    render(
      <SurveyPhotoPlacementEditor
        source={{ url: "https://example.test/a.jpg", name: "foto" }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await addSplit();
    fireEvent.click(
      screen.getByRole("button", { name: "Usa questa proposta" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Foto non esportabile",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Usa questa proposta" }),
    ).toBeEnabled();
    expect(screen.getByLabelText("Nome del componente sulla foto")).toHaveValue(
      "Clima interno",
    );
  });
  it("carica originale e copia separati, conserva il riferimento anche dopo un errore e non soddisfa checklist con il montaggio", async () => {
    mocks.upload
      .mockResolvedValueOnce(surveyMedia({ id: "original-saved" }))
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(surveyMedia({ id: "proposal-saved" }));
    const d = makeEnergySurvey("clima"),
      e = d.elements[0],
      added = vi.fn();
    render(
      <SurveyElementPhotos
        surveyId={d.survey.id}
        companyId="company1"
        element={e}
        media={[]}
        checklist={[]}
        disabled={false}
        allowPlacement
        onAdded={added}
        onStateChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Scatta foto dell’elemento")).toHaveAttribute(
      "capture",
      "environment",
    );
    fireEvent.change(screen.getByLabelText("Scegli foto dell’elemento"), {
      target: {
        files: [new File(["png"], "originale.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Posiziona impianto sulla foto" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Posiziona impianto sulla foto" }),
    );
    await addSplit();
    fireEvent.click(
      screen.getByRole("button", { name: "Usa questa proposta" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Carica 2 foto/ }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Carica 2 foto/ }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Offline"),
    );
    expect(mocks.upload.mock.calls[0][2]).toMatchObject({
      type: "photo",
      annotations: null,
      expectedCompanyId: "company1",
    });
    fireEvent.click(screen.getByRole("button", { name: /Carica 1 foto/ }));
    await waitFor(() => expect(added).toHaveBeenCalledTimes(2));
    expect(mocks.upload.mock.calls[2][2]).toMatchObject({
      type: "annotated_photo",
      annotations: { sourceMediaId: "original-saved", notToScale: true },
      checklistKey: null,
      elementId: e.id,
    });
    expect(mocks.upload).toHaveBeenCalledTimes(3);
  });
  it("non offre modifiche se il rilievo è in sola lettura", () => {
    const d = makeEnergySurvey("clima"),
      e = d.elements[0];
    render(
      <SurveyElementPhotos
        surveyId={d.survey.id}
        companyId="company1"
        element={e}
        media={[
          surveyMedia({
            id: "source",
            element_id: e.id,
            type: "photo",
            url: "https://example.test/photo.jpg",
          }),
        ]}
        checklist={[]}
        disabled
        allowPlacement
        onAdded={vi.fn()}
        onStateChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Posiziona impianto ·/ }),
    ).toBeDisabled();
  });
});
