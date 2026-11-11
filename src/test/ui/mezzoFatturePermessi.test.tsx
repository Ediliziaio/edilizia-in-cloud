import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
const state = vi.hoisted(() => ({
  perms: { canViewCosts: true, canEditMezzi: false, isAdmin: false, solaLettura: false },
  invoice: [{ id: "legame-test", importo: 10, confermata: false, origine: "manuale", fatture_ricevute: null as null }],
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1", name: "Azienda test" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.perms }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: state.invoice, isLoading: false, error: null as null }), useQueryClient: () => ({ invalidateQueries: vi.fn() }), useMutation: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/useMezzi", () => ({
  useMezzo: () => ({ data: { id: "m1", nome: "Mezzo test", tipo: "furgone", stato: "in_servizio", possesso: "proprieta", gestione: "singola", contatore_unita: "km" }, isLoading: false, error: null as null }),
  useMezzi: () => ({ data: [] as unknown[] }), useMezziScadenze: () => ({ data: [] as unknown[] }), useMezzoDocumenti: () => ({ data: [] as unknown[] }), useMezzoManutenzioni: () => ({ data: [] as unknown[] }), useMezzoSegnalazioni: () => ({ data: [] as unknown[] }), useMezziCategorie: () => ({ data: [] as unknown[] }),
  useMezziDisponibilita: () => ({ data: new Map() }), useUltimeViste: () => ({ data: new Map() }), useCopertineMezzi: () => ({ data: new Map() }), useEliminaMezzo: () => ({ mutate: vi.fn() }), useAzioneAttrezzo: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/components/mezzi/MezzoFormDialog", () => ({ MezzoFormDialog: (): null => null }));
vi.mock("@/components/mezzi/MezzoDocumentiSection", () => ({ MezzoDocumentiSection: (): null => null }));
vi.mock("@/components/mezzi/MezzoManutenzioniSection", () => ({ MezzoManutenzioniSection: (): null => null }));
vi.mock("@/components/mezzi/MezzoCostoOrario", () => ({ MezzoCostoOrario: (): null => null }));
vi.mock("@/components/mezzi/MezzoFotoSection", () => ({ MezzoFotoSection: (): null => null }));
vi.mock("@/components/mezzi/MezzoStoricoSection", () => ({ MezzoStoricoSection: (): null => null }));
vi.mock("@/components/mezzi/MezzoUsoCantieri", () => ({ MezzoUsoCantieri: (): null => null }));
vi.mock("@/components/mezzi/MezzoSegnalazioniSection", () => ({ MezzoSegnalazioniSection: (): null => null }));
vi.mock("@/components/mezzi/MezzoMontaggiSection", () => ({ MezzoMontaggiSection: (): null => null }));
vi.mock("@/components/mezzi/MezzoScansioniSection", () => ({ MezzoScansioniSection: (): null => null }));
vi.mock("@/components/mezzi/EtichetteQrDialog", () => ({ EtichetteQrDialog: (): null => null }));
vi.mock("@/components/mezzi/ViaggiMezzoWorkspace", () => ({ ViaggiMezzoWorkspace: (): null => null }));
import MezzoDetail from "@/pages/azienda/MezzoDetail";
beforeEach(() => { state.perms = { canViewCosts: true, canEditMezzi: false, isAdmin: false, solaLettura: false }; });
afterEach(cleanup);
function setup() {
  render(<MemoryRouter initialEntries={["/azienda/mezzi/m1"]}><Routes><Route path="/azienda/mezzi/:id" element={<MezzoDetail />} /></Routes></MemoryRouter>);
  fireEvent.keyDown(screen.getByRole("tab", { name: "Fatture" }), { key: "Enter" });
}
it("può consultare le fatture senza ricevere comandi di modifica dei legami", () => {
  setup();
  expect(screen.getByText("Da confermare")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Conferma" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Togli" })).not.toBeInTheDocument();
});
it("mantiene la modifica per chi può gestire i mezzi", () => {
  state.perms.canEditMezzi = true;
  setup();
  expect(screen.getByRole("button", { name: "Conferma" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Togli" })).toBeInTheDocument();
});
it("la sola lettura prevale anche sul ruolo amministratore", () => {
  state.perms.isAdmin = true; state.perms.solaLettura = true;
  setup();
  expect(screen.queryByRole("button", { name: "Togli" })).not.toBeInTheDocument();
});
it("mantiene la modifica per l’amministratore fuori dalla sola lettura", () => {
  state.perms.isAdmin = true;
  setup();
  expect(screen.getByRole("button", { name: "Togli" })).toBeInTheDocument();
});
