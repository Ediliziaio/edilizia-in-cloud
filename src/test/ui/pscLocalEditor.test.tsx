import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PiscineTemplateEditor } from "@/components/piscine/PiscineTemplateEditor";
import { createFullPscTemplate, FULL_PSC_MODULES, type FullPscModuleId } from "@/lib/moduli-vendita/fullPscModules";
import type { PisTemplatePdf } from "@/types/piscine";

const calls = vi.hoisted(() => ({ remote: vi.fn(), preview: vi.fn(), success: vi.fn(), error: vi.fn(), profile: {}, storage: vi.fn(), image: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: calls.storage } } }));
vi.mock("@/lib/moduli-vendita/localTemplateImage", () => ({ readLocalTemplateImage: calls.image }));
vi.mock("@/hooks/usePiscineProgetto", () => ({
  useEffectiveCompanyId: () => "company-a", usePisTemplatePdf: () => ({ data: null as null, isLoading: false }),
  useUpsertPisTemplatePdf: () => ({ mutateAsync: calls.remote, isPending: false }),
  usePisBackendReady: () => ({ data: true }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: null as null }) }));
vi.mock("@/hooks/useCompanySalesProfile", () => ({ useCompanySalesProfile: () => ({ profile: calls.profile, save: vi.fn() }), EMPTY_SALES_PROFILE: {} }));
vi.mock("@/hooks/usePiscinePDF", () => ({ usePiscinePDF: () => ({ previewPDF: calls.preview, isGenerating: false }) }));
vi.mock("@/components/piscine/PiscineLivePreviewPanel", () => ({ PiscineLivePreviewPanel: () : null => null }));
vi.mock("@/components/piscine/PiscineTemplatePreviewDialog", () => ({ PiscineTemplatePreviewDialog: () : null => null }));
vi.mock("@/components/preventivi/StandardTextTemplatePicker", () => ({ StandardTextTemplatePicker: () : null => null }));
vi.mock("@/components/preventivi/AiSalesProfileForm", () => ({ AiSalesProfileForm: () : null => null }));
vi.mock("@/components/preventivi/AiTemplateReviewDialog", () => ({ AiTemplateReviewDialog: () : null => null }));
vi.mock("sonner", () => ({ toast: { success: calls.success, error: calls.error } }));

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const template = (id: FullPscModuleId) => createFullPscTemplate({ id: "online", company_id: "company-a", default_iva_pct: 22, font_family: "helvetica" } as PisTemplatePdf, id);
function mount(id: FullPscModuleId, save = vi.fn(), onDirtyChange = vi.fn(), saved = false) {
  render(<MemoryRouter initialEntries={["/?section=page_cover"]}><PiscineTemplateEditor embedded localModule={{ id, template: template(id), saved, save, onDirtyChange }} /></MemoryRouter>);
  return save;
}
describe("Piscine: modelli originali locali", () => {
  it("mostra l'opacità in percentuale e conserva l'unità locale 0–1", async () => {
    const save = mount("nuova");
    fireEvent.change(screen.getByRole("slider", { name: "Intensità velo scuro: cursore" }), { target: { value: "75" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Allineamento testo" }), { target: { value: "right" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].cover_overlay_opacity).toBe(0.75);
    expect(save.mock.calls[0][0].cover_text_align).toBe("right");
    expect(save.mock.calls[0][0].cover_image_url).toBe(template("nuova").cover_image_url);
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it.each(FULL_PSC_MODULES)("%s conserva identità, anteprima e confine locale", async id => {
    const save = mount(id);
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    const data = calls.preview.mock.calls[0][0];
    expect(data.localOnly).toBe(true);
    expect(data.progetto.detrazione_pct).toBe(0);
    expect(data.progetto.immobile_superficie_mq).toBeNull();
    expect(data.computo).toHaveLength(3);
    expect(JSON.stringify(data.computo)).not.toMatch(/Demolizione tramezzi|Posa pavimento/);
    expect(data.template.pdf_blocchi.modulo_intervento).toBe(id);
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].id).toBe("local-piscine-" + id);
    expect(calls.remote).not.toHaveBeenCalled(); expect(calls.storage).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Genera testi con AI" })).not.toBeInTheDocument();
  });
  it("applica testi solo alla sezione scelta", () => {
    mount("manutenzione");
    fireEvent.click(screen.getByRole("button", { name: "Testi per questo modulo" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Manutenzione stagionale");
    expect(screen.getByRole("combobox").querySelectorAll("option")).toHaveLength(10);
  });
  it("applica la variante scelta senza salvare e mantiene le altre pagine", async () => {
    const save = mount("impianti");
    fireEvent.click(screen.getByRole("button", { name: "Testi per questo modulo" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "faq-breve" } });
    fireEvent.click(screen.getByRole("button", { name: "Applica a domande frequenti" }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const result = save.mock.calls[0][0];
    expect(result.faq).toHaveLength(4);
    expect(result.cover_title).toBe(template("impianti").cover_title);
    expect(result.pdf_blocchi).toEqual(template("impianti").pdf_blocchi);
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("carica un'immagine nel modulo locale senza usare storage remoto", async () => {
    const save = mount("nuova");
    calls.image.mockResolvedValue("data:image/png;base64,aGVsbG8=");
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const image = new File(["example"], "locale.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [image] } });
    await waitFor(() => expect(calls.image).toHaveBeenCalledWith(image));
    await waitFor(() => expect(calls.success).toHaveBeenCalledWith("Immagine aggiunta"));
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(JSON.stringify(save.mock.calls[0][0])).toContain("data:image/png;base64,aGVsbG8=");
    expect(calls.storage).not.toHaveBeenCalled(); expect(calls.remote).not.toHaveBeenCalled();
  });
  it("un errore di salvataggio mantiene l'editor modificato e non attiva il salvataggio remoto", async () => {
    const save = vi.fn(() => { throw new Error("spazio esaurito"); });
    mount("rivestimento", save);
    fireEvent.change(screen.getByDisplayValue(template("rivestimento").cover_subtitle!), { target: { value: "Sottotitolo modificato" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(calls.error).toHaveBeenCalledWith("Salvataggio non riuscito", { description: "spazio esaurito" }));
    expect(screen.getByText("Modifiche non salvate")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva modello" })).toBeEnabled();
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("un modulo nuovo è pulito ma permette il primo salvataggio", async () => {
    const dirty = vi.fn(); const save = vi.fn();
    mount("nuova", save, dirty);
    expect(dirty).toHaveBeenLastCalledWith(false);
    expect(screen.getByText("Modulo nuovo · non ancora salvato")).toBeInTheDocument();
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(false);
    const button = screen.getByRole("button", { name: "Salva modello" });
    expect(button).toBeEnabled(); fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(button).toBeDisabled();
    expect(screen.getByText("Tutto salvato")).toBeInTheDocument();
    expect(dirty).not.toHaveBeenCalledWith(true);
  });
  it.each([false, true])("dirty segue il JSON e torna pulito dopo annullamento (salvato=%s)", saved => {
    const dirty = vi.fn(); mount("accessori", vi.fn(), dirty, saved);
    const initial = template("accessori").cover_subtitle!;
    const input = screen.getByDisplayValue(initial);
    fireEvent.change(input, { target: { value: "Una modifica reale" } });
    expect(dirty).toHaveBeenLastCalledWith(true);
    const guarded = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(guarded); expect(guarded.defaultPrevented).toBe(true);
    fireEvent.change(input, { target: { value: initial } });
    expect(dirty).toHaveBeenLastCalledWith(false);
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean); expect(clean.defaultPrevented).toBe(false);
    const button = screen.getByRole("button", { name: "Salva modello" });
    if (saved) expect(button).toBeDisabled(); else expect(button).toBeEnabled();
  });
});
