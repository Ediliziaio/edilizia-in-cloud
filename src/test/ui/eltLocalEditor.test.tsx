import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ElettricoTemplateEditor } from "@/components/elettrico/ElettricoTemplateEditor";
import { createFullEltTemplate, FULL_ELT_MODULES, type FullEltModuleId } from "@/lib/moduli-vendita/fullEltModules";
import type { EleTemplatePdf } from "@/types/elettrico";

const calls = vi.hoisted(() => ({ remote: vi.fn(), preview: vi.fn(), success: vi.fn(), error: vi.fn(), profile: {}, storage: vi.fn(), image: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: calls.storage } } }));
vi.mock("@/lib/moduli-vendita/localTemplateImage", () => ({ readLocalTemplateImage: calls.image }));
vi.mock("@/hooks/useElettricoProgetto", () => ({
  useEffectiveCompanyId: () => "company-a", useEleTemplatePdf: () => ({ data: null as null, isLoading: false }),
  useUpsertEleTemplatePdf: () => ({ mutateAsync: calls.remote, isPending: false }),
  useEleBackendReady: () => ({ data: true }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: null as null }) }));
vi.mock("@/hooks/useCompanySalesProfile", () => ({ useCompanySalesProfile: () => ({ profile: calls.profile, save: vi.fn() }), EMPTY_SALES_PROFILE: {} }));
vi.mock("@/hooks/useElettricoPDF", () => ({ useElettricoPDF: () => ({ previewPDF: calls.preview, isGenerating: false }) }));
vi.mock("@/components/elettrico/ElettricoLivePreviewPanel", () => ({ ElettricoLivePreviewPanel: (): null => null }));
vi.mock("@/components/elettrico/ElettricoTemplatePreviewDialog", () => ({ ElettricoTemplatePreviewDialog: (): null => null }));
vi.mock("@/components/preventivi/StandardTextTemplatePicker", () => ({ StandardTextTemplatePicker: (): null => null }));
vi.mock("@/components/preventivi/CopertinaAnteprima", () => ({ CopertinaAnteprima: (): null => null }));
vi.mock("@/components/preventivi/AiSalesProfileForm", () => ({ AiSalesProfileForm: (): null => null }));
vi.mock("@/components/preventivi/AiTemplateReviewDialog", () => ({ AiTemplateReviewDialog: (): null => null }));
vi.mock("sonner", () => ({ toast: { success: calls.success, error: calls.error } }));

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const template = (id: FullEltModuleId) => createFullEltTemplate({ id: "online", company_id: "company-a", default_iva_pct: 22, font_family: "helvetica" } as EleTemplatePdf, id);
function mount(id: FullEltModuleId, save = vi.fn(), section = "page_cover", onDirtyChange = vi.fn(), saved = false) {
  render(<MemoryRouter initialEntries={[`/?section=${section}`]}><ElettricoTemplateEditor embedded localModule={{ id, template: template(id), saved, save, onDirtyChange }} /></MemoryRouter>);
  return save;
}
describe("Elettrico: modelli originali locali", () => {
  it("distingue il primo salvataggio dalle vere modifiche e riconosce il ripristino", () => {
    const onDirty = vi.fn();
    const save = mount("domotica", vi.fn(), "page_cover", onDirty);
    const button = screen.getByRole("button", { name: "Salva modulo in locale" });
    expect(onDirty).toHaveBeenLastCalledWith(false);
    expect(screen.getByText("Nuovo modulo · non ancora salvato")).toBeInTheDocument();
    expect(button).toBeEnabled();
    const hero = screen.getByDisplayValue(/La casa risponde\./);
    fireEvent.change(hero, { target: { value: "Titolo modificato" } });
    expect(onDirty).toHaveBeenLastCalledWith(true);
    fireEvent.change(hero, { target: { value: template("domotica").cover_title } });
    expect(onDirty).toHaveBeenLastCalledWith(false);
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(save).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
    expect(onDirty).toHaveBeenLastCalledWith(false);
    fireEvent.change(hero, { target: { value: "Dopo il salvataggio" } });
    expect(onDirty).toHaveBeenLastCalledWith(true);
    fireEvent.click(button);
    expect(onDirty).toHaveBeenLastCalledWith(false);
    expect(button).toBeDisabled();
  });
  it("una copia già salvata si apre senza modifiche pendenti", () => {
    const onDirty = vi.fn();
    mount("quadro", vi.fn(), "page_cover", onDirty, true);
    expect(onDirty).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: "Salva modulo in locale" })).toBeDisabled();
  });
  it.each(FULL_ELT_MODULES)("%s conserva identità, anteprima e confine locale", async id => {
    const save = mount(id);
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    const data = calls.preview.mock.calls[0][0];
    expect(data.progetto.detrazione_pct).toBe(0);
    expect(data.progetto.immobile_superficie_mq).toBeNull();
    expect(data.computo).toHaveLength(3);
    expect(JSON.stringify(data.computo)).not.toMatch(/Demolizione tramezzi|Posa pavimento/);
    expect(data.template.pdf_blocchi.modulo_intervento).toBe(id);
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].id).toBe("local-elettrico-" + id);
    expect(calls.remote).not.toHaveBeenCalled(); expect(calls.storage).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Genera testi con AI" })).not.toBeInTheDocument();
  });
  it("applica testi solo alla sezione scelta", () => {
    mount("ricarica");
    fireEvent.click(screen.getByRole("button", { name: "Testi per questo modulo" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Ricarica veicoli elettrici");
    expect(screen.getByRole("combobox").querySelectorAll("option")).toHaveLength(10);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "faq-breve" } });
    fireEvent.click(screen.getByRole("button", { name: "Applica a domande frequenti" }));
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    const after = calls.preview.mock.calls[0][0].template;
    expect(after.faq).toHaveLength(4);
    expect(after.cover_title).toBe(template("ricarica").cover_title);
    expect(after.pdf_blocchi).toEqual(template("ricarica").pdf_blocchi);
  });
  it("un errore di salvataggio conserva il form e consente di riprovare", () => {
    const save = vi.fn(() => { throw new Error("Conflitto con altra scheda"); });
    mount("quadro", save);
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    expect(calls.error).toHaveBeenCalledWith("Salvataggio non riuscito", { description: "Conflitto con altra scheda" });
    expect(screen.getByRole("button", { name: "Salva modulo in locale" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    expect(calls.preview.mock.calls[0][0].template.cover_title).toBe(template("quadro").cover_title);
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("carica la foto di copertina in memoria senza chiamare lo storage", async () => {
    calls.image.mockResolvedValueOnce("data:image/png;base64,local");
    const save = mount("punti");
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const input = inputs[inputs.length - 1];
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { files: [new File(["img"], "foto.png", { type: "image/png" })] } });
    await waitFor(() => expect(calls.image).toHaveBeenCalledOnce());
    await waitFor(() => expect(calls.success).toHaveBeenCalledWith("Immagine aggiunta in locale"));
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    expect(save.mock.calls[0][0].pdf_cover_image_url).toBe("data:image/png;base64,local");
    expect(save.mock.calls[0][0].cover_image_url).toBe("data:image/png;base64,local");
    expect(calls.storage).not.toHaveBeenCalled();
  });
});
