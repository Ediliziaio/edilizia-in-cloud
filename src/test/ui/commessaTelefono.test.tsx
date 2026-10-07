import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { OrderWorkPhases } from "@/components/orders/OrderWorkPhases";
import { OrdineDetailHeader } from "@/components/orders/OrdineDetailHeader";
import { OrderQuickActions } from "@/components/orders/OrderQuickActions";
import { assignment, phase } from "../fixtures/workPlanning";
import type { WorkPhase, PhaseAssignment } from "@/hooks/useOrderWorkPhases";

/**
 * La commessa dal telefono (06/10/2026): una fila sola di azioni in testata,
 * in Lavorazioni conteggio e «Aggiungi fasi» su una riga, ricerca coi filtri
 * nel pannello dal basso, ogni fase una riga, le completate in fondo.
 */

const state = vi.hoisted(() => ({
  mobile: true,
  permissions: { canEditOrders: true, canViewCosts: true, canManagePayments: true },
  phases: [] as WorkPhase[], unassigned: [] as PhaseAssignment[], loading: false, error: false,
  add: vi.fn(), update: vi.fn(), remove: vi.fn(), addPhase: vi.fn(), applyTemplate: vi.fn(), updatePhase: vi.fn(), refetch: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permissions }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] as unknown[] }), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/components/orders/AlertScostamentoSal", () => ({ AlertScostamentoSal: (): null => null }));
vi.mock("@/hooks/useOrderScheduleHealth", () => ({ useOrderScheduleHealth: () => ({ data: null as null }) }));
vi.mock("@/hooks/useOrderWorkPhases", () => ({
  PHASE_TEMPLATES: [{ key: "simple", label: "Intervento semplice", hint: "Due fasi", phases: ["Preparazione", "Posa"] }],
  useOrderWorkPhases: () => ({
    phases: state.phases, unassigned: state.unassigned, isLoading: state.loading, isError: state.error, refetch: state.refetch,
    employees: [{ id: "e1", label: "Mario Rossi" }], externalTeams: [{ id: "s1", label: "Edil Alfa", kind: "esterna" }, { id: "si", label: "Squadra dipendenti", kind: "interna" }],
    totals: { preventivo: 200, consuntivo: 120, scostamento: -80 },
    addPhase: { mutate: state.addPhase }, applyTemplate: { mutate: state.applyTemplate }, updatePhase: { mutate: state.updatePhase }, deletePhase: { mutate: state.remove },
    addAssignment: { mutate: state.add }, updateAssignment: { mutateAsync: state.update }, deleteAssignment: { mutateAsync: state.remove },
    materialsByPhase: new Map(), unassignedMaterials: [] as unknown[], setMaterialPhase: { mutate: vi.fn() }, splitMaterial: { mutate: vi.fn() },
  }),
}));
vi.mock("@/components/orders/OrderLaborCosts", () => ({ OrderLaborCosts: ({ editable, parte }: { editable: boolean; parte?: string }) => <div>Ditte {parte} {editable ? "modificabili" : "sola lettura"}</div> }));
vi.mock("@/components/orders/CantiereLogistica", () => ({ CantiereLogistica: () => <div>Il cantiere</div> }));
vi.mock("@/hooks/useCantiereLogistica", () => ({ useMezziLavoro: () => ({ data: { sul_cantiere: [] as Array<Record<string, unknown>>, con_le_persone: [
  { id: "m1", nome: "Ducato bianco", tipo: "furgone", targa: "GF 482 KD", persona: "Luca Ferrari", fasi: ["p1"], a_bordo: ["Livella laser"], altrove: null as string | null },
] } }) }));
vi.mock("@/components/orders/AppCantiere", () => ({ AppCantiere: ({ modificabile }: { modificabile: boolean }) => <div>Nell'app {modificabile ? "capocantiere modificabile" : "sola lettura"}</div> }));
vi.mock("@/components/orders/CreatePurchaseOrderButton", () => ({ CreatePurchaseOrderButton: () => <button>Crea OdA</button> }));
// Squadre della commessa (26/09): qui conta il blocco delle lavorazioni.
vi.mock("@/components/manodopera/SquadreCommessa", () => ({
  SquadreCommessa: ({ soloFinestra }: { soloFinestra?: boolean }) => soloFinestra ? null : <div>Squadre della commessa</div>,
  SquadreFase: () => <div>Squadre della fase</div>,
}));
vi.mock("@/components/manodopera/NoteCantiere", () => ({
  NoteCantiere: ({ phaseId }: { phaseId?: string | null }) => <div>{phaseId ? `Note della fase ${phaseId}` : "Note della commessa"}</div>,
}));
vi.mock("@/hooks/useOperai", () => ({
  useSquadreCommessa: () => ({ data: [] as unknown[] }),
  useNoteCantiere: () => ({ data: [] as unknown[] }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("@/components/telephony/SoftphoneProvider", () => ({ useSoftphoneOptional: (): null => null }));
vi.mock("@/components/contacts/QuickContactSendDialog", () => ({ QuickContactSendDialog: (): null => null }));
vi.mock("@/components/appointments/AppointmentDialog", () => ({ AppointmentDialog: (): null => null }));

const setteFasi = () => [
  phase({ id: "p1", name: "Opere murarie", status: "in_corso", start_date: "2026-09-20", end_date: "2026-09-30" }),
  phase({ id: "p2", name: "Collaudo", status: "completata", assignments: [] }),
  ...["Demolizioni", "Impianti", "Massetti", "Intonaci", "Pavimenti"].map((name, i) => phase({ id: `px${i}`, name, status: "da_iniziare", assignments: [] })),
];

beforeEach(() => {
  vi.clearAllMocks();
  state.mobile = true;
  state.phases = setteFasi();
  state.unassigned = []; state.loading = false; state.error = false;
  Object.assign(state.permissions, { canEditOrders: true, canViewCosts: true, canManagePayments: true });
});
afterEach(cleanup);

describe("Lavorazioni dal telefono", () => {
  it("conteggio e «Aggiungi fasi» su una riga; niente rapportini né «Verifica» (stanno in Diario e nei filtri)", () => {
    render(<OrderWorkPhases orderId="order" view="lavorazioni" onOpenReports={vi.fn()} />);
    expect(document.body.textContent).toContain("7 fasi · 1 in corso");
    expect(screen.getByRole("button", { name: /Aggiungi fasi/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vai ai rapportini" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Verifica/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Fasi di lavoro", { selector: "h3" })).not.toBeInTheDocument();
  });

  it("ogni fase è una riga: nome, date e chi la fa, avanzamento; aperta mostra stato e menu", () => {
    render(<OrderWorkPhases orderId="order" view="lavorazioni" />);
    const riga = screen.getByRole("button", { name: /^Opere murarie/ });
    expect(riga).toHaveTextContent("Opere murarie20/09–30/09 · Mario Rossi40%");
    // in corso: aperta di serie, con stato e menu sotto la riga
    expect(riga).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("combobox", { name: "Stato di Opere murarie" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Altre azioni per Opere murarie" })).toBeInTheDocument();
    fireEvent.click(riga);
    expect(riga).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("combobox", { name: "Stato di Opere murarie" })).not.toBeInTheDocument();
    // da iniziare, chiusa: nessuno la fa ancora (il ritardo dipende da oggi: non si controlla qui)
    expect(screen.getByRole("button", { name: /^Demolizioni/ })).toHaveTextContent("Demolizioni20/09–30/09 · nessuno");
  });

  it("i filtri stanno nel pannello dal basso, accanto alla ricerca, coi numeri", () => {
    render(<OrderWorkPhases orderId="order" view="lavorazioni" />);
    fireEvent.click(screen.getByRole("button", { name: "Filtri" }));
    const pannello = screen.getByRole("dialog");
    expect(within(pannello).getByRole("button", { name: /^Completate/ })).toHaveTextContent("Completate1");
    fireEvent.click(within(pannello).getByRole("button", { name: /^Da iniziare/ }));
    expect(within(pannello).getByRole("button", { name: "Mostra 5" })).toBeInTheDocument();
    fireEvent.click(within(pannello).getByRole("button", { name: "Mostra 5" }));
    expect(screen.queryByRole("button", { name: /^Opere murarie/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filtri" })).toHaveTextContent("1");
  });

  it("le completate si aprono in fondo all'elenco", () => {
    render(<OrderWorkPhases orderId="order" view="lavorazioni" />);
    expect(screen.queryByRole("button", { name: /^Collaudo/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mostra 1 fase completata" }));
    expect(screen.getByRole("button", { name: /^Collaudo/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nascondi le completate" })).toBeInTheDocument();
  });

  it("dal computer resta tutto com'era", () => {
    state.mobile = false;
    render(<OrderWorkPhases orderId="order" view="lavorazioni" onOpenReports={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Vai ai rapportini" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dettagli Opere murarie" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Filtri" })).not.toBeInTheDocument();
  });
});

describe("Testata della commessa dal telefono", () => {
  const testata = (azioni?: React.ReactNode) => {
    const modifica = vi.fn();
    render(
      <MemoryRouter>
        <OrdineDetailHeader
          ordineId="o1" orderCode="ORD-001" descrizione="Bagno completo" dataCreazione="2026-07-02T10:00:00Z" nomeCliente="Mario Bianchi"
          onDuplica={vi.fn()} onModifica={modifica} onRegistraIncasso={vi.fn()} onElimina={vi.fn()}
          azioniTelefono={azioni}
        />
      </MemoryRouter>,
    );
    return { modifica };
  };

  it("una fila sola: «Registra incasso» e le icone delle azioni rapide; «Modifica» nel menu accanto al titolo", async () => {
    const { modifica } = testata(
      <OrderQuickActions inline orderId="o1" orderCode="ORD-001" companyId="c" customer={null} getPdfBlob={async () => null} onCreateTask={vi.fn()} onOpenFiles={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /Registra incasso/ })).toBeInTheDocument();
    for (const nome of ["Nuova attività", "Documenti", "Altre azioni"]) {
      expect(screen.getByRole("button", { name: nome })).toHaveTextContent("");
    }
    expect(screen.queryByRole("button", { name: "Modifica commessa" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "Altre azioni commessa" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Modifica commessa" }));
    expect(modifica).toHaveBeenCalledOnce();
  });

  it("dal computer «Modifica» è un bottone e il menu non lo ripete", async () => {
    state.mobile = false;
    testata();
    expect(screen.getByRole("button", { name: "Modifica commessa" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "Altre azioni commessa" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: /Diario/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Modifica commessa" })).not.toBeInTheDocument();
  });
});
