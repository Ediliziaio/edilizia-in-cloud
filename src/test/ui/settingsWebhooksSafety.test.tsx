import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SettingsWebhooks from "@/pages/azienda/settings/SettingsWebhooks";
import type { WebhookDelivery } from "@/types/webhooks";

const state = vi.hoisted(() => ({ error: false, loading: false, logsError: false, refetch: vi.fn(), mutate: vi.fn(), toast: vi.fn(), manage: true }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" }, role: "employee" }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditSettingsIntegrations: state.manage }) }));
vi.mock("@/hooks/useWebhooks", () => ({
  useWebhooks: () => ({ data: [{ id: "w1", name: "CRM locale", url: "https://example.com/webhook", is_active: true, events: ["contact.created"], created_at: "2026-10-08", consecutive_failures: 0 }], isLoading: state.loading, isError: state.error, refetch: state.refetch }),
  useWebhookDeliveries: () => ({ data: [] as WebhookDelivery[], isLoading: false, isError: state.logsError, refetch: state.refetch }),
  useCreateWebhook: () => ({ isPending: false, mutateAsync: state.mutate }), useUpdateWebhook: () => ({ isPending: false, mutateAsync: state.mutate }),
  useDeleteWebhook: () => ({ isPending: false, mutateAsync: state.mutate }), useRetryDelivery: () => ({ isPending: false, mutateAsync: state.mutate }),
}));
beforeEach(() => { state.error = false; state.loading = false; state.logsError = false; state.manage = true; state.refetch.mockClear(); state.mutate.mockClear(); state.toast.mockClear(); });
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
    // I riquadri di conteggio non ci sono più (09/10/2026): resta la regola, che la lista non dica mai «senza firma»
    // quando il segreto non arriva al browser. Il badge «Con firma» compare solo se il dato c'è.
    render(<SettingsWebhooks />);
    expect(screen.queryByText("Firmati")).toBeNull();
    expect(screen.queryByText(/senza firma|non firmato/i)).toBeNull();
    expect(screen.queryByText("Con firma")).toBeNull();
  });
  it("caricamento e sola lettura bloccano la creazione", () => {
    state.loading = true; state.manage = false; render(<SettingsWebhooks />);
    expect(screen.getByRole("button", { name: "Crea Webhook" })).toBeDisabled();
  });
  it("un errore degli invii non equivale a nessun invio", async () => {
    state.logsError = true; render(<SettingsWebhooks />);
    // «Log delivery» è diventato «Invii» (gergo): il pulsante dell'icona si chiama «Invii di <nome>».
    fireEvent.click(screen.getByRole("button", { name: "Invii di CRM locale" }));
    expect(await screen.findByText("Invii non disponibili.")).toBeInTheDocument();
    expect(screen.queryByText("Nessun invio ancora")).toBeNull();
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
  it("dice in cima, in italiano semplice, che gli avvisi non partono da soli", () => {
    render(<SettingsWebhooks />);
    expect(screen.getByText("Oggi gli avvisi non partono da soli.")).toBeInTheDocument();
    // Una riga per chi non sa cos'è un webhook.
    expect(screen.getByText(/Un webhook è l'indirizzo di un altro programma/)).toBeInTheDocument();
  });

  it("non offre controlli che nessun codice legge: attesa massima e IP consentiti", async () => {
    // Attesa massima e IP consentiti non sono più comandi di questa pagina.
    render(<SettingsWebhooks />);
    fireEvent.click(screen.getByRole("button", { name: "Crea Webhook" }));
    await screen.findByPlaceholderText("Es. Notifica CRM");
    expect(screen.queryByText(/Sicurezza avanzata/)).toBeNull();
    expect(screen.queryByText(/Timeout|Attesa massima/)).toBeNull();
    expect(screen.queryByText(/IP\/CIDR|IP consentiti|whitelist/i)).toBeNull();
  });

  it("salva solo quello che il webhook usa davvero, e le colonne non toccate restano", async () => {
    render(<SettingsWebhooks />);
    fireEvent.click(screen.getByRole("button", { name: "Crea Webhook" }));
    fireEvent.change(await screen.findByPlaceholderText("Es. Notifica CRM"), { target: { value: "Gestionale esterno" } });
    fireEvent.change(screen.getByLabelText("Indirizzo a cui mandare l'avviso *"), { target: { value: "https://esempio.it/avviso" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Evento contact.created" }));
    fireEvent.click(screen.getByRole("button", { name: "Crea webhook" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledOnce());
    const inviato = state.mutate.mock.calls[0][0] as Record<string, unknown>;
    expect(inviato).toMatchObject({ name: "Gestionale esterno", url: "https://esempio.it/avviso", events: ["contact.created"] });
    expect(inviato).not.toHaveProperty("timeout_seconds");
    expect(inviato).not.toHaveProperty("allowed_ips");
  });

  it("un indirizzo sbagliato lo dice in italiano", async () => {
    render(<SettingsWebhooks />);
    fireEvent.click(screen.getByRole("button", { name: "Crea Webhook" }));
    fireEvent.change(await screen.findByPlaceholderText("Es. Notifica CRM"), { target: { value: "Gestionale esterno" } });
    fireEvent.change(screen.getByLabelText("Indirizzo a cui mandare l'avviso *"), { target: { value: "http://esempio.it/avviso" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Evento contact.created" }));
    fireEvent.click(screen.getByRole("button", { name: "Crea webhook" }));
    await waitFor(() => expect(state.toast).toHaveBeenCalledOnce());
    expect(state.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Indirizzo non valido", description: expect.stringMatching(/deve cominciare con https:\/\//) }),
    );
    expect(state.mutate).not.toHaveBeenCalled();
  });
});
