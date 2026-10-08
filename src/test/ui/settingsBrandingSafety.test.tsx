import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SettingsBranding from "@/pages/azienda/settings/SettingsBranding";
import type { BrandSettings } from "@/hooks/useBrandSettings";

const state = vi.hoisted(() => ({
  readError: false, saveError: false, syncError: false, syncThrows: false,
  brand: { white_label_enabled: true, brand_primary_color: "#1E40AF", brand_secondary_color: "#3B82F6", brand_accent_color: "#DBEAFE", brand_text_on_primary: "#FFFFFF", brand_platform_name: "Demo", brand_hide_powered_by: false, brand_favicon_url: null, brand_login_bg_url: null, logo_url: null, brand_logo_dark_url: null } as BrandSettings,
  saves: [] as Partial<BrandSettings>[], syncs: [] as Record<string, unknown>[],
  success: vi.fn(), warning: vi.fn(), error: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1", business_name: "Demo" }, user: { id: "user-1", email: "test@esempio.it" }, refreshAuth: async (): Promise<void> => {} }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/useBrandSettings", () => ({ useBrandSettings: () => ({
  brand: state.brand, isLoading: false, isError: state.readError, refetch: vi.fn(), uploadBrandFile: vi.fn(),
  saveBrand: { mutateAsync: async (value: Partial<BrandSettings>) => {
    state.saves.push(value);
    if (state.saveError) throw new Error("save failed");
    state.brand = { ...state.brand, ...value };
    return state.brand;
  } },
}) }));
vi.mock("@/hooks/useBranding", () => ({ useBranding: () => ({ branding: undefined as { subdomain: string; custom_domain: string | null } | undefined }) }));
vi.mock("@/hooks/useWhitelabelGate", () => ({ useWhitelabelGate: () => ({ isWhiteLabel: true }) }));
vi.mock("@/hooks/useBrandingByDomain", () => ({
  isValidCustomDomain: () => true, normalizeCustomDomainInput: (value: string) => value,
  useSaveSubdomain: () => ({}), useRequestDomainVerification: () => ({}), useVerifyCustomDomain: () => ({}), useRemoveCustomDomain: () => ({}),
}));
vi.mock("@/components/settings/LogoUploader", () => ({ LogoUploader: () => <p>Logo</p> }));
vi.mock("sonner", () => ({ toast: { success: state.success, warning: state.warning, error: state.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({
  upsert: async (value: Record<string, unknown>) => { state.syncs.push(value); if (state.syncThrows) throw new Error("network unavailable"); return { error: state.syncError ? { message: "sync failed" } : null }; },
  insert: async () => ({ error: null as { message: string } | null }),
}) } }));
function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SettingsBranding /></QueryClientProvider>);
}
beforeEach(() => {
  state.readError = false; state.saveError = false; state.syncError = false; state.syncThrows = false;
  state.brand = { ...state.brand, brand_platform_name: "Demo", brand_primary_color: "#1E40AF" };
  state.saves.length = 0; state.syncs.length = 0;
  state.success.mockClear(); state.warning.mockClear(); state.error.mockClear();
});
afterEach(cleanup);

describe("Branding: salvataggio e sincronizzazione", () => {
  it("non salva senza modifiche", () => {
    open();
    expect(screen.getByRole("button", { name: "Salva brand" })).toBeDisabled();
    expect(state.saves).toHaveLength(0);
  });
  it("aggiorna solo il nome, preservando colori cambiati altrove", async () => {
    const { rerender } = open();
    fireEvent.change(screen.getByLabelText("Nome della piattaforma"), { target: { value: "Nome nuovo" } });
    state.brand = { ...state.brand, brand_primary_color: "#0F766E" };
    // Un aggiornamento del contesto remoto non deve eliminare la bozza.
    rerender(<QueryClientProvider client={new QueryClient()}><SettingsBranding /></QueryClientProvider>);
    expect(screen.getByLabelText("Nome della piattaforma")).toHaveValue("Nome nuovo");
    fireEvent.click(screen.getByRole("button", { name: "Salva brand" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.saves).toEqual([{ brand_platform_name: "Nome nuovo", white_label_enabled: true }]);
    expect(state.syncs[0]).toMatchObject({ platform_name: "Nome nuovo", primary_color: "#0F766E" });
  });
  it("mostra il fallimento della sincronizzazione e permette di riprovare", async () => {
    state.syncError = true; open();
    fireEvent.change(screen.getByLabelText("Nome della piattaforma"), { target: { value: "Nome nuovo" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva brand" }));
    const retry = await screen.findByRole("button", { name: "Riprova sincronizzazione" });
    expect(state.warning).toHaveBeenCalledOnce();
    expect(state.success).not.toHaveBeenCalled();
    state.syncError = false;
    fireEvent.click(retry);
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Salva brand" })).toBeDisabled();
  });
  it("un errore del salvataggio principale mantiene la bozza", async () => {
    state.saveError = true; open();
    fireEvent.change(screen.getByLabelText("Nome della piattaforma"), { target: { value: "Nome nuovo" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva brand" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Nome della piattaforma")).toHaveValue("Nome nuovo");
    expect(state.syncs).toHaveLength(0);
    expect(state.success).not.toHaveBeenCalled();
  });
  it("distingue il salvataggio riuscito da una connessione interrotta al mirror", async () => {
    state.syncThrows = true; open();
    fireEvent.change(screen.getByLabelText("Nome della piattaforma"), { target: { value: "Nome nuovo" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva brand" }));
    expect(await screen.findByRole("button", { name: "Riprova sincronizzazione" })).toBeEnabled();
    expect(state.warning).toHaveBeenCalledOnce();
    expect(state.error).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nome della piattaforma")).toHaveValue("Nome nuovo");
  });
  it("non permette di salvare valori predefiniti su un errore di lettura", () => {
    state.readError = true; open();
    expect(screen.getByRole("alert")).toHaveTextContent("Nessuna modifica verrà salvata");
    expect(screen.queryByRole("button", { name: "Salva brand" })).toBeNull();
  });
});
