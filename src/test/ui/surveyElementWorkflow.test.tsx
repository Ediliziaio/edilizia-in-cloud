import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SurveyElementEditor,
  type SurveyElementEditorHandle,
} from "@/components/sopralluoghi/SurveyElementEditor";
import { SurveyElementPhotos } from "@/components/sopralluoghi/SurveyElementPhotos";
import { makeWindowSurveyDetail } from "../fixtures/windowSurvey";
import type { SurveyMediaRow } from "@/types/surveys";
import { SurveyAccessContext } from "@/contexts/SurveyAccessContext";
const m = vi.hoisted(() => ({
  save: vi.fn(),
  upload: vi.fn(),
  cache: vi.fn(),
  officePermission: true,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: { id: "company1" },
    user: { id: "user1" },
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ solaLettura: false, canViewSopralluoghi: m.officePermission }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    setQueriesData: m.cache,
    invalidateQueries: vi.fn(),
  }),
}));
vi.mock("@/lib/surveys/saveElement", () => ({ saveSurveyElement: m.save }));
vi.mock("@/lib/api/surveys", async (original) => ({
  ...(await original<typeof import("@/lib/api/surveys")>()),
  uploadMedia: m.upload,
}));
beforeEach(() => {
  vi.clearAllMocks();
  m.officePermission = true;
  localStorage.clear();
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
});
const photo = (id: string) =>
  ({
    id,
    element_id: "element1",
    type: "photo",
    filename: `${id}.jpg`,
    url: "",
  }) as SurveyMediaRow;
function editor(fieldAccess?: {field:boolean;canEdit:boolean}) {
  const detail = makeWindowSurveyDetail(),
    next = vi.fn(),
    saved = vi.fn(),
    ref = createRef<SurveyElementEditorHandle>();
  render(
    <SurveyAccessContext.Provider value={fieldAccess ?? {field:false,canEdit:true}}><SurveyElementEditor
      ref={ref}
      detail={detail}
      element={detail.elements[0]}
      onNext={next}
      onSaved={saved}
      onCancel={vi.fn()}
      onStateChange={vi.fn()}
    /></SurveyAccessContext.Provider>,
  );
  return { detail, next, saved, ref };
}
function photos(disabled = false) {
  const detail = makeWindowSurveyDetail(),
    added = vi.fn(),
    state = vi.fn();
  const view = render(
    <SurveyElementPhotos
      surveyId={detail.survey.id}
      companyId="company1"
      element={detail.elements[0]}
      checklist={detail.template.schema.element_types[0].required_photos}
      media={[]}
      disabled={disabled}
      onStateChange={state}
      onAdded={added}
    />,
  );
  return { ...view, detail, added, state };
}
const choose = (files: File[]) =>
  fireEvent.change(screen.getByLabelText("Scegli foto dell’elemento"), {
    target: { files },
  });

describe("Scheda rapida, avanzamento e foto esplicite", () => {
  it("l’operatore autorizzato salva una scheda senza permessi d’ufficio",async()=>{
    m.officePermission=false;
    const e=editor({field:true,canEdit:true});
    m.save.mockResolvedValue({...e.detail.elements[0],values:{larghezza_foro:123}});
    fireEvent.change(screen.getByRole("spinbutton",{name:"Larghezza"}),{target:{value:"123"}});
    const save=screen.getByRole("button",{name:"Salva elemento"});expect(save).toBeEnabled();fireEvent.click(save);
    await waitFor(()=>expect(m.save).toHaveBeenCalledOnce());expect(m.save.mock.calls[0][3]).toBe("company1");
  });
  it("l’operatore in revisione non può compilare né caricare foto",()=>{
    m.officePermission=false;editor({field:true,canEdit:false});
    expect(screen.getByRole("spinbutton",{name:"Larghezza"})).toBeDisabled();expect(screen.getByRole("button",{name:"Salva elemento"})).toBeDisabled();
  });
  it("passa al prossimo elemento pulito senza scrivere né chiamare Salva", () => {
    const e = editor();
    fireEvent.click(screen.getByRole("button", { name: "Prossimo elemento" }));
    expect(e.next).toHaveBeenCalledWith(e.detail.elements[0]);
    expect(m.save).not.toHaveBeenCalled();
    expect(e.saved).not.toHaveBeenCalled();
  });
  it("Salva e prossimo aspetta il successo; nessun avanzamento su errore o doppio clic", async () => {
    const e = editor();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Larghezza" }), {
      target: { value: "123" },
    });
    let fail: (e: Error) => void = () => {};
    m.save.mockImplementation(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salva e prossimo" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva e prossimo" }));
    expect(m.save).toHaveBeenCalledOnce();
    expect(e.next).not.toHaveBeenCalled();
    fail(new Error("Connessione interrotta"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Connessione interrotta",
      ),
    );
    expect(e.next).not.toHaveBeenCalled();
    expect(screen.getByRole("spinbutton", { name: "Larghezza" })).toHaveValue(
      123,
    );
    m.save.mockResolvedValue({
      ...e.detail.elements[0],
      values: { larghezza_foro: 123 },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva e prossimo" }));
    await waitFor(() => expect(e.next).toHaveBeenCalledOnce());
    expect(e.saved).not.toHaveBeenCalled();
  });
  it("con foto in coda blocca l’uscita rapida e non promette di conservarle in localStorage", async () => {
    const e = editor();
    choose([new File(["x"], "foro.jpg", { type: "image/jpeg" })]);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Prossimo elemento" }),
      ).toBeDisabled(),
    );
    expect(e.ref.current?.keepDraft()).toBe(false);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Le foto da caricare non sono incluse",
      ),
    );
    expect(m.upload).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });
  it("cambiare passo su telefono conserva le foto selezionate e le misure", async () => {
    vi.stubGlobal("innerWidth", 390);
    editor();
    fireEvent.click(screen.getByRole("button", { name: "4. Verifica" }));
    choose([new File(["x"], "foro.jpg", { type: "image/jpeg" })]);
    fireEvent.click(screen.getByRole("button", { name: "1. Misure" }));
    expect(screen.getByRole("spinbutton", { name: "Larghezza" })).toHaveValue(
      120,
    );
    fireEvent.click(screen.getByRole("button", { name: "4. Verifica" }));
    expect(screen.getByText("foro.jpg")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Carica 1 foto nel rilievo" }),
    ).toBeEnabled();
    expect(m.upload).not.toHaveBeenCalled();
  });
  it("le foto caricate sono subito disponibili alle note; il ricalcolo della scheda richiede Salva esplicito", async () => {
    const e = editor();
    m.upload.mockResolvedValue({
      ...photo("uploaded"),
      element_id: e.detail.elements[0].id,
    });
    m.save.mockResolvedValue(e.detail.elements[0]);
    choose([new File(["x"], "foro.jpg", { type: "image/jpeg" })]);
    fireEvent.click(screen.getByText("Carica 1 foto nel rilievo"));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Salva elemento" }),
      ).toBeEnabled(),
    );
    expect(m.save).not.toHaveBeenCalled();
    expect(m.cache).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salva elemento" }));
    await waitFor(() => expect(e.saved).toHaveBeenCalledOnce());
    expect(m.save.mock.calls[0][0].media).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "uploaded" })]),
    );
  });
  it("selezione e rimozione rimangono locali; fotocamera e galleria sono ingressi separati", async () => {
    photos();
    expect(screen.getByLabelText("Scatta foto dell’elemento")).toHaveAttribute(
      "capture",
      "environment",
    );
    expect(screen.getByLabelText("Scegli foto dell’elemento")).toHaveAttribute(
      "multiple",
    );
    choose([new File(["x"], "vano.jpg", { type: "image/jpeg" })]);
    expect(m.upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi vano.jpg" }));
    expect(screen.queryByText("vano.jpg")).not.toBeInTheDocument();
    expect(m.upload).not.toHaveBeenCalled();
  });
  it("errore parziale: riprova soltanto le foto rimaste e mantiene l’associazione all’elemento", async () => {
    const p = photos();
    m.upload
      .mockResolvedValueOnce(photo("first"))
      .mockRejectedValueOnce(new Error("Offline"));
    choose([
      new File(["1"], "uno.jpg", { type: "image/jpeg" }),
      new File(["2"], "due.jpg", { type: "image/jpeg" }),
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "Carica 2 foto nel rilievo" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "1 foto già caricate",
      ),
    );
    expect(p.added).toHaveBeenCalledOnce();
    expect(screen.queryByText("uno.jpg")).not.toBeInTheDocument();
    expect(screen.getByText("due.jpg")).toBeInTheDocument();
    m.upload.mockResolvedValueOnce(photo("second"));
    fireEvent.click(
      screen.getByRole("button", { name: "Carica 1 foto nel rilievo" }),
    );
    await waitFor(() => expect(p.added).toHaveBeenCalledTimes(2));
    expect(m.upload).toHaveBeenCalledTimes(3);
    expect(m.upload.mock.calls[2][1].name).toBe("due.jpg");
    expect(m.upload.mock.calls[2][2]).toMatchObject({
      elementId: p.detail.elements[0].id,
      areaId: p.detail.elements[0].area_id,
      expectedCompanyId: "company1",
    });
  });
  it("esclude file non immagine e disabilita ogni upload in sola lettura", () => {
    const p = photos();
    choose([new File(["x"], "documento.pdf", { type: "application/pdf" })]);
    expect(screen.getByRole("alert")).toHaveTextContent("non è un'immagine");
    expect(m.upload).not.toHaveBeenCalled();
    p.unmount();
    photos(true);
    expect(screen.getByRole("button", { name: "Scatta foto" })).toBeDisabled();
    expect(screen.getByLabelText("Scegli foto dell’elemento")).toBeDisabled();
  });
});
