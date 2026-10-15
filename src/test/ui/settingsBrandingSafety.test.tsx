import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import SettingsBranding from "@/pages/azienda/settings/SettingsBranding";
import type { BrandSettings } from "@/hooks/useBrandSettings";
import type { CompanyBranding } from "@/hooks/useBranding";

const state = vi.hoisted(() => ({
  includedInPlan: false, readError: false, saveError: false, syncError: false, syncThrows: false,
  branding: undefined as Partial<CompanyBranding> | undefined,
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
vi.mock("@/hooks/useBranding", () => ({ useBranding: () => ({ branding: state.branding }) }));
vi.mock("@/hooks/useWhitelabelGate", () => ({ useWhitelabelGate: () => ({ isWhiteLabel: true, isIncludedInPlan: state.includedInPlan }) }));
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
  return render(<MemoryRouter><QueryClientProvider client={client}><SettingsBranding /></QueryClientProvider></MemoryRouter>);
}
beforeEach(() => {
  state.readError = false; state.saveError = false; state.syncError = false; state.syncThrows = false;
  state.branding = undefined;
  state.includedInPlan = false;
  state.brand = { ...state.brand, white_label_enabled: true, brand_platform_name: "Demo", brand_primary_color: "#1E40AF", brand_secondary_color: "#3B82F6", brand_accent_color: "#DBEAFE", brand_text_on_primary: "#FFFFFF", brand_favicon_url: null, brand_login_bg_url: null, brand_logo_dark_url: null };
  state.saves.length = 0; state.syncs.length = 0;
  state.success.mockClear(); state.warning.mockClear(); state.error.mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Branding: salvataggio e sincronizzazione", () => {
  it("mostra il white-label incluso nel piano senza richiesta di attivazione", () => {
    state.includedInPlan = true;
    open();
    expect(screen.getByText("Incluso nel piano")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chiedi l'attivazione" })).toBeNull();
    expect(screen.getByRole("radio", { name: /Colori standard/ })).toBeChecked();
  });
  it("distingue colori standard e personalizzati, senza salvarli prima della conferma", async () => {
    open();
    expect(screen.getByRole("radio", { name: /Colori standard/ })).toBeChecked();
    expect(screen.getByLabelText("Colore del marchio")).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Colori personalizzati/ }));
    expect(screen.getByLabelText("Colore del marchio")).toBeEnabled();
    expect(state.saves).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Usa il colore #0F766E" }));
    fireEvent.click(screen.getByRole("radio", { name: /Colori standard/ }));
    expect(screen.getByLabelText("Colore del marchio")).toHaveValue("#1E40AF");
    expect(state.saves).toHaveLength(0);
    fireEvent.click(screen.getByRole("radio", { name: /Colori personalizzati/ }));
    expect(screen.getByLabelText("Colore del marchio")).toHaveValue("#0F766E");
  });
  it("conserva le bozze degli indirizzi durante un aggiornamento remoto e le scarta solo su richiesta", () => {
    state.branding = { subdomain: "prima", custom_domain: "crm.salvato.it", custom_domain_cname: "destinazione.example", custom_domain_verified: false };
    const { rerender } = open();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Indirizzo web" }), { button: 0, ctrlKey: false });
    fireEvent.change(screen.getByLabelText("Il tuo sottodominio"), { target: { value: "bozza" } });
    fireEvent.change(screen.getByLabelText("Dominio", { exact: true }), { target: { value: "crm.nuovo.it" } });
    state.branding = { ...state.branding, subdomain: "aggiornato" };
    rerender(<MemoryRouter><QueryClientProvider client={new QueryClient()}><SettingsBranding /></QueryClientProvider></MemoryRouter>);
    expect(screen.getByLabelText("Il tuo sottodominio")).toHaveValue("bozza");
    expect(screen.getByLabelText("Dominio", { exact: true })).toHaveValue("crm.nuovo.it");
    expect(screen.getByText("crm.salvato.it", { selector: "code" })).toBeInTheDocument();
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Annulla modifiche agli indirizzi" }));
    expect(screen.getByLabelText("Il tuo sottodominio")).toHaveValue("aggiornato");
    expect(screen.getByLabelText("Dominio", { exact: true })).toHaveValue("crm.salvato.it");
    const afterDiscard = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(afterDiscard);
    expect(afterDiscard.defaultPrevented).toBe(false);
  });
  it("rimuove lo sfondo anche dal login senza cambiare la bozza del nome", async () => {
    state.brand = { ...state.brand, brand_login_bg_url: "https://example.test/sfondo.png" };
    open();
    fireEvent.change(screen.getByLabelText("Nome della piattaforma"), { target: { value: "Nome in bozza" } });
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi lo sfondo della pagina di accesso" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Immagine rimossa"));
    expect(state.saves).toEqual([{ brand_login_bg_url: null }]);
    expect(state.syncs[0]).toMatchObject({ company_id: "company-1", login_bg_color: null });
    expect(screen.getByLabelText("Nome della piattaforma")).toHaveValue("Nome in bozza");
  });
  it("ritenta la sola sincronizzazione dell'icona rimossa dopo un errore, senza risalvare la bozza", async () => {
    state.brand = { ...state.brand, brand_favicon_url: "https://example.test/icona.png" };
    state.syncThrows = true;
    open();
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi l'icona del browser" }));
    const retry = await screen.findByRole("button", { name: "Riprova sincronizzazione immagini" });
    expect(state.warning).toHaveBeenCalledOnce();
    expect(state.success).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Nome della piattaforma"), { target: { value: "Nome da non salvare" } });
    state.syncThrows = false;
    fireEvent.click(retry);
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Immagini sincronizzate"));
    expect(state.saves).toEqual([{ brand_favicon_url: null }]);
    expect(state.syncs[1]).toMatchObject({ favicon_url: null });
    expect(screen.getByLabelText("Nome della piattaforma")).toHaveValue("Nome da non salvare");
  });
  it("se la rimozione principale fallisce conserva l'immagine e non sincronizza il login", async () => {
    state.brand = { ...state.brand, brand_favicon_url: "https://example.test/icona.png" };
    state.saveError = true;
    open();
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi l'icona del browser" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.brand.brand_favicon_url).toBe("https://example.test/icona.png");
    expect(state.syncs).toHaveLength(0);
  });
  it("il comando dei colori standard ripristina la palette precompilata senza generare un tema blu", async () => {
    state.brand = { ...state.brand, brand_primary_color: "#0F766E", brand_secondary_color: "#0F766E", brand_accent_color: "#EEFAF9" };
    open();
    fireEvent.click(screen.getByRole("button", { name: "Colori di EdiliziaInCloud" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva marchio" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.brand).toMatchObject({ white_label_enabled: true, brand_primary_color: "#1E40AF", brand_secondary_color: "#3B82F6", brand_accent_color: "#DBEAFE", brand_text_on_primary: "#FFFFFF" });
  });
  it("ripristinare l'aspetto conserva il white-label e azzera la bozza precedente", async () => {
    open();
    fireEvent.change(screen.getByLabelText("Nome della piattaforma"), { target: { value: "Bozza da scartare" } });
    fireEvent.click(screen.getByRole("button", { name: "Ripristina aspetto standard" }));
    fireEvent.click(screen.getByRole("button", { name: "Ripristina", exact: true }));
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.brand.white_label_enabled).toBe(true);
    expect(state.saves[0]).not.toHaveProperty("white_label_enabled");
    expect(screen.getByLabelText("Nome della piattaforma")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Salva marchio" })).toBeDisabled();
    expect(screen.queryByText("Modifiche non salvate")).toBeNull();
  });
  it("se il ripristino non sincronizza il login permette di riprovare", async () => {
    state.syncError = true;
    open();
    fireEvent.click(screen.getByRole("button", { name: "Ripristina aspetto standard" }));
    fireEvent.click(screen.getByRole("button", { name: "Ripristina", exact: true }));
    expect(await screen.findByRole("button", { name: "Riprova sincronizzazione" })).toBeEnabled();
    expect(state.warning).toHaveBeenCalledOnce();
    expect(state.success).not.toHaveBeenCalled();
    expect(state.brand.white_label_enabled).toBe(true);
  });
  it("non salva senza modifiche", () => {
    open();
    expect(screen.getByRole("button", { name: "Salva marchio" })).toBeDisabled();
    expect(state.saves).toHaveLength(0);
  });
  it("aggiorna solo il nome, preservando colori cambiati altrove", async () => {
    const { rerender } = open();
    fireEvent.change(screen.getByLabelText("Nome della piattaforma"), { target: { value: "Nome nuovo" } });
    state.brand = { ...state.brand, brand_primary_color: "#0F766E" };
    // Un aggiornamento del contesto remoto non deve eliminare la bozza.
    rerender(<MemoryRouter><QueryClientProvider client={new QueryClient()}><SettingsBranding /></QueryClientProvider></MemoryRouter>);
    expect(screen.getByLabelText("Nome della piattaforma")).toHaveValue("Nome nuovo");
    fireEvent.click(screen.getByRole("button", { name: "Salva marchio" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.saves).toEqual([{ brand_platform_name: "Nome nuovo", white_label_enabled: true }]);
    expect(state.syncs[0]).toMatchObject({ platform_name: "Nome nuovo", primary_color: "#0F766E" });
  });
  it("mostra il fallimento della sincronizzazione e permette di riprovare", async () => {
    state.syncError = true; open();
    fireEvent.change(screen.getByLabelText("Nome della piattaforma"), { target: { value: "Nome nuovo" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva marchio" }));
    const retry = await screen.findByRole("button", { name: "Riprova sincronizzazione" });
    expect(state.warning).toHaveBeenCalledOnce();
    expect(state.success).not.toHaveBeenCalled();
    state.syncError = false;
    fireEvent.click(retry);
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Salva marchio" })).toBeDisabled();
  });
  it("un errore del salvataggio principale mantiene la bozza", async () => {
    state.saveError = true; open();
    fireEvent.change(screen.getByLabelText("Nome della piattaforma"), { target: { value: "Nome nuovo" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva marchio" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Nome della piattaforma")).toHaveValue("Nome nuovo");
    expect(state.syncs).toHaveLength(0);
    expect(state.success).not.toHaveBeenCalled();
  });
  it("distingue il salvataggio riuscito da una connessione interrotta al mirror", async () => {
    state.syncThrows = true; open();
    fireEvent.change(screen.getByLabelText("Nome della piattaforma"), { target: { value: "Nome nuovo" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva marchio" }));
    expect(await screen.findByRole("button", { name: "Riprova sincronizzazione" })).toBeEnabled();
    expect(state.warning).toHaveBeenCalledOnce();
    expect(state.error).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nome della piattaforma")).toHaveValue("Nome nuovo");
  });
  it("non permette di salvare valori predefiniti su un errore di lettura", () => {
    state.readError = true; open();
    expect(screen.getByRole("alert")).toHaveTextContent("Nessuna modifica verrà salvata");
    expect(screen.queryByRole("button", { name: "Salva marchio" })).toBeNull();
  });
});
