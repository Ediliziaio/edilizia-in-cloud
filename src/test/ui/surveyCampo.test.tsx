import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CampoSopralluogo from "@/pages/campo/CampoSopralluogo";
import CampoSopralluoghi from "@/pages/campo/CampoSopralluoghi";
import { SurveyOfficeReview } from "@/components/sopralluoghi/SurveyOfficeReview";
import { SurveyFieldHandoff } from "@/components/sopralluoghi/SurveyFieldHandoff";
import {
  SurveyAccessContext,
  useSurveyAccess,
} from "@/contexts/SurveyAccessContext";
import { makeSurveyDetail } from "../fixtures/surveyDetail";
const state = vi.hoisted(() => ({
  access: {
    data: { can_view: true, can_edit: true },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  list: {
    data: [] as unknown[],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  review: vi.fn(),
  submit: vi.fn(),
  readonly: false,
}));
vi.mock("@/hooks/useFieldSurveys", () => ({
  useFieldSurveyAccess: () => state.access,
  useFieldSurveys: () => state.list,
}));
vi.mock("@/lib/surveys/fieldAccess", () => ({
  reviewFieldSurvey: state.review,
  submitFieldSurvey: state.submit,
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSopralluoghi: true,
    solaLettura: state.readonly,
  }),
}));
vi.mock("@/pages/azienda/sopralluoghi/SopralluogoEditor", () => ({
  default: function FieldEditorFixture() {
    const a = useSurveyAccess();
    return <p>Editor {a.canEdit ? "modificabile" : "sola lettura"}</p>;
  },
}));
function show(node: React.ReactNode, path = "/campo/sopralluoghi/survey1") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/campo/sopralluoghi/:id" element={node} />
            <Route path="/campo/sopralluoghi" element={node} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
    client,
  };
}
beforeEach(() => {
  state.access = {
    data: { can_view: true, can_edit: true },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
  state.list = { data: [], isPending: false, isError: false, refetch: vi.fn() };
  state.readonly = false;
  state.review.mockReset().mockResolvedValue(undefined);
  state.submit.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);
describe("Sopralluoghi nell’app operai", () => {
  it("il comando compatto conserva un nome accessibile esplicito", () => {
    show(<SurveyFieldHandoff detail={makeSurveyDetail()} compact />);
    expect(
      screen.getByRole("button", { name: "Consegna all’ufficio" }),
    ).toHaveTextContent("Consegna");
  });
  it("filtra gli incarichi, mostra i conteggi e azzera senza perdere dati", () => {
    state.list.data = [
      {
        id: "s1",
        code: "SOP-1",
        status: "in_progress",
        address: "Via Libertà",
        city: "Roma",
        scheduled_at: null,
        field_review_note: null,
        elements: [{ count: 3 }],
        media: [{ count: 5 }],
      },
      {
        id: "s2",
        code: "SOP-2",
        status: "completed",
        address: "Via Ufficio",
        city: "Roma",
        scheduled_at: null,
        field_review_note: null,
      },
    ];
    show(<CampoSopralluoghi />, "/campo/sopralluoghi");
    expect(screen.getByText("3 elementi")).toBeVisible();
    expect(screen.getByText("5 allegati")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "In ufficio" }),
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/campo/sopralluoghi/s2",
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "liberta" },
    });
    expect(
      screen.getByText("Nessun sopralluogo con questi filtri"),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Azzera" }),
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });
  it("consegna solo dopo conferma esplicita", async () => {
    show(<SurveyFieldHandoff detail={makeSurveyDetail()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Consegna all’ufficio" }),
    );
    expect(state.submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Conferma consegna" }));
    await waitFor(() => expect(state.submit).toHaveBeenCalledWith("survey1"));
  });
  it("non consegna con modifiche non salvate o senza elementi", () => {
    const v = show(<SurveyFieldHandoff detail={makeSurveyDetail()} disabled />);
    expect(
      screen.getByRole("button", { name: "Consegna all’ufficio" }),
    ).toBeDisabled();
    v.unmount();
    show(<SurveyFieldHandoff detail={makeSurveyDetail({ elements: [] })} />);
    expect(
      screen.getByRole("button", { name: "Consegna all’ufficio" }),
    ).toBeDisabled();
  });
  it.each(["pending", "error", "revoked"])(
    "non monta dati tecnici con accesso %s",
    (mode) => {
      state.access.isPending = mode === "pending";
      state.access.isError = mode === "error";
      state.access.data.can_view = mode !== "revoked";
      show(<CampoSopralluogo />);
      expect(screen.queryByText(/Editor /)).not.toBeInTheDocument();
    },
  );
  it("dopo la consegna mostra solo consultazione", () => {
    state.access.data.can_edit = false;
    show(<CampoSopralluogo />);
    expect(screen.getByText("Editor sola lettura")).toBeInTheDocument();
  });
  it("revoca e rimuove i dettagli in cache", () => {
    state.access.data.can_view = false;
    const { client } = show(<CampoSopralluogo />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "assegnazione autorizzata",
    );
    expect(client.getQueryData(["sopralluogo", "survey1"])).toBeUndefined();
  });
  it("distingue un errore di rete dall’elenco vuoto", () => {
    state.access.isError = true;
    show(<CampoSopralluoghi />, "/campo/sopralluoghi");
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco");
    expect(
      screen.queryByText("Nessun sopralluogo disponibile"),
    ).not.toBeInTheDocument();
  });
  it("elenco compatto con stato e feedback, collegato al rilievo", () => {
    state.list.data = [
      {
        id: "survey1",
        code: "SOP-TEST",
        status: "completed",
        address: "Via di prova",
        city: "Roma",
        scheduled_at: null,
        field_review_note: "Controllare quota",
      },
    ];
    show(<CampoSopralluoghi />, "/campo/sopralluoghi");
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/campo/sopralluoghi/survey1",
    );
    expect(screen.getByText(/Da revisionare/)).toBeInTheDocument();
    expect(screen.getByText(/Controllare quota/)).toBeInTheDocument();
  });
  it("l’operatore non vede i comandi di approvazione", () => {
    const d = makeSurveyDetail();
    d.survey.status = "completed";
    show(
      <SurveyAccessContext.Provider value={{ field: true, canEdit: false }}>
        <SurveyOfficeReview detail={d} />
      </SurveyAccessContext.Provider>,
    );
    expect(
      screen.getByText("Consegnato: in attesa dell’ufficio"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it.each([true, false])(
    "ufficio: esito %s con nota obbligatoria",
    async (accept) => {
      const d = makeSurveyDetail();
      d.survey.status = "completed";
      show(<SurveyOfficeReview detail={d} />);
      const button = screen.getByRole("button", {
        name: accept
          ? "Conferma revisione dell’ufficio"
          : "Restituisci per integrazione",
      });
      expect(button).toBeDisabled();
      fireEvent.change(
        screen.getByLabelText(
          "Esito della verifica o motivo della restituzione",
        ),
        { target: { value: "Verifica di prova documentata" } },
      );
      fireEvent.click(button);
      await waitFor(() =>
        expect(state.review).toHaveBeenCalledWith(
          "survey1",
          accept,
          "Verifica di prova documentata",
        ),
      );
    },
  );
  it("ufficio in sola lettura non può approvare", () => {
    state.readonly = true;
    const d = makeSurveyDetail();
    d.survey.status = "completed";
    show(<SurveyOfficeReview detail={d} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
