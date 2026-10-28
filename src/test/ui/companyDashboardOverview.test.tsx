import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { useRegiaOperativa } from "@/hooks/useRegiaOperativa";
import CompanyDashboard from "@/pages/azienda/CompanyDashboard";

const mocks = vi.hoisted(() => ({
  regia: vi.fn(),
  permissions: {
    isAdmin: false,
    canEditOrders: true,
    solaLettura: false,
    canViewCruscotto: true,
  },
  mutate: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: { id: "company", name: "Impresa di prova" },
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => mocks.permissions,
}));
vi.mock("@/hooks/useSubscriptionLimits", () => ({
  useSubscriptionLimits: () => ({
    isLoading: false,
    currentPlan: {},
    isModuleEnabled: () => true,
  }),
}));
vi.mock("@/hooks/useRegiaOperativa", () => ({
  GIORNI_AGENDA: 14,
  useRegiaOperativa: mocks.regia,
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/components/dashboard/DashboardSelectorBar", () => ({
  DashboardSelectorBar: () => <button>Seleziona dashboard</button>,
}));
vi.mock("@/components/onboarding/OnboardingChecklist", () => ({
  OnboardingChecklist: (): null => null,
}));
vi.mock("@/hooks/useAzioniRegia", () => ({
  useAzioniRegia: () => ({
    spostaArrivo: { isPending: false, mutate: mocks.mutate },
    spostaFineLavori: { isPending: false, mutate: mocks.mutate },
    segnaFinita: { isPending: false, mutate: mocks.mutate },
  }),
}));

function dati(): ReturnType<typeof useRegiaOperativa> {
  return {
    isLoading: false,
    error: null,
    agenda: [
      ...Array.from({ length: 9 }, (_, i) => ({
        id: `lavoro-${i}`,
        tipo: "lavoro" as const,
        giorno: "2026-10-26",
        cosa: "Inizio lavori",
        riferimento: `LAVORO-${i}`,
        cliente: `Cliente ${i}`,
        orderId: `order-${i}`,
      })),
      {
        id: "app",
        tipo: "appuntamento" as const,
        giorno: "2026-10-27",
        cosa: "Appuntamento",
        riferimento: "Incontro tecnico",
        cliente: "Cliente appuntamento",
        orderId: null,
      },
      {
        id: "merce",
        tipo: "merce" as const,
        giorno: "2026-10-28",
        cosa: "Consegna",
        riferimento: "Materiali del bagno",
        cliente: null,
        orderId: null,
      },
    ],
    numeri: { lavori: 9, merce: 1, appuntamenti: 1, ticket: 0 },
    daApprovare: 0,
    cantieriInRitardo: 1,
    merceInRitardo: { totale: 0, voci: [] },
    daSeguire: [
      {
        id: "order-0",
        codice: "LAVORO-0",
        cliente: "Cliente 0",
        fase: "Lavori",
        ritardo: 2,
        prossima: null,
        scadenza: "2026-10-24",
      },
    ],
    faseFinale: { id: "finale", nome: "Conclusa" },
  };
}

function apri() {
  render(
    <MemoryRouter>
      <CompanyDashboard />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions.solaLettura = false;
  mocks.regia.mockReturnValue(dati());
});

describe("panoramica operativa azienda", () => {
  it("offre una sola intestazione e mantiene gli ingressi alle aree operative", () => {
    apri();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Calendario" })).toHaveAttribute(
      "href",
      "/azienda/calendario",
    );
    expect(
      screen.getByRole("link", { name: "Nuovo preventivo" }),
    ).toHaveTextContent("Nuovo preventivo");
    expect(
      screen.getByRole("region", { name: "Commesse da seguire" }),
    ).toBeInTheDocument();
  });

  it("filtra l'intera agenda, trovando anche eventi oltre le prime quattro righe", () => {
    apri();
    expect(screen.queryByText(/Incontro tecnico/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Appuntamenti" }));
    expect(
      screen.getByRole("button", { name: "Appuntamenti" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Incontro tecnico/)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Inizio lavori/ }),
    ).not.toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("espande la lista e ripristina il limite quando cambia il filtro", () => {
    apri();
    expect(screen.getByText("4 di 9 eventi")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Inizio lavori/ })).toHaveLength(4);
    fireEvent.click(
      screen.getByRole("button", { name: "Mostra altri eventi" }),
    );
    expect(screen.getAllByRole("link", { name: /Inizio lavori/ })).toHaveLength(
      9,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cantieri" }));
    expect(screen.getAllByRole("link", { name: /Inizio lavori/ })).toHaveLength(4);
  });

  it("conserva la sola lettura sulle azioni dirette delle commesse", () => {
    mocks.permissions.solaLettura = true;
    apri();
    expect(
      screen.queryByRole("button", { name: "Sposta la fine lavori" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Segna finita" }),
    ).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole("region", { name: "Commesse da seguire" }),
      ).getByRole("link", { name: /LAVORO-0/ }),
    ).toHaveAttribute("href", "/azienda/ordini/order-0");
  });

  it("distingue un errore di caricamento dall'assenza di eventi", () => {
    mocks.regia.mockReturnValue({
      ...dati(),
      error: new Error("offline"),
      agenda: [],
    });
    apri();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Non riesco a caricare",
    );
    expect(
      screen.getByRole("button", { name: "Aggiorna" }),
    ).toBeInTheDocument();
  });
});
