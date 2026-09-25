import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TettiTemplateEditor } from "@/components/tetti/TettiTemplateEditor";
import { createTettiModuleTemplate } from "@/lib/moduli-vendita/tettiTemplateModules";
import type { TetTemplatePdf } from "@/types/tetti";

const calls = vi.hoisted(() => ({ remote: vi.fn(), preview: vi.fn(), success: vi.fn(), error: vi.fn(), profile: {} }));
vi.mock("@/hooks/useTettiProgetto", () => ({
  useEffectiveCompanyId: () => "company-a", useTetTemplatePdf: () => ({ data: null as null, isLoading: false }),
  useUpsertTetTemplatePdf: () => ({ mutateAsync: calls.remote, isPending: false }),
  useTetBackendReady: () => ({ data: true }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: null as null }) }));
vi.mock("@/hooks/useCompanySalesProfile", () => ({ useCompanySalesProfile: () => ({ profile: calls.profile, save: vi.fn() }), EMPTY_SALES_PROFILE: {} }));
vi.mock("@/hooks/useTettiPDF", () => ({ useTettiPDF: () => ({ previewPDF: calls.preview, isGenerating: false }) }));
vi.mock("@/components/tetti/TettiLivePreviewPanel", () => ({ TettiLivePreviewPanel: () : null => null }));
vi.mock("@/components/tetti/TettiTemplatePreviewDialog", () => ({ TettiTemplatePreviewDialog: () : null => null }));
vi.mock("@/components/preventivi/StandardTextTemplatePicker", () => ({ StandardTextTemplatePicker: () : null => null }));
vi.mock("@/components/preventivi/AiSalesProfileForm", () => ({ AiSalesProfileForm: () : null => null }));
vi.mock("@/components/preventivi/AiTemplateReviewDialog", () => ({ AiTemplateReviewDialog: () : null => null }));
vi.mock("sonner", () => ({ toast: { success: calls.success, error: calls.error } }));

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const template = () => createTettiModuleTemplate({ id: "online", company_id: "company-a", default_iva_pct: 22, font_family: "helvetica" } as TetTemplatePdf, "ripasso");
function mount(save: (t: TetTemplatePdf) => void) {
  return render(<MemoryRouter initialEntries={["/?section=page_cover"]}><TettiTemplateEditor embedded localModule={{ id: "ripasso", template: template(), saved: false, save, onDirtyChange: vi.fn() }} /></MemoryRouter>);
}
describe("editor Tetti: confine locale/online", () => {
  it("converte l'opacità percentuale senza toccare la copertina", async () => {
    const save = vi.fn(); mount(save);
    fireEvent.change(screen.getByRole("slider", { name: "Intensità velo scuro: cursore" }), { target: { value: "70" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].cover_overlay_opacity).toBe(0.7);
    expect(save.mock.calls[0][0].cover_image_url).toBe(template().cover_image_url);
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("conserva gli a capo del titolo di copertina", async () => {
    const save = vi.fn(); mount(save);
    const title = screen.getByRole("textbox", { name: "Titolo copertina" });
    expect(title.tagName).toBe("TEXTAREA");
    fireEvent.change(title, { target: { value: "Una nuova copertura.\nOgni scelta, chiara." } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].cover_title).toContain("\n");
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("salva tramite l'adapter locale senza invocare upsert Supabase", async () => {
    const save = vi.fn(); mount(save);
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].cover_title).toBe("Ripasso del tetto");
    expect(calls.remote).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Salva modello" })).toBeDisabled();
  });
  it("mantiene la bozza sporca quando il salvataggio fallisce", () => {
    mount(() => { throw new Error("Quota esaurita"); });
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    expect(calls.error).toHaveBeenCalled();
    expect(calls.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Salva modello" })).toBeEnabled();
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("apre un'anteprima Ripasso e non il computo della ristrutturazione", () => {
    mount(vi.fn());
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    expect(calls.preview).toHaveBeenCalledTimes(1);
    expect(calls.preview.mock.calls[0][0].progetto.tipo_intervento).toBe("Ripasso del tetto");
    expect(JSON.stringify(calls.preview.mock.calls[0][0].computo)).not.toMatch(/tramezzi|porcellanato/);
    expect(calls.remote).not.toHaveBeenCalled();
  });
});
it("un modello appena aperto non segnala modifiche mai fatte", () => {
  mount(vi.fn());
  expect(screen.getByText("Modello pronto · non ancora salvato")).toBeInTheDocument();
  expect(screen.queryByText(/Modifiche non salvate/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Salva modello" })).toBeEnabled();
});
