import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SurveyElementEditor,
  type SurveyElementEditorHandle,
} from "@/components/sopralluoghi/SurveyElementEditor";
import { SurveyElementEditDialog } from "@/components/sopralluoghi/SurveyElementEditDialog";
import { ElementCard } from "@/components/surveys/engine/ElementCard";
import { makeWindowSurveyDetail } from "../fixtures/windowSurvey";
import {
  readSurveyDraft,
  surveyDraftKey,
  writeSurveyDraft,
  surveySchemaKey,
} from "@/lib/surveys/elementDraft";
const m = vi.hoisted(() => ({
  company: "company1",
  user: "user1",
  readonly: false,
  save: vi.fn(),
  cache: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: { id: m.company },
    user: { id: m.user },
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    solaLettura: m.readonly,
    canViewSopralluoghi: true,
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    setQueriesData: m.cache,
    invalidateQueries: vi.fn(),
  }),
}));
vi.mock("@/lib/surveys/saveElement", () => ({ saveSurveyElement: m.save }));
vi.mock("@/components/surveys/engine/PhotoChecklist", () => ({
  PhotoChecklist: (): null => null,
}));
vi.mock("@/components/surveys/engine/FreePhotoUpload", () => ({
  FreePhotoUpload: (): null => null,
}));
vi.mock("@/components/surveys/engine/AudioRecorder", () => ({
  AudioRecorder: (): null => null,
}));
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  m.company = "company1";
  m.user = "user1";
  m.readonly = false;
  vi.stubGlobal("innerWidth", 1200);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function setup(detail = makeWindowSurveyDetail()) {
  const saved = vi.fn(),
    ref = createRef<SurveyElementEditorHandle>();
  const props = {
    detail,
    element: detail.elements[0],
    onStateChange: vi.fn(),
    onCancel: vi.fn(),
    onSaved: saved,
  };
  const result = render(<SurveyElementEditor ref={ref} {...props} />);
  const key = surveyDraftKey({
    companyId: "company1",
    userId: "user1",
    surveyId: detail.survey.id,
    elementId: detail.elements[0].id,
  });
  return { ...result, detail, props, ref, saved, key };
}
const editWidth = () =>
  fireEvent.change(screen.getByRole("spinbutton", { name: "Larghezza" }), {
    target: { value: "123" },
  });
describe("Recupero delle bozze nella scheda unificata", () => {
  it("permette di conservare la bozza e chiudere senza inviarla al server", async () => {
    const detail = makeWindowSurveyDetail(),
      close = vi.fn();
    const dialog = render(
      <SurveyElementEditDialog
        detail={detail}
        element={detail.elements[0]}
        onClose={close}
      />,
    );
    editWidth();
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Conserva bozza e chiudi" }),
    );
    expect(close).toHaveBeenCalledOnce();
    expect(m.save).not.toHaveBeenCalled();
    dialog.unmount();
    setup(detail);
    expect(
      screen.getByRole("button", { name: "Riprendi bozza" }),
    ).toBeInTheDocument();
  });
  it("Conserva e chiudi non chiude se la protezione locale fallisce", async () => {
    const detail = makeWindowSurveyDetail(),
      close = vi.fn();
    render(
      <SurveyElementEditDialog
        detail={detail}
        element={detail.elements[0]}
        onClose={close}
      />,
    );
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    editWidth();
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Conserva bozza e chiudi" }),
    );
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
  it("la vecchia scheda non modifica più campi/quantità al volo: apre il modulo unico", () => {
    const detail = makeWindowSurveyDetail(),
      open = vi.fn();
    render(
      <ElementCard
        element={detail.elements[0]}
        elementType={detail.template.schema.element_types[0]}
        index={0}
        surveyId={detail.survey.id}
        media={[]}
        onOpen={open}
      />,
    );
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Apri scheda elemento" }),
    );
    expect(open).toHaveBeenCalledOnce();
    expect(m.save).not.toHaveBeenCalled();
  });
  it("non mostra i dati della bozza se cambia l’azienda con la scheda ancora montata", async () => {
    const first = setup();
    editWidth();
    await waitFor(() => expect(localStorage.getItem(first.key)).not.toBeNull());
    m.company = "company2";
    first.rerender(<SurveyElementEditor {...first.props} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Azienda o utente cambiati",
    );
    expect(
      screen.queryByRole("spinbutton", { name: "Larghezza" }),
    ).not.toBeInTheDocument();
    expect(m.save).not.toHaveBeenCalled();
  });
  it("non sposta una nota recuperata su un componente diverso se quello originale manca", () => {
    const detail = makeWindowSurveyDetail(),
      e = detail.elements[0];
    e.values.complementi = [];
    const key = surveyDraftKey({
      companyId: "company1",
      userId: "user1",
      surveyId: detail.survey.id,
      elementId: e.id,
    });
    const base = {
      values: e.values,
      quantity: e.quantity,
      notes: e.notes,
      element_label: e.element_label,
    };
    writeSurveyDraft(
      localStorage,
      key,
      {
        version: 1,
        revision: "pending-1",
        savedAt: Date.now(),
        schema: surveySchemaKey(detail.template.schema),
        baseUpdatedAt: e.updated_at,
        base,
        draft: base,
        annotation: {
          view: "interna",
          component: "cassonetto",
          pending: { x: 0.5, y: 0.5 },
          note: "Rivedere cielino",
          photoId: "none",
        },
      },
      null,
    );
    setup(detail);
    fireEvent.click(screen.getByRole("button", { name: "Riprendi bozza" }));
    expect(
      (
        screen.getByRole("textbox", {
          name: "Note sull’elemento",
        }) as HTMLTextAreaElement
      ).value,
    ).toContain("Rivedere cielino");
    expect(
      screen.queryByRole("textbox", { name: "Nota sul punto selezionato" }),
    ).not.toBeInTheDocument();
    expect(m.save).not.toHaveBeenCalled();
  });
  it("dopo un ricaricamento propone la bozza senza applicarla o inviarla al server", async () => {
    const first = setup();
    editWidth();
    await waitFor(() =>
      expect(
        readSurveyDraft(localStorage, first.key)?.draft.values.larghezza_foro,
      ).toBe(123),
    );
    first.unmount();
    const next = setup(first.detail);
    expect(
      screen.getByRole("region", { name: "Recupero bozza del rilievo" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Larghezza" })).toHaveValue(
      120,
    );
    expect(
      screen.getByRole("spinbutton", { name: "Larghezza" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Riprendi bozza" }));
    expect(screen.getByRole("spinbutton", { name: "Larghezza" })).toHaveValue(
      123,
    );
    expect(m.save).not.toHaveBeenCalled();
    next.ref.current?.discardDraft();
  });
  it("non propone la bozza di un altro utente", async () => {
    const first = setup();
    editWidth();
    await waitFor(() => expect(localStorage.getItem(first.key)).not.toBeNull());
    first.unmount();
    m.user = "user2";
    setup(first.detail);
    expect(
      screen.queryByRole("region", { name: "Recupero bozza del rilievo" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Larghezza" })).toHaveValue(
      120,
    );
  });
  it("presenta il conflitto sullo stesso campo e rispetta il valore salvato scelto", async () => {
    const first = setup();
    editWidth();
    await waitFor(() => expect(localStorage.getItem(first.key)).not.toBeNull());
    first.unmount();
    const latest = structuredClone(first.detail);
    latest.elements[0].values.larghezza_foro = 130;
    latest.elements[0].updated_at = "2026-10-27T14:00:00Z";
    setup(latest);
    expect(
      screen.getByRole("button", { name: "Riprendi bozza" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByText("Mantieni il salvato", { exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Riprendi bozza" }));
    expect(screen.getByRole("spinbutton", { name: "Larghezza" })).toHaveValue(
      130,
    );
    expect(m.save).not.toHaveBeenCalled();
  });
  it("se cambiano il modello o le unità non ripristina automaticamente le misure", async () => {
    const first = setup();
    editWidth();
    await waitFor(() => expect(localStorage.getItem(first.key)).not.toBeNull());
    first.unmount();
    const latest = structuredClone(first.detail);
    latest.template.schema.element_types[0].label += " aggiornato";
    setup(latest);
    expect(
      screen.queryByRole("button", { name: "Riprendi bozza" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "modello dei campi è cambiato",
    );
  });
  it("un errore di rete conserva la bozza, un successo esplicito la rimuove", async () => {
    const first = setup();
    editWidth();
    await waitFor(() => expect(localStorage.getItem(first.key)).not.toBeNull());
    m.save.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Salva elemento" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("offline"),
    );
    expect(localStorage.getItem(first.key)).not.toBeNull();
    m.save.mockResolvedValueOnce({
      ...first.detail.elements[0],
      values: { larghezza_foro: 123 },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva elemento" }));
    await waitFor(() => expect(first.saved).toHaveBeenCalledOnce());
    expect(localStorage.getItem(first.key)).toBeNull();
  });
  it("se il deposito è pieno non mostra un falso messaggio di protezione", async () => {
    setup();
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    editWidth();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("non è protetta"),
    );
    expect(screen.queryByText(/Bozza locale protetta/)).not.toBeInTheDocument();
  });
  it("recupera la nota grafica in compilazione senza trasformarla in una nota confermata", async () => {
    const first = setup();
    fireEvent.click(
      screen.getByRole("button", { name: "Aggiungi nota sul disegno" }),
    );
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Scegli il punto della nota sul disegno",
      }),
      { key: "Enter" },
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Nota sul punto selezionato" }),
      { target: { value: "Attenzione al cielino" } },
    );
    await waitFor(() =>
      expect(readSurveyDraft(localStorage, first.key)?.annotation?.note).toBe(
        "Attenzione al cielino",
      ),
    );
    first.unmount();
    setup(first.detail);
    fireEvent.click(screen.getByRole("button", { name: "Riprendi bozza" }));
    expect(
      screen.getByRole("textbox", { name: "Nota sul punto selezionato" }),
    ).toHaveValue("Attenzione al cielino");
    expect(
      screen.getByRole("button", { name: "Salva elemento" }),
    ).toBeDisabled();
    expect(m.save).not.toHaveBeenCalled();
  });
  it("il dialog della pagina completa protegge la chiusura e scarta anche la copia locale", async () => {
    const detail = makeWindowSurveyDetail(),
      close = vi.fn();
    render(
      <SurveyElementEditDialog
        detail={detail}
        element={detail.elements[0]}
        onClose={close}
      />,
    );
    editWidth();
    const key = surveyDraftKey({
      companyId: "company1",
      userId: "user1",
      surveyId: detail.survey.id,
      elementId: detail.elements[0].id,
    });
    await waitFor(() => expect(localStorage.getItem(key)).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    const confirm = screen.getByRole("alertdialog");
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Scarta modifiche" }),
    );
    expect(close).toHaveBeenCalledOnce();
    expect(localStorage.getItem(key)).toBeNull();
  });
});
