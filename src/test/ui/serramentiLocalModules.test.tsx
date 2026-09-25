import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SerramentiModuleTemplatesPanel } from "@/components/serramenti/SerramentiModuleTemplatesPanel";
import { loadLocalSerramentiTemplate } from "@/lib/moduli-vendita/localSerramentiTemplates";
const state = vi.hoisted(() => ({ canEdit: true, company: "company-a", remote: vi.fn(), preview: vi.fn(), error: vi.fn(), brand: {} }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => state.company }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditSettingsPricing: state.canEdit }) }));
vi.mock("@/hooks/useCompanyAnagraficaForTemplate", () => ({ useCompanyAnagraficaForTemplate: () : null => null, inheritedPlaceholder: () => "" }));
vi.mock("@/hooks/useBrandSettings", () => ({ useBrandSettings: () => ({ brand: state.brand }) }));
vi.mock("@/hooks/useQuoteTemplates", () => ({ useQuoteTemplates: () => ({ templates: [] as never[], upsertTemplate: { mutateAsync: state.remote } }) }));
vi.mock("@/lib/serramenti/queries", () => ({ useTemplatePdf: () => ({ data: null as null, isLoading: false, isError: false }), useUpsertTemplatePdf: () => ({ mutate: state.remote }) }));
vi.mock("@/components/preventivi/StandardTextTemplatePicker", () => ({ StandardTextTemplatePicker: () : null => null }));
vi.mock("@/components/preventivi/AiTemplateGenerator", () => ({ AiTemplateGenerator: () : null => null }));
vi.mock("@/components/ui/rich-text-editor-safe", () => ({ RichTextEditorSafe: () : null => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: state.error, info: vi.fn() } }));
vi.mock("@/components/serramenti/SerramentiLivePreviewPanel", () => ({ SerramentiLivePreviewPanel: (props: unknown) => { state.preview(props); return <p>Anteprima test</p>; } }));
beforeEach(() => { localStorage.clear(); state.canEdit = true; state.company = "company-a"; vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const mount = (module = "") => render(<MemoryRouter initialEntries={[`/?tab=moduli-vendita&modulo=serramenti&section=page_cover${module ? `&modello=${module}` : ""}`]}><SerramentiModuleTemplatesPanel /></MemoryRouter>);
describe("libreria ed editor locali Serramenti", () => {
  it("mostra sette moduli configurabili, non schede in progettazione", () => {
    mount(); expect(screen.getAllByRole("button", { name: /^Configura / })).toHaveLength(7);
    expect(screen.queryByText("In progettazione")).toBeNull();
  });
  it("salva e riapre una personalizzazione senza mutazioni online", () => {
    mount("zanzariere");
    fireEvent.change(screen.getByLabelText("Titolo copertina"), { target: { value: "La mia zanzariera" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    expect(loadLocalSerramentiTemplate("company-a", "zanzariere")?.template.pdf_cover_hero).toBe("La mia zanzariera");
    fireEvent.click(screen.getByRole("button", { name: "Tutti i moduli Serramenti" }));
    fireEvent.click(screen.getByRole("button", { name: "Configura Zanzariere" }));
    expect(screen.getByLabelText("Titolo copertina")).toHaveValue("La mia zanzariera");
    expect(state.preview).toHaveBeenLastCalledWith(expect.objectContaining({ moduleId: "zanzariere" }));
    expect(state.remote).not.toHaveBeenCalled();
  });
  it("naviga tra sezioni conservando il testo non salvato", () => {
    mount("avvolgibili");
    fireEvent.change(screen.getByLabelText("Titolo copertina"), { target: { value: "Avvolgibili su misura" } });
    fireEvent.click(screen.getByRole("button", { name: /Contenuti commerciali/ }));
    expect(screen.getByLabelText("Esclusioni del modulo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Copertina/ }));
    expect(screen.getByLabelText("Titolo copertina")).toHaveValue("Avvolgibili su misura");
    expect(loadLocalSerramentiTemplate("company-a", "avvolgibili")).toBeNull();
  });
  it("richiede un titolo e mantiene aperta la bozza", () => {
    mount("zanzariere"); fireEvent.change(screen.getByLabelText("Titolo copertina"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    expect(state.error).toHaveBeenCalledWith("Inserisci un titolo di copertina.");
    expect(screen.getByLabelText("Titolo copertina")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Salva modulo in locale" })).toBeEnabled();
    expect(loadLocalSerramentiTemplate("company-a", "zanzariere")).toBeNull();
  });
  it("non apre editor per utenti privi dei permessi", () => {
    state.canEdit = false; mount("zanzariere");
    expect(screen.queryByRole("button", { name: "Salva modulo in locale" })).toBeNull();
  });
});
