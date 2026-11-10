import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
const state = vi.hoisted(() => ({ readOnly: true, data: {} as Record<string, unknown> }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-test" }, effectiveCompany: { id: "company-test" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ solaLettura: state.readOnly, onlyAssigned: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({ data: state.data[String(queryKey[0])] ?? [] as unknown[], isLoading: false, isError: false }), useQueryClient: () => ({ invalidateQueries: vi.fn() }), useMutation: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/components/manutenzione/NuovoImpiantoWizard", () => ({ NuovoImpiantoWizard: (): null => null }));
vi.mock("@/components/interventi/NuovoInterventoDialog", () => ({ NuovoInterventoDialog: (): null => null }));
vi.mock("@/components/contacts/QuickContactSendDialog", () => ({ QuickContactSendDialog: (): null => null }));
vi.mock("@/components/tickets/RapportiniIntervento", () => ({ RapportiniIntervento: (): null => null }));
vi.mock("@/components/tickets/CreaFatturaAssistenzaDialog", () => ({ CreaFatturaAssistenzaDialog: (): null => null }));
import ManutenzioneList from "@/pages/azienda/ManutenzioneList";
import ImpiantoDetail from "@/pages/azienda/ImpiantoDetail";
import { ManutenzionePipeline, type ImpiantoStato } from "@/components/manutenzione/ManutenzionePipeline";
beforeEach(() => {
  state.readOnly = true;
  state.data = {
    impianto: { id: "impianto-test", tipo_impianto: "infissi", marca: "Marca test", modello: "Modello test", attivo: true, data_installazione: "2025-01-01", customer: { id: "cliente-test", first_name: "Cliente", last_name: "test" } },
    "contratto-impianto": { id: "contratto-test", nome_contratto: "Contratto test", stato: "attivo", importo_canone: 100, tipo_fatturazione: "annuale", data_inizio: "2025-01-01", rinnovo_automatico: false },
    "piani-impianto": [{ id: "piano-test", titolo: "Piano test", frequenza_tipo: "annuale", prossima_scadenza: "2030-01-01" }],
  };
});
afterEach(cleanup);
it("la sola lettura disabilita la creazione dalla lista senza bloccare i filtri", () => {
  render(<MemoryRouter><ManutenzioneList /></MemoryRouter>);
  expect(screen.getByRole("button", { name: /^Nuovo/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: /^Tutti/ })).toBeEnabled();
});
it("chi può scrivere mantiene il comando nuovo impianto", () => {
  state.readOnly = false;
  render(<MemoryRouter><ManutenzioneList /></MemoryRouter>);
  expect(screen.getByRole("button", { name: /^Nuovo/ })).toBeEnabled();
});
it("in scheda blocca modifica, archiviazione, fatturazione e registrazioni", () => {
  render(<MemoryRouter initialEntries={["/azienda/manutenzione/impianto/impianto-test"]}><Routes><Route path="/azienda/manutenzione/impianto/:id" element={<ImpiantoDetail />} /></Routes></MemoryRouter>);
  for (const name of ["Modifica impianto", "Archivia impianto", "Fattura canone", "Registra esecuzione", "Esegui", "Nuovo intervento"]) {
    expect(screen.getByRole("button", { name })).toBeDisabled();
  }
  expect(screen.getByRole("button", { name: "Torna agli impianti" })).toBeEnabled();
});
it("il Kanban in sola lettura conserva l’apertura ma blocca Pianifica e Completa", () => {
  const item: ImpiantoStato = { id: "i1", tipo_impianto: "infissi", marca: null, modello: null, garanzia_scadenza: null, data_installazione: null, customer: null, stato: "in_regola", prossimaScadenza: "2030-01-01", prossimoPianoId: "p1", contrattoNome: null, tecnicoId: null, tecnicoNome: null, priorita: "bassa" };
  const open = vi.fn();
  render(<ManutenzionePipeline impianti={[item]} onOpen={open} onPianifica={vi.fn()} onCompleta={vi.fn()} solaLettura />);
  expect(screen.getByRole("button", { name: "Pianifica" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Completa" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /infissi/ }));
  expect(open).toHaveBeenCalledExactlyOnceWith("i1");
});

it("fuori dalla sola lettura mantiene i comandi della scheda impianto", () => {
  state.readOnly = false;
  render(<MemoryRouter initialEntries={["/azienda/manutenzione/impianto/impianto-test"]}><Routes><Route path="/azienda/manutenzione/impianto/:id" element={<ImpiantoDetail />} /></Routes></MemoryRouter>);
  for (const name of ["Modifica impianto", "Archivia impianto", "Fattura canone", "Registra esecuzione", "Esegui", "Nuovo intervento"]) {
    expect(screen.getByRole("button", { name })).toBeEnabled();
  }
});
