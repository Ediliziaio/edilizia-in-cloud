import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TermoidraulicoTemplateEditor } from "@/components/termoidraulico/TermoidraulicoTemplateEditor";
import { createFullIdrTemplate, FULL_IDR_MODULES, type FullIdrModuleId } from "@/lib/moduli-vendita/fullIdrModules";
import type { IdrTemplatePdf } from "@/types/termoidraulico";

const calls = vi.hoisted(() => ({ remote: vi.fn(), preview: vi.fn(), success: vi.fn(), error: vi.fn(), profile: {}, storage: vi.fn(), image: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: calls.storage } } }));
vi.mock("@/lib/moduli-vendita/localTemplateImage", () => ({ readLocalTemplateImage: calls.image }));
vi.mock("@/hooks/useTermoidraulicoProgetto", () => ({
  useEffectiveCompanyId: () => "company-a", useIdrTemplatePdf: () => ({ data: null as null, isLoading: false }),
  useUpsertIdrTemplatePdf: () => ({ mutateAsync: calls.remote, isPending: false }),
  useIdrBackendReady: () => ({ data: true }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: null as null }) }));
vi.mock("@/hooks/useCompanySalesProfile", () => ({ useCompanySalesProfile: () => ({ profile: calls.profile, save: vi.fn() }), EMPTY_SALES_PROFILE: {} }));
vi.mock("@/hooks/useTermoidraulicoPDF", () => ({ useTermoidraulicoPDF: () => ({ previewPDF: calls.preview, isGenerating: false }) }));
vi.mock("@/components/termoidraulico/TermoidraulicoLivePreviewPanel", () => ({ TermoidraulicoLivePreviewPanel: () : null => null }));
vi.mock("@/components/termoidraulico/TermoidraulicoTemplatePreviewDialog", () => ({ TermoidraulicoTemplatePreviewDialog: () : null => null }));
vi.mock("@/components/preventivi/StandardTextTemplatePicker", () => ({ StandardTextTemplatePicker: () : null => null }));
vi.mock("@/components/preventivi/CopertinaAnteprima", () => ({ CopertinaAnteprima: () : null => null }));
vi.mock("@/components/preventivi/AiSalesProfileForm", () => ({ AiSalesProfileForm: () : null => null }));
vi.mock("@/components/preventivi/AiTemplateReviewDialog", () => ({ AiTemplateReviewDialog: () : null => null }));
vi.mock("sonner", () => ({ toast: { success: calls.success, error: calls.error } }));

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const template = (id: FullIdrModuleId) => createFullIdrTemplate({ id: "online", company_id: "company-a", default_iva_pct: 22, font_family: "helvetica" } as IdrTemplatePdf, id);
function mount(id: FullIdrModuleId, save = vi.fn()) {
  render(<MemoryRouter initialEntries={["/?section=page_cover"]}><TermoidraulicoTemplateEditor embedded localModule={{ id, template: template(id), saved: false, save, onDirtyChange: vi.fn() }} /></MemoryRouter>);
  return save;
}
describe("Termoidraulico: modelli originali locali", () => {
  it.each(FULL_IDR_MODULES)("%s conserva identità, anteprima e confine locale", async id => {
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
    expect(save.mock.calls[0][0].id).toBe("local-termoidraulica-" + id);
    expect(calls.remote).not.toHaveBeenCalled(); expect(calls.storage).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Genera testi con AI" })).not.toBeInTheDocument();
  });
  it("applica testi solo alla sezione scelta", () => {
    mount("acqua-calda");
    fireEvent.click(screen.getByRole("button", { name: "Testi per questo modulo" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Acqua calda sanitaria");
    expect(screen.getByRole("combobox").querySelectorAll("option")).toHaveLength(10);
  });
});
it("un modello appena aperto non segnala modifiche mai fatte", () => {
  mount("acqua-calda");
  expect(screen.getByText("Modello pronto · non ancora salvato")).toBeInTheDocument();
  expect(screen.queryByText(/Modifiche non salvate/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Salva modulo in locale" })).toBeEnabled();
});
