import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { makeSurveyDetail } from "../fixtures/surveyDetail";
import { SurveyWorkspace } from "@/components/sopralluoghi/SurveyWorkspace";
import { OrderSurveysCard } from "@/components/orders/OrderSurveysCard";
import { SurveyDetailDialog } from "@/components/sopralluoghi/SurveyDetailDialog";

const state = vi.hoisted(() => ({
  allowed: true,
  readonly: false,
  error: false,
  pending: false,
  data: null as ReturnType<typeof makeSurveyDetail> | null,
  hook: vi.fn(),
  list: [] as Array<{
    id: string;
    code: string;
    status: string;
    created_at: string;
  }>,
  refresh: vi.fn(),
  save: vi.fn(),
  duplicate: vi.fn(),
  cache: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: { id: "company1", name: "Azienda Demo" },
    user: { id: "user1" },
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSopralluoghi: state.allowed,
    solaLettura: state.readonly,
  }),
}));
vi.mock("@/hooks/useSurveyDetail", () => ({
  useSurveyDetail: (...args: unknown[]) => {
    state.hook(...args);
    return {
      allowed: state.allowed,
      data: state.data,
      isPending: state.pending,
      isError: state.error,
      error: state.error ? new Error("Accesso non consentito") : null,
      refetch: state.refresh,
    };
  },
  useSurveyReferences: () => ({
    data: {
      reference: "Contatto: Mario Demo",
      assignees: ["Luca Demo · Tecnico"],
    },
    isPending: false,
    isError: false,
  }),
}));
vi.mock("@/components/sopralluoghi/SurveyPdfTools", () => ({
  SurveyPdfTools: () => (
    <div>
      <button>Anteprima PDF</button>
      <button>Scarica PDF</button>
    </div>
  ),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: state.list, isLoading: false, isError: false }),
  useQueryClient: () => ({
    setQueriesData: state.cache,
    invalidateQueries: state.refresh,
  }),
}));
vi.mock("@/lib/surveys/saveElement", () => ({ saveSurveyElement: state.save }));
vi.mock("@/lib/surveys/duplicateElement", () => ({
  duplicateSurveyElement: state.duplicate,
}));
vi.mock("@/lib/api/surveys", () => ({ listSurveysByOrder: vi.fn() }));
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  state.allowed = true;
  state.readonly = false;
  state.error = false;
  state.pending = false;
  state.data = makeSurveyDetail();
  state.list = [
    {
      id: "survey1",
      code: "SOP-TEST-001",
      status: "in_progress",
      created_at: "2026-10-20T08:00:00Z",
    },
  ];
  vi.clearAllMocks();
  state.cache.mockImplementation((_, update) => {
    state.data = update(state.data);
  });
  state.save.mockImplementation(async (_, element, draft) => ({
    ...element,
    ...draft,
    updated_at: "2026-10-21T09:00:00Z",
  }));
  state.duplicate.mockImplementation(async (_, element, request) => ({
    ...element,
    id: request.id,
    area_id: request.areaId,
    element_label: request.label,
    quantity: 1,
    is_complete: false,
    values: {},
    updated_at: "2026-10-27T20:00:00Z",
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const wrap = (child: React.ReactNode) =>
  render(
    <MemoryRouter
      initialEntries={[
        "/azienda/ordini/order1?tab=cantiere&vista_cantiere=sopralluoghi",
      ]}
    >
      {child}
    </MemoryRouter>,
  );
describe("Sopralluogo consultabile senza modifiche", () => {
  it("duplica dalla consultazione e apre la nuova scheda senza cambiare l’originale", async () => {
    wrap(<SurveyWorkspace surveyId="survey1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Apri Finestra soggiorno" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Duplica$/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Crea copia da verificare" }),
    );
    await waitFor(() => expect(state.duplicate).toHaveBeenCalledTimes(1));
    expect(state.duplicate.mock.calls[0][2].mode).toBe("common");
    expect(state.data!.elements).toHaveLength(2);
    expect(state.data!.elements[0].values.larghezza).toBe(120);
  });
  it("rende PDF, riferimenti, misure e qualità dati subito accessibili senza campi di modifica", () => {
    wrap(<SurveyWorkspace surveyId="survey1" />);
    expect(screen.getByRole("button", { name: "Scarica PDF" })).toBeVisible();
    expect(screen.getByText("Contatto: Mario Demo")).toBeVisible();
    expect(screen.getByText(/120 cm × 140 cm/)).toBeVisible();
    expect(screen.getByText(/3 foto richieste mancanti/)).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Elimina area" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Via Roma 8, Milano")).toBeVisible();
  });
  it("mostra note e firma reali, non esempi", () => {
    wrap(<SurveyWorkspace surveyId="survey1" />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Note e firma" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText("Nessuna firma registrata.")).toBeVisible();
    expect(screen.getByText(/Verificare il supporto/)).toBeVisible();
    fireEvent.mouseDown(
      screen.getByRole("tab", { name: "Foto e allegati (0)" }),
      { button: 0, ctrlKey: false },
    );
    expect(
      screen.getByText(/Nessuna foto o allegato registrato/),
    ).toBeVisible();
  });
  it("nega la consultazione senza permesso e non presenta gli errori come dati vuoti", () => {
    state.allowed = false;
    const v = wrap(<SurveyWorkspace surveyId="survey1" />);
    expect(screen.getByRole("alert")).toHaveTextContent("permesso");
    expect(
      screen.queryByRole("button", { name: "Scarica PDF" }),
    ).not.toBeInTheDocument();
    v.unmount();
    state.allowed = true;
    state.error = true;
    wrap(<SurveyWorkspace surveyId="survey1" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Accesso non consentito",
    );
    expect(
      screen.queryByText("Nessuna area registrata."),
    ).not.toBeInTheDocument();
  });
  it("rispetta la sola lettura e consente la consultazione del PDF", () => {
    state.readonly = true;
    wrap(<SurveyWorkspace surveyId="survey1" />);
    expect(
      screen.queryByRole("link", { name: "Modifica" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anteprima PDF" })).toBeEnabled();
  });
  it("dalla commessa apre un popup completo e chiude senza cambiare URL", async () => {
    function Location() {
      return (
        <output aria-label="URL corrente">
          {useLocation().pathname}
          {useLocation().search}
        </output>
      );
    }
    wrap(
      <>
        <Location />
        <OrderSurveysCard orderId="order1" />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: /SOP-TEST-001/ }));
    const dialog = await screen.findByRole("dialog", {
      name: "Sopralluogo della commessa",
    });
    expect(dialog).toBeVisible();
    expect(state.hook).toHaveBeenCalledWith("survey1", "order1");
    expect(screen.getByLabelText("URL corrente")).toHaveTextContent(
      "/azienda/ordini/order1?tab=cantiere&vista_cantiere=sopralluoghi",
    );
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /SOP-TEST-001/ })).toBeVisible();
  });
  it("mostra il dettaglio selezionato con foto contestuali e torna al riepilogo", () => {
    wrap(<SurveyWorkspace surveyId="survey1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Apri Finestra soggiorno" }),
    );
    expect(screen.getByText("120 cm")).toBeVisible();
    expect(
      screen.getByText("Nessuna foto o allegato collegato a questo elemento."),
    ).toBeVisible();
    expect(screen.getByTestId("survey-fixed-navigation")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Tutti gli elementi" }));
    expect(
      screen.getByRole("button", { name: "Apri Finestra soggiorno" }),
    ).toBeVisible();
  });
  it("filtra le righe senza perdere l’indice e può azzerare la ricerca", () => {
    wrap(<SurveyWorkspace surveyId="survey1" />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "inesistente" },
    });
    expect(
      screen.queryByRole("button", { name: "Apri Finestra soggiorno" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary")).getByRole("button", {
        name: "Vai a Finestra soggiorno",
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Azzera ricerca" }));
    expect(
      screen.getByRole("button", { name: "Apri Finestra soggiorno" }),
    ).toBeVisible();
  });
  it("non salva durante la digitazione e aggiorna il riepilogo soltanto dopo conferma", async () => {
    wrap(<SurveyWorkspace surveyId="survey1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Apri Finestra soggiorno" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Modifica elemento" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Larghezza" }), {
      target: { value: "135" },
    });
    expect(state.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salva elemento" }));
    expect(await screen.findByText(/Elemento salvato/)).toBeVisible();
    expect(screen.getByText("135 cm")).toBeVisible();
    expect(state.save).toHaveBeenCalledTimes(1);
  });
  it("conserva la bozza e mostra l’errore se il salvataggio viene rifiutato", async () => {
    state.save.mockRejectedValue(
      new Error("Dato modificato da un’altra sessione"),
    );
    wrap(<SurveyWorkspace surveyId="survey1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Apri Finestra soggiorno" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Modifica elemento" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Larghezza" }), {
      target: { value: "135" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva elemento" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "un’altra sessione",
    );
    expect(screen.getByRole("spinbutton", { name: "Larghezza" })).toHaveValue(
      135,
    );
    expect(state.cache).not.toHaveBeenCalled();
  });
  it("chiede conferma prima di chiudere il popup con modifiche non salvate", () => {
    const close = vi.fn();
    wrap(
      <SurveyDetailDialog
        surveyId="survey1"
        orderId="order1"
        onClose={close}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apri Finestra soggiorno" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Modifica elemento" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Larghezza" }), {
      target: { value: "135" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(screen.getByRole("alertdialog")).toHaveAccessibleName(
      "Hai modifiche non salvate",
    );
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Continua a modificare" }),
    );
    expect(screen.getByRole("spinbutton", { name: "Larghezza" })).toHaveValue(
      135,
    );
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    fireEvent.click(screen.getByRole("button", { name: "Scarta modifiche" }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(state.save).not.toHaveBeenCalled();
  });
  it.each(["firmato", "lettura"])(
    "non abilita la modifica rapida: %s",
    (mode) => {
      if (mode === "firmato")
        state.data!.survey.client_signature_at = "2026-10-21T09:00:00Z";
      else state.readonly = true;
      wrap(<SurveyWorkspace surveyId="survey1" />);
      fireEvent.click(
        screen.getByRole("button", { name: "Apri Finestra soggiorno" }),
      );
      expect(
        screen.queryByRole("button", { name: "Modifica elemento" }),
      ).not.toBeInTheDocument();
      if (mode === "firmato")
        expect(screen.getByText(/modifica rapida disattivata/)).toBeVisible();
    },
  );
  it("non chiude né invia due volte mentre un salvataggio è in corso", async () => {
    let done!: (
      saved: ReturnType<typeof makeSurveyDetail>["elements"][number],
    ) => void;
    state.save.mockReturnValue(
      new Promise((resolve) => {
        done = resolve;
      }),
    );
    const close = vi.fn();
    wrap(
      <SurveyDetailDialog
        surveyId="survey1"
        orderId="order1"
        onClose={close}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apri Finestra soggiorno" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Modifica elemento" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Larghezza" }), {
      target: { value: "135" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva elemento" }));
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(close).not.toHaveBeenCalled();
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Salva elemento" }),
    ).toBeDisabled();
    done({
      ...state.data!.elements[0],
      values: { larghezza: 135, altezza: 140 },
    });
    await screen.findByText(/Elemento salvato/);
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(close).toHaveBeenCalledTimes(1);
  });
});
