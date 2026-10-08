import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SettingsMotiviPerdita from "@/pages/azienda/settings/SettingsMotiviPerdita";

const state = vi.hoisted(() => ({ edit: true, error: false, usageError: false, pending: false, mutate: vi.fn(), refetch: vi.fn() }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isLoading: false, isAdmin: false, canEditSettingsCustomization: state.edit }) }));
vi.mock("@/hooks/useLossReasons", () => ({
  useLossReasons: () => ({ motivi: [{ value: "prezzo", label: "Prezzo troppo alto", predefinito: true }, { id: "r1", value: "Misure non realizzabili", label: "Misure non realizzabili", predefinito: false }], isLoading: false, isError: state.error, refetch: state.refetch }),
  useLossReasonUsage: () => ({ data: { prezzo: 2 }, isLoading: false, isError: state.usageError, refetch: state.refetch }),
  useAddLossReason: () => ({ mutate: state.mutate, isPending: state.pending }),
  useRenameLossReason: () => ({ mutate: state.mutate, isPending: false }),
  useDeleteLossReason: () => ({ mutate: state.mutate, isPending: false }),
}));
beforeEach(() => { state.edit = true; state.error = false; state.usageError = false; state.pending = false; state.mutate.mockClear(); state.refetch.mockClear(); });
afterEach(cleanup);
describe("Motivi di perdita: salvataggi e letture", () => {
  it("l'errore non è un elenco aziendale vuoto e blocca i salvataggi", () => {
    state.error = true; render(<SettingsMotiviPerdita />);
    expect(screen.getByRole("alert")).toHaveTextContent("Motivi aziendali non disponibili");
    expect(screen.queryByText(/Nessun motivo aggiunto/)).toBeNull();
    expect(screen.queryByLabelText("Nuovo motivo di perdita")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Riprova motivi" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it("la sola lettura non mostra comandi di modifica", () => {
    state.edit = false; render(<SettingsMotiviPerdita />);
    expect(screen.queryByRole("button", { name: /Rinomina/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Togli/ })).toBeNull();
    expect(screen.queryByLabelText("Nuovo motivo di perdita")).toBeNull();
  });
  it("conserva la bozza finché il server non conferma", () => {
    render(<SettingsMotiviPerdita />);
    fireEvent.change(screen.getByLabelText("Nuovo motivo di perdita"), { target: { value: "Permesso negato dal condominio" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    expect(state.mutate.mock.calls[0][0]).toBe("Permesso negato dal condominio");
    expect(screen.getByLabelText("Nuovo motivo di perdita")).toHaveValue("Permesso negato dal condominio");
  });
  it("mentre salva non consente un'altra modifica", () => {
    state.pending = true; render(<SettingsMotiviPerdita />);
    expect(screen.getByLabelText("Nuovo motivo di perdita")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rinomina Misure non realizzabili" })).toBeDisabled();
  });
  it("gli utilizzi non caricati non sono zero e la rimozione preserva la storia", () => {
    state.usageError = true; render(<SettingsMotiviPerdita />);
    expect(screen.getAllByText("Utilizzi non disponibili")).toHaveLength(2);
    expect(screen.queryByText("0 opportunità")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Togli Misure non realizzabili" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("conservano il motivo e la storia");
    expect(state.mutate).not.toHaveBeenCalled();
  });
});
