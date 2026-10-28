import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { HrProfilo, HrSede } from "@/types/hr";
import { buildOrgTree } from "@/lib/personale/organizzazione";
const state = vi.hoisted(() => ({
  profiles: [] as HrProfilo[],
  sites: [] as HrSede[],
  profileError: false,
  siteError: false,
  peopleError: false,
  loading: false,
  readOnly: false,
  save: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  sync: vi.fn(),
  retry: vi.fn(),
  import: vi.fn(),
  company: "demo",
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => state.company,
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewPersone: true,
    solaLettura: state.readOnly,
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useOrganigramma", () => ({
  useOrganigramma: () => ({
    data: {
      profili: state.profiles,
      tree: buildOrgTree(state.profiles),
      reparti: ["Ufficio", "Tecnico"],
    },
    isLoading: state.loading,
    isError: state.profileError,
    refetch: state.retry,
  }),
  useSyncFromEmployees: () => ({ mutate: state.sync }),
}));
vi.mock("@/hooks/useHrSedi", () => ({
  useHrSedi: () => ({
    data: state.sites,
    isLoading: state.loading,
    isError: state.siteError,
    refetch: state.retry,
  }),
  useHrSedePeople: () => ({
    data: state.profiles,
    isLoading: state.loading,
    isError: state.peopleError,
    refetch: state.retry,
  }),
  useCreateHrSede: () => ({ mutate: state.create }),
  useUpdateHrSede: () => ({ mutate: state.save }),
  useDeleteHrSede: () => ({ mutate: state.remove }),
  useImportaSediAziendali: () => ({ mutate: state.import }),
}));
vi.mock("@/components/hr/HrProfiloSheet", () => ({
  HrProfiloSheet: ({
    open,
    profilo,
  }: {
    open: boolean;
    profilo: HrProfilo | null;
  }) =>
    open ? (
      <div role="dialog" aria-label="Profilo HR mock">
        {profilo?.nome || "Nuovo profilo aperto"}
      </div>
    ) : null,
}));
vi.mock("@/components/hr/HrSedeMap", () => ({
  default: () => <div data-testid="external-map">Mappa esterna</div>,
}));
import { TabOrganigramma } from "@/pages/azienda/personale/tabs/TabOrganigramma";
import { TabSedi } from "@/pages/azienda/personale/tabs/TabSedi";
const profile = (id: string, extra = {}): HrProfilo =>
  ({
    id,
    nome: id,
    cognome: "Rossi",
    responsabile_id: null,
    reparto: "Ufficio",
    sede_id: "s1",
    attivo: true,
    ...extra,
  }) as HrProfilo;
const site = (id: string, extra = {}): HrSede =>
  ({
    id,
    nome: id,
    attiva: true,
    lat: null,
    lng: null,
    raggio_mt: 200,
    ...extra,
  }) as HrSede;
function Url() {
  return <output data-testid="url">{useLocation().search}</output>;
}
function mount(element: React.ReactNode, query = "") {
  return render(
    <MemoryRouter initialEntries={[`/azienda/personale?${query}`]}>
      {element}
      <Url />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  Object.assign(state, {
    profiles: [
      profile("Direttore"),
      profile("Anna", { responsabile_id: "Direttore", reparto: "Tecnico" }),
      profile("Autonomo", { sede_id: null }),
    ],
    sites: [
      site("s1", { nome: "Milano" }),
      site("s2", { nome: "Roma", attiva: false, lat: 41, lng: 12 }),
    ],
    profileError: false,
    siteError: false,
    peopleError: false,
    loading: false,
    readOnly: false,
    company: "demo",
  });
  vi.clearAllMocks();
  state.create.mockReset();
});
afterEach(cleanup);

describe("organigramma: flussi e regressioni", () => {
  it("resets open dialogs when the company changes", () => {
    const view = mount(<TabOrganigramma />);
    fireEvent.click(screen.getByRole("button", { name: "Nuovo profilo" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    state.company = "other";
    view.rerender(
      <MemoryRouter>
        <TabOrganigramma />
        <Url />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("keeps user zoom until fit is explicitly requested", () => {
    mount(<TabOrganigramma />);
    const initial = screen.getByLabelText("Zoom organigramma").textContent;
    fireEvent.click(
      screen.getByRole("button", { name: "Riduci organigramma" }),
    );
    expect(screen.getByLabelText("Zoom organigramma").textContent).not.toBe(
      initial,
    );
    fireEvent.click(screen.getByRole("button", { name: "Adatta alla vista" }));
    expect(screen.getByLabelText("Zoom organigramma").textContent).toBe(
      initial,
    );
  });
  it("opens the first profile dialog even with no profiles", () => {
    state.profiles = [];
    mount(<TabOrganigramma />);
    fireEvent.click(screen.getByRole("button", { name: "Nuovo profilo" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Nuovo profilo aperto",
    );
  });
  it("shows a query error instead of pretending there are no employees", () => {
    state.profileError = true;
    state.profiles = [];
    mount(<TabOrganigramma />);
    expect(screen.getByRole("alert")).toHaveTextContent("non disponibile");
    expect(screen.queryByText("Nessun profilo nell’organigramma")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.retry).toHaveBeenCalled();
  });
  it("separates independent people and preserves ancestors in search", () => {
    mount(<TabOrganigramma />);
    expect(
      within(
        screen.getByRole("region", { name: "Profili senza collegamenti" }),
      ).getByText("Autonomo Rossi"),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca persona nell’organigramma" }),
      { target: { value: "Anna" } },
    );
    const tree = screen.getByRole("region", { name: "Albero organizzativo" });
    expect(within(tree).getByText("Direttore Rossi")).toBeInTheDocument();
    expect(within(tree).getByText("Anna Rossi")).toBeInTheDocument();
    expect(screen.queryByText("Autonomo Rossi")).toBeNull();
  });
  it("collapses and expands branches without remote mutations", () => {
    mount(<TabOrganigramma />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Comprimi collaboratori di Direttore Rossi",
      }),
    );
    expect(screen.queryByText("Anna Rossi")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Espandi collaboratori di Direttore Rossi",
      }),
    );
    expect(screen.getByText("Anna Rossi")).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
  });
  it("handles no results with reset, and exposes keyboard profile buttons in list view", () => {
    mount(<TabOrganigramma />);
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca persona nell’organigramma" }),
      { target: { value: "zzzz" } },
    );
    expect(
      screen.getByText("Nessuna persona corrisponde ai filtri."),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Mostra tutte le persone" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Apri profilo di Anna Rossi" }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Anna");
  });
  it("keeps existing URL state while selecting a site", () => {
    mount(<TabOrganigramma />, "tab=organigramma&mese=2026-10&keep=yes");
    fireEvent.change(screen.getByLabelText("Filtra sede"), {
      target: { value: "s1" },
    });
    expect(screen.getByTestId("url")).toHaveTextContent("sede_hr=s1");
    expect(screen.getByTestId("url")).toHaveTextContent("keep=yes");
    expect(screen.queryByText("Autonomo Rossi")).toBeNull();
  });
  it("read-only can inspect but cannot create or sync profiles", () => {
    state.readOnly = true;
    mount(<TabOrganigramma />);
    expect(
      screen.getByRole("button", { name: "Nuovo profilo" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Importa dipendenti mancanti" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Autonomo Rossi/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("sola lettura");
    expect(
      screen.queryByRole("dialog", { name: "Profilo HR mock" }),
    ).toBeNull();
  });
});

describe("sedi: filtri, GPS, persone e scritture esplicite", () => {
  it("separates active from GPS-configured and filters without writes", () => {
    mount(<TabSedi />);
    expect(
      screen.getByText("Area timbratura da configurare"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filtra sedi"), {
      target: { value: "inactive" },
    });
    expect(screen.queryByRole("heading", { name: "Milano" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Roma" })).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
  });
  it("shows people including inactive and navigates to the scoped organigramma", () => {
    state.profiles.push(profile("Cessato", { attivo: false }));
    mount(<TabSedi />, "tab=sedi&mese=2026-10");
    fireEvent.click(
      screen.getByRole("button", { name: "Dettagli sede Milano" }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Cessato Rossi");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Vedi persone attive nell’organigramma",
      }),
    );
    expect(screen.getByTestId("url")).toHaveTextContent("tab=organigramma");
    expect(screen.getByTestId("url")).toHaveTextContent("sede_hr=s1");
    expect(screen.getByTestId("url")).toHaveTextContent("mese=2026-10");
  });
  it("does not turn people loading errors into zero assigned", () => {
    state.peopleError = true;
    mount(<TabSedi />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Persone assegnate non disponibili",
    );
    expect(screen.queryByText("0 persone attive")).toBeNull();
  });
  it("does not turn a sites error into an empty state", () => {
    state.siteError = true;
    state.sites = [];
    mount(<TabSedi />);
    expect(screen.getByRole("alert")).toHaveTextContent("Sedi non disponibili");
    expect(screen.queryByText("Nessuna sede configurata")).toBeNull();
  });
  it("rejects a single coordinate and preserves the dialog", () => {
    mount(<TabSedi />);
    fireEvent.click(screen.getByRole("button", { name: "Nuova sede" }));
    fireEvent.change(screen.getByLabelText("Nome sede *"), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByLabelText("Latitudine"), {
      target: { value: "45" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crea sede" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "sia latitudine sia longitudine",
    );
    expect(state.create).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("creates without GPS only on explicit save and closes only on success", () => {
    mount(<TabSedi />);
    fireEvent.click(screen.getByRole("button", { name: "Nuova sede" }));
    fireEvent.change(screen.getByLabelText("Nome sede *"), {
      target: { value: "  Test  " },
    });
    expect(state.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Crea sede" }));
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: "Test",
        lat: null,
        lng: null,
        raggio_mt: 200,
      }),
      expect.any(Object),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("preserves entered data on save failure", () => {
    state.create.mockImplementation((_data, options) => options.onError());
    mount(<TabSedi />);
    fireEvent.click(screen.getByRole("button", { name: "Nuova sede" }));
    fireEvent.change(screen.getByLabelText("Nome sede *"), {
      target: { value: "Test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crea sede" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Salvataggio non riuscito",
    );
    expect(screen.getByLabelText("Nome sede *")).toHaveValue("Test");
  });
  it("does not load external maps until explicitly requested", () => {
    mount(<TabSedi />);
    fireEvent.click(
      screen.getByRole("button", { name: "Configura sede Roma" }),
    );
    expect(
      screen.getByText("Schema indicativo, non cartografico"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("external-map")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Mostra mappa e raggio" }),
    ).toBeInTheDocument();
  });
  it("enforces read-only and labels import honestly", () => {
    state.readOnly = true;
    mount(<TabSedi />);
    expect(screen.getByRole("button", { name: "Nuova sede" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Importa sedi mancanti" }),
    ).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Configura sede/ })).toBeNull();
    expect(
      screen.getByText(/non è una sincronizzazione automatica/),
    ).toBeInTheDocument();
  });
});
