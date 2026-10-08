import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SettingsWebhooks from "@/pages/azienda/settings/SettingsWebhooks";
import type { WebhookDelivery } from "@/types/webhooks";

const state = vi.hoisted(() => ({ error: false, loading: false, logsError: false, refetch: vi.fn(), mutate: vi.fn(), manage: true }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" }, role: "employee" }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditSettingsIntegrations: state.manage }) }));
vi.mock("@/hooks/useWebhooks", () => ({
  useWebhooks: () => ({ data: [{ id: "w1", name: "CRM locale", url: "https://example.com/webhook", is_active: true, events: ["contact.created"], created_at: "2026-10-08", consecutive_failures: 0 }], isLoading: state.loading, isError: state.error, refetch: state.refetch }),
  useWebhookDeliveries: () => ({ data: [] as WebhookDelivery[], isLoading: false, isError: state.logsError, refetch: state.refetch }),
  useCreateWebhook: () => ({ isPending: false, mutateAsync: state.mutate }), useUpdateWebhook: () => ({ isPending: false, mutateAsync: state.mutate }),
  useDeleteWebhook: () => ({ isPending: false, mutateAsync: state.mutate }), useRetryDelivery: () => ({ isPending: false, mutateAsync: state.mutate }),
}));
beforeEach(() => { state.error = false; state.loading = false; state.logsError = false; state.manage = true; state.refetch.mockClear(); state.mutate.mockClear(); });
afterEach(cleanup);
describe("Webhook: informazioni affidabili", () => {
  it("un errore non viene mostrato come elenco vuoto", () => {
    state.error = true; render(<SettingsWebhooks />);
    expect(screen.getByText(/Impossibile caricare i webhook/)).toBeInTheDocument();
    expect(screen.queryByText("Nessun webhook configurato")).toBeNull();
    expect(screen.getByRole("button", { name: "Crea Webhook" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it("non considera il segreto non esposto come prova di firma assente", () => {
    render(<SettingsWebhooks />);
    expect(screen.getByText("Firmati").parentElement).toHaveTextContent("–");
    expect(screen.getByText("stato firma non esposto")).toBeInTheDocument();
  });
  it("caricamento e sola lettura bloccano la creazione", () => {
    state.loading = true; state.manage = false; render(<SettingsWebhooks />);
    expect(screen.getByRole("button", { name: "Crea Webhook" })).toBeDisabled();
  });
  it("un errore degli invii non equivale a nessun invio", async () => {
    state.logsError = true; render(<SettingsWebhooks />);
    fireEvent.click(screen.getByRole("button", { name: "Log delivery" }));
    expect(await screen.findByText("Invii non disponibili.")).toBeInTheDocument();
    expect(screen.queryByText("Nessun delivery ancora")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Riprova invii" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it("chiudere una bozza chiede conferma, senza creare webhook", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SettingsWebhooks />);
    fireEvent.click(screen.getByRole("button", { name: "Crea Webhook" }));
    fireEvent.change(await screen.findByPlaceholderText("Es. Notifica CRM"), { target: { value: "Bozza webhook" } });
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(state.mutate).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
