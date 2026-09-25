import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PavimentiTemplateEditor } from "@/components/pavimenti/PavimentiTemplateEditor";
import { createFullPavTemplate, FULL_PAV_MODULES, PAV_EDITORIAL, type FullPavModuleId } from "@/lib/moduli-vendita/fullPavModules";
import type { PavTemplatePdf } from "@/types/pavimenti";

const calls = vi.hoisted(() => ({ remote: vi.fn(), preview: vi.fn(), success: vi.fn(), error: vi.fn(), profile: {}, storage: vi.fn(), image: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: calls.storage } } }));
vi.mock("@/lib/moduli-vendita/localTemplateImage", () => ({ readLocalTemplateImage: calls.image }));
vi.mock("@/hooks/usePavimentiProgetto", () => ({
  useEffectiveCompanyId: () => "company-a", usePavTemplatePdf: calls.remote,
  useUpsertPavTemplatePdf: calls.remote,
  usePavBackendReady: calls.remote,
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: calls.remote }));
vi.mock("@/hooks/useCompanySalesProfile", () => ({ useCompanySalesProfile: calls.remote, EMPTY_SALES_PROFILE: {} }));
vi.mock("@/hooks/usePavimentiPDF", () => ({ usePavimentiPDF: () => ({ previewPDF: calls.preview, isGenerating: false }) }));
vi.mock("@/components/pavimenti/PavimentiLivePreviewPanel", () => ({ PavimentiLivePreviewPanel: () : null => null }));
vi.mock("@/components/pavimenti/PavimentiTemplatePreviewDialog", () => ({ PavimentiTemplatePreviewDialog: () : null => null }));
vi.mock("@/components/preventivi/StandardTextTemplatePicker", () => ({ StandardTextTemplatePicker: () : null => null }));
vi.mock("@/hooks/useKitMarchio", () => ({ useKitMarchio: calls.remote }));
vi.mock("@/components/preventivi/AiSalesProfileForm", () => ({ AiSalesProfileForm: () : null => null }));
vi.mock("@/components/preventivi/AiTemplateReviewDialog", () => ({ AiTemplateReviewDialog: () : null => null }));
vi.mock("sonner", () => ({ toast: { success: calls.success, error: calls.error } }));

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const template = (id: FullPavModuleId) => createFullPavTemplate({ id: "online", company_id: "company-a", default_iva_pct: 22, font_family: "helvetica" } as PavTemplatePdf, id);
function mount(id: FullPavModuleId, save = vi.fn()) {
  render(<MemoryRouter initialEntries={["/?section=page_cover"]}><PavimentiTemplateEditor embedded localModule={{ id, template: template(id), saved: false, save, onDirtyChange: vi.fn() }} /></MemoryRouter>);
  return save;
}
describe("Pavimenti: modelli originali locali", () => {
  it("separates first save from real JSON changes and clears guards after revert/save", async () => {
    const save = vi.fn();
    const onDirtyChange = vi.fn();
    const t = template("resina");
    render(<MemoryRouter initialEntries={["/?section=page_cover"]}><PavimentiTemplateEditor embedded localModule={{ id: "resina", template: t, saved: false, save, onDirtyChange }} /></MemoryRouter>);
    const saveButton = screen.getByRole("button", { name: "Salva modulo in locale" });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(saveButton).toBeEnabled();
    expect(screen.getByText("Modello originale · non ancora salvato in locale")).toBeInTheDocument();
    const leave = () => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; };
    expect(leave()).toBe(false);
    const hero = screen.getByRole("textbox", { name: "Titolo copertina" });
    fireEvent.change(hero, { target: { value: "Titolo modificato" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(leave()).toBe(true);
    fireEvent.change(hero, { target: { value: t.cover_title } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(leave()).toBe(false);
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(saveButton).toBeDisabled();
    fireEvent.change(hero, { target: { value: "Nuova versione" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(saveButton);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(leave()).toBe(false);
  });
  it.each(FULL_PAV_MODULES)("%s conserva identità, anteprima e confine locale", async id => {
    const save = mount(id);
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    const data = calls.preview.mock.calls[0][0];
    expect(data.progetto.detrazione_pct).toBe(0);
    expect(data.progetto.immobile_superficie_mq).toBeNull();
    expect(data.computo).toHaveLength(PAV_EDITORIAL[id].rows.length);
    expect(data.localOnly).toBe(true);
    expect(JSON.stringify(data.computo)).not.toMatch(/Demolizione tramezzi|impianto elettrico certificato/);
    expect(data.template.pdf_blocchi.modulo_intervento).toBe(id);
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].id).toBe("local-pavimenti-" + id);
    expect(calls.remote).not.toHaveBeenCalled(); expect(calls.storage).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Genera testi con AI" })).not.toBeInTheDocument();
  });
  it("applica testi solo alla sezione scelta", () => {
    mount("resina");
    fireEvent.click(screen.getByRole("button", { name: "Testi per questo modulo" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Pavimentazione in resina");
    expect(screen.getByRole("combobox").querySelectorAll("option").length).toBeGreaterThanOrEqual(8);
  });
  it("preserva i campi cover salvati e il finanziamento durante un nuovo salvataggio", async () => {
    const save = vi.fn();
    const t = Object.assign(template("parquet"), { pdf_cover_hero: "Il mio legno", pdf_cover_image_url: "/module-art/pavimenti.jpg", pdf_cover_overlay_opacity: 47, finanziamento_promo: { attivo: false, rate: 36, tan_pct: 2 } });
    render(<MemoryRouter><PavimentiTemplateEditor embedded localModule={{ id: "parquet", template: t, saved: false, save, onDirtyChange: vi.fn() }} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0]).toMatchObject({ pdf_cover_hero: "Il mio legno", pdf_cover_overlay_opacity: 47, finanziamento_promo: { rate: 36, tan_pct: 2 } });
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("carica il logo soltanto come immagine locale", async () => {
    calls.image.mockResolvedValue("data:image/png;base64,local");
    const save = vi.fn();
    render(<MemoryRouter initialEntries={["/?section=brand"]}><PavimentiTemplateEditor embedded localModule={{ id: "resina", template: template("resina"), saved: false, save, onDirtyChange: vi.fn() }} /></MemoryRouter>);
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(["png"], "logo.png", { type: "image/png" })] } });
    await waitFor(() => expect(calls.image).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].logo_url).toBe("data:image/png;base64,local");
    expect(calls.storage).not.toHaveBeenCalled();
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("applica uno stile senza sostituire o cancellare la foto scelta", async () => {
    const save = mount("pareti");
    fireEvent.click(screen.getByTitle("Sfondo bianco pulito, titolo grosso in alto, niente distrazioni"));
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].cover_image_url).toBe("/module-art/pavimenti-pareti.jpg");
    expect(save.mock.calls[0][0].pdf_cover_image_url).toBe("/module-art/pavimenti-pareti.jpg");
  });
});
