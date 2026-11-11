import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import type { DocumentoAzienda } from "@/types/documentiAzienda";
const state = vi.hoisted(() => ({ save: vi.fn(), readError: false, retry: vi.fn() }));
const documento: DocumentoAzienda = {
  id: "documento-demo", company_id: "demo", categoria: "certificazioni", titolo: "Documento demo", ente: null, numero: null,
  sede_id: null, sede_nome: null, data_documento: "2026-01-01", data_scadenza: "2026-02-01", rinnovo_mesi: 12,
  alert_giorni_prima: 60, alert_destinatari: [], file_path: null, file_name: null, note: null, sostituisce_id: null,
  created_at: "2026-01-01", updated_at: "2026-01-01", stato: "scaduto", giorni_mancanti: -10, versioni_precedenti: 0,
};
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "demo" }));
vi.mock("@/hooks/useSediAnalytics", () => ({ useSediList: () => ({ data: [{ id: "sede-demo", nome: "Sede demo" }] }) }));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({ useCompanyStaffUsers: () => ({ data: [] as unknown[] }) }));
vi.mock("@/components/documentiAzienda/ConfermaDateLette", () => ({ default: (): null => null }));
vi.mock("@/hooks/useDocumentiAzienda", () => ({
  useDocumentiAzienda: () => ({ data: state.readError ? [] : [documento], isLoading: false, isError: state.readError, refetch: state.retry }),
  useElencoDiPartenzaDaMostrare: () => ({ data: false }),
  useStoricoDocumento: () => ({ data: [] as unknown[] }),
  useSalvaDocumentoAzienda: () => ({ mutateAsync: state.save }),
  useRinnovaDocumentoAzienda: () => ({ mutateAsync: state.save }),
  useEliminaDocumentoAzienda: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
import SettingsDocumentiAzienda from "@/pages/azienda/settings/SettingsDocumentiAzienda";
beforeEach(() => { state.save.mockReset(); state.readError = false; state.retry.mockClear(); });
afterEach(cleanup);
function apri(mode: "nuovo" | "rinnovo") {
  render(<SettingsDocumentiAzienda />);
  expect(screen.getByRole("button", { name: "Modifica documento Documento demo" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Elimina documento Documento demo" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: mode === "nuovo" ? "Aggiungi documento" : "Rinnovato" }));
  if (mode === "nuovo") {
    fireEvent.change(screen.getByRole("textbox", { name: "Nome del documento" }), { target: { value: "Nuovo documento demo" } });
    for (const name of ["Dove lo metto", "Si rinnova", "Vale per"]) expect(screen.getByRole("combobox", { name })).toBeInTheDocument();
  }
  return screen.getByRole("button", { name: mode === "nuovo" ? "Salva" : "Registra il rinnovo" });
}
it.each(["nuovo", "rinnovo"] as const)("%s: blocca richieste ripetute, campi e chiusura fino al termine", async (mode) => {
  let resolve!: (value: string) => void;
  state.save.mockImplementation(() => new Promise<string>((r) => { resolve = r; }));
  const save = apri(mode);
  fireEvent.click(save);
  fireEvent.click(save);
  await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
  expect(screen.getByRole("group", { name: mode === "nuovo" ? "Dati del documento" : "Dati del rinnovo" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await act(async () => resolve("documento-salvato"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
it.each(["nuovo", "rinnovo"] as const)("%s: conserva la bozza e permette un nuovo tentativo dopo errore", async (mode) => {
  state.save.mockRejectedValueOnce(new Error("Errore simulato")).mockResolvedValueOnce("documento-salvato");
  fireEvent.click(apri(mode));
  const name = mode === "nuovo" ? "Salva" : "Registra il rinnovo";
  await waitFor(() => expect(screen.getByRole("button", { name })).toBeEnabled());
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  if (mode === "nuovo") expect(screen.getByRole("textbox", { name: "Nome del documento" })).toHaveValue("Nuovo documento demo");
  fireEvent.click(screen.getByRole("button", { name }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(state.save).toHaveBeenCalledTimes(2);
});

it("una lettura fallita non viene presentata come primo documento da creare", () => {
  state.readError = true;
  render(<SettingsDocumentiAzienda />);
  expect(screen.getByRole("alert")).toHaveTextContent("Impossibile caricare i documenti aziendali");
  expect(screen.queryByText("Non c’è ancora nessun documento")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Riprova caricamento" }));
  expect(state.retry).toHaveBeenCalledOnce();
});
it("il caricamento multiplo è un pulsante che apre il selettore file", () => {
  render(<SettingsDocumentiAzienda />);
  const input = document.querySelector<HTMLInputElement>("#carica-in-blocco")!;
  const click = vi.spyOn(input, "click").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: "Carica più file" }));
  expect(click).toHaveBeenCalledOnce();
});
it.each([["0", 0], ["365", 365], ["", 30]] as const)("preserva il preavviso %s nel payload", async (value, expected) => {
  state.save.mockResolvedValue("documento-salvato");
  const save = apri("nuovo");
  fireEvent.change(screen.getByLabelText("Scade il"), { target: { value: "2027-12-31" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Avvisami (giorni prima)" }), { target: { value } });
  fireEvent.click(save);
  await waitFor(() => expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ dati: expect.objectContaining({ alert_giorni_prima: expected }) })));
});
it.each(["-1", "366", "2.5"])("ferma un preavviso non valido prima della richiesta: %s", (value) => {
  const save = apri("nuovo");
  fireEvent.change(screen.getByLabelText("Scade il"), { target: { value: "2027-12-31" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Avvisami (giorni prima)" }), { target: { value } });
  fireEvent.click(save);
  expect(state.save).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
