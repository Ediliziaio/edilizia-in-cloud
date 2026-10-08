import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SettingsNotifiche from "@/pages/azienda/impostazioni/SettingsNotifiche";

const state = vi.hoisted(() => ({
  readError: false, writeError: false,
  phone: null as string | null, verified: null as string | null,
  writes: [] as Record<string, unknown>[], error: vi.fn(), success: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1", email: "test@esempio.it" }, effectiveCompany: { id: "company-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: false }) }));
vi.mock("@/components/notifications/AvvisiPerEvento", () => ({ AvvisiPerEvento: (): null => null }));
vi.mock("@/components/automazioni/BulkScheduleWizard", () => ({ BulkScheduleWizard: (): null => null }));
vi.mock("sonner", () => ({ toast: { error: state.error, success: state.success } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const builder = {
    select: () => builder, eq: () => builder,
    maybeSingle: async () => ({ data: state.readError ? null : {
      silvio_chat_enabled: true, email_enabled: true, email_override: null as string | null,
      whatsapp_phone: state.phone, whatsapp_verified_at: state.verified,
      preferred_order: ["silvio_chat", "telegram", "whatsapp", "email"], quiet_from: null as string | null, quiet_to: null as string | null,
    }, error: state.readError ? { message: "read failed" } : null }),
    upsert: async (value: Record<string, unknown>) => { state.writes.push(value); return { error: state.writeError ? { message: "write failed" } : null }; },
  };
  return builder;
} } }));
function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><SettingsNotifiche /></QueryClientProvider>);
  return client;
}
beforeEach(() => { state.readError = false; state.writeError = false; state.phone = null; state.verified = null; state.writes.length = 0; state.error.mockClear(); state.success.mockClear(); });
afterEach(cleanup);

describe("Notifiche: bozza, errori e verifica WhatsApp", () => {
  it("al caricamento non ci sono modifiche da salvare", async () => {
    open();
    expect(await screen.findByRole("button", { name: "Salva preferenze" })).toBeDisabled();
  });
  it("blocca il salvataggio quando le preferenze non si caricano", async () => {
    state.readError = true; open();
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco");
    expect(screen.queryByRole("button", { name: "Salva preferenze" })).toBeNull();
    expect(state.writes).toHaveLength(0);
  });
  it("salvare un numero nuovo non lo rende verificato", async () => {
    open();
    fireEvent.click(await screen.findByRole("switch", { name: "Abilita WhatsApp" }));
    fireEvent.change(screen.getByLabelText("Numero WhatsApp (con prefisso intl.)"), { target: { value: "+393331234567" } });
    expect(state.writes).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Salva preferenze" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.writes[0]).toMatchObject({ user_id: "user-1", company_id: "company-1", whatsapp_phone: "+393331234567", whatsapp_verified_at: null });
    expect(screen.getByText(/Salvare il numero non lo verifica/)).toBeVisible();
  });
  it("cambiare un numero già verificato revoca il badge immediatamente", async () => {
    state.phone = "+393331234567"; state.verified = "2026-10-01T12:00:00Z";
    open();
    expect(await screen.findByText("Numero verificato.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Numero WhatsApp (con prefisso intl.)"), { target: { value: "+393331234568" } });
    expect(screen.queryByText("Numero verificato.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Salva preferenze" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.writes[0].whatsapp_verified_at).toBeNull();
  });
  it("un refetch non cancella un'email alternativa ancora da salvare", async () => {
    const client = open();
    fireEvent.change(await screen.findByLabelText("Email alternativa (opzionale)"), { target: { value: "bozza@esempio.it" } });
    await client.refetchQueries();
    expect(screen.getByLabelText("Email alternativa (opzionale)")).toHaveValue("bozza@esempio.it");
    expect(state.writes).toHaveLength(0);
  });
  it("un errore di salvataggio conserva la bozza", async () => {
    state.writeError = true; open();
    fireEvent.change(await screen.findByLabelText("Email alternativa (opzionale)"), { target: { value: "bozza@esempio.it" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva preferenze" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Email alternativa (opzionale)")).toHaveValue("bozza@esempio.it");
    expect(screen.getByRole("status")).toHaveTextContent("Modifiche non salvate");
    expect(state.success).not.toHaveBeenCalled();
  });
});
