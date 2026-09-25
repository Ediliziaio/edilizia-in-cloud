import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ClimatizzazioneTemplateEditor } from "@/components/climatizzazione/ClimatizzazioneTemplateEditor";
import { createFullClmTemplate, FULL_CLM_MODULES, type FullClmModuleId } from "@/lib/moduli-vendita/fullClmModules";
import type { ClmTemplatePdf } from "@/types/climatizzazione";

const calls = vi.hoisted(() => ({ remote: vi.fn(), preview: vi.fn(), success: vi.fn(), error: vi.fn(), profile: {}, storage: vi.fn(), image: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: calls.storage } } }));
vi.mock("@/lib/moduli-vendita/localTemplateImage", () => ({ readLocalTemplateImage: calls.image }));
vi.mock("@/hooks/useClimatizzazioneProgetto", () => ({
  useEffectiveCompanyId: () => "company-a", useClmTemplatePdf: () => ({ data: null as null, isLoading: false }),
  useUpsertClmTemplatePdf: () => ({ mutateAsync: calls.remote, isPending: false }),
  useClmBackendReady: () => ({ data: true }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: null as null }) }));
vi.mock("@/hooks/useCompanySalesProfile", () => ({ useCompanySalesProfile: () => ({ profile: calls.profile, save: vi.fn() }), EMPTY_SALES_PROFILE: {} }));
vi.mock("@/hooks/useClimatizzazionePDF", () => ({ useClimatizzazionePDF: () => ({ previewPDF: calls.preview, isGenerating: false }) }));
vi.mock("@/components/climatizzazione/ClimatizzazioneLivePreviewPanel", () => ({ ClimatizzazioneLivePreviewPanel: () : null => null }));
vi.mock("@/components/climatizzazione/ClimatizzazioneTemplatePreviewDialog", () => ({ ClimatizzazioneTemplatePreviewDialog: () : null => null }));
vi.mock("@/components/preventivi/StandardTextTemplatePicker", () => ({ StandardTextTemplatePicker: () : null => null }));
vi.mock("@/components/preventivi/CopertinaAnteprima", () => ({ CopertinaAnteprima: () : null => null }));
vi.mock("@/components/preventivi/AiSalesProfileForm", () => ({ AiSalesProfileForm: () : null => null }));
vi.mock("@/components/preventivi/AiTemplateReviewDialog", () => ({ AiTemplateReviewDialog: () : null => null }));
vi.mock("sonner", () => ({ toast: { success: calls.success, error: calls.error } }));

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const template = (id: FullClmModuleId) => createFullClmTemplate({ id: "online", company_id: "company-a", default_iva_pct: 22, font_family: "helvetica" } as ClmTemplatePdf, id);
function mount(id: FullClmModuleId, save = vi.fn(), onDirtyChange = vi.fn(), saved = false) {
  render(<MemoryRouter initialEntries={["/?section=page_cover"]}><ClimatizzazioneTemplateEditor embedded localModule={{ id, template: template(id), saved, save, onDirtyChange }} /></MemoryRouter>);
  return save;
}
describe("Climatizzazione: modelli originali locali", () => {
  it("mantiene sincronizzati i campi legacy dei comandi comuni", async () => {
    const save = mount("canalizzato");
    fireEvent.change(screen.getByRole("combobox", { name: "Allineamento testo" }), { target: { value: "center" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Posizione logo" }), { target: { value: "top_right" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Colore testo" }), { target: { value: "#AABBCC" } });
    fireEvent.change(screen.getByRole("slider", { name: "Dimensione sottotitolo: cursore" }), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0]).toMatchObject({ pdf_cover_text_align: "center", cover_text_align: "center", pdf_cover_logo_position: "top_right", cover_logo_position: "top_right", pdf_cover_text_color: "#AABBCC", cover_text_color: "#AABBCC", pdf_cover_subtitle_size: 15 });
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("starts Canalizzato clean, guards only actual edits and clears them after saving", async () => {
    const dirty = vi.fn();
    const save = mount("canalizzato", vi.fn(), dirty);
    expect(screen.getByText("Nuovo modulo · non ancora salvato")).toBeInTheDocument();
    expect(screen.queryByText("Modifiche non salvate")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva modello" })).toBeEnabled();
    expect(dirty).toHaveBeenLastCalledWith(false);
    const initialExit = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(initialExit);
    expect(initialExit.defaultPrevented).toBe(false);
    fireEvent.change(screen.getAllByDisplayValue(/Il comfort si diffonde/)[0], { target: { value: "Titolo modificato" } });
    expect(dirty).toHaveBeenLastCalledWith(true);
    const editedExit = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(editedExit);
    expect(editedExit.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(dirty).toHaveBeenLastCalledWith(false);
    expect(screen.getByText("Tutto salvato")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva modello" })).toBeDisabled();
    const savedExit = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(savedExit);
    expect(savedExit.defaultPrevented).toBe(false);
  });
  it("opens an existing local draft clean and already saved", () => {
    const dirty = vi.fn();
    mount("canalizzato", vi.fn(), dirty, true);
    expect(screen.getByText("Tutto salvato")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva modello" })).toBeDisabled();
    expect(dirty).toHaveBeenLastCalledWith(false);
  });
  it.each(FULL_CLM_MODULES)("%s conserva identità, anteprima e confine locale", async id => {
    const save = mount(id);
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    const data = calls.preview.mock.calls[0][0];
    expect(data.progetto.detrazione_pct).toBe(0);
    expect(data.progetto.immobile_superficie_mq).toBeNull();
    expect(data.computo).toHaveLength(3);
    expect(JSON.stringify(data.computo)).not.toMatch(/Demolizione tramezzi|Posa pavimento/);
    expect(data.template.pdf_blocchi.modulo_intervento).toBe(id);
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].id).toBe("local-climatizzazione-" + id);
    expect(calls.remote).not.toHaveBeenCalled(); expect(calls.storage).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Genera testi con AI" })).not.toBeInTheDocument();
  });
  it("applica testi solo alla sezione scelta", () => {
    mount("vmc");
    fireEvent.click(screen.getByRole("button", { name: "Testi per questo modulo" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Ventilazione meccanica controllata");
    expect(screen.getByRole("combobox").querySelectorAll("option")).toHaveLength(10);
  });
  it("keeps uploaded images in the local draft and synchronizes both cover fields", async () => {
    const save = mount("monosplit");
    calls.image.mockResolvedValueOnce("data:image/png;base64,LOCAL");
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const input = inputs[1]; // Cover image, after the optional cover logo.
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { files: [new File(["image"], "cover.png", { type: "image/png" })] } });
    await waitFor(() => expect(calls.image).toHaveBeenCalledOnce());
    await waitFor(() => expect(calls.success).toHaveBeenCalledWith("Immagine aggiunta"));
    fireEvent.change(screen.getAllByDisplayValue(/Il tuo ambiente/)[0], { target: { value: "Titolo personale" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].cover_title).toBe("Titolo personale");
    expect(save.mock.calls[0][0].pdf_cover_hero).toBe("Titolo personale");
    expect(save.mock.calls[0][0].pdf_cover_image_url).toBe("data:image/png;base64,LOCAL");
    expect(save.mock.calls[0][0].cover_image_url).toBe("data:image/png;base64,LOCAL");
    expect(calls.storage).not.toHaveBeenCalled();
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("keeps the draft dirty after a failed local save", async () => {
    mount("vmc", vi.fn(() => { throw new Error("Quota locale esaurita"); }));
    fireEvent.change(screen.getAllByDisplayValue(/Aria che si rinnova/)[0], { target: { value: "Titolo modificato" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(calls.error).toHaveBeenCalledWith("Salvataggio non riuscito", { description: "Quota locale esaurita" }));
    expect(screen.getByText("Modifiche non salvate")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva modello" })).toBeEnabled();
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("preserves both image fields when changing the cover style", async () => {
    const save = mount("vmc");
    fireEvent.click(screen.getByRole("button", { name: /Minimal · testo in alto/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].pdf_cover_image_url).toBe("/module-art/climatizzazione-vmc-centered.jpg");
    expect(save.mock.calls[0][0].cover_image_url).toBe("/module-art/climatizzazione-vmc-centered.jpg");
  });
});
