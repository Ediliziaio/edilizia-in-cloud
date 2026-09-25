import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SerramentiTemplateEditor } from "@/components/serramenti/SerramentiTemplateEditor";
import { createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";

const calls = vi.hoisted(() => ({ remote: vi.fn(), preview: vi.fn(), error: vi.fn(), success: vi.fn(), company: "company-a", brand: {} }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => calls.company }));
vi.mock("@/hooks/useCompanyAnagraficaForTemplate", () => ({ useCompanyAnagraficaForTemplate: () : null => null, inheritedPlaceholder: () => "" }));
vi.mock("@/hooks/useBrandSettings", () => ({ useBrandSettings: () => ({ brand: calls.brand }) }));
vi.mock("@/hooks/useQuoteTemplates", () => ({ useQuoteTemplates: () => ({ templates: [] as never[], upsertTemplate: { mutateAsync: calls.remote } }) }));
vi.mock("@/lib/serramenti/queries", () => ({ useTemplatePdf: () => ({ data: null as null, isLoading: false }), useUpsertTemplatePdf: () => ({ mutate: calls.remote, isPending: false }) }));
vi.mock("@/components/serramenti/SerramentiLivePreviewPanel", () => ({ SerramentiLivePreviewPanel: (props: unknown): null => { calls.preview(props); return null; } }));
vi.mock("@/components/preventivi/StandardTextTemplatePicker", () => ({ StandardTextTemplatePicker: () => <p>Area-wide presets</p> }));
vi.mock("@/components/preventivi/AiTemplateGenerator", () => ({ AiTemplateGenerator: () => <p>AI online generator</p> }));
vi.mock("@/components/ui/rich-text-editor-safe", () => ({ RichTextEditorSafe: () : null => null }));
vi.mock("sonner", () => ({ toast: { success: calls.success, error: calls.error, info: vi.fn() } }));
beforeEach(() => { calls.company = "company-a"; vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const seed = () => createFullSerramentiTemplate({ company_id: "company-a", ragione_sociale: "Impresa esempio" }, "persiane");
function mount(save = vi.fn(), section = "page_cover") {
  const props = { id: "persiane" as const, template: seed(), saved: false, save, onDirtyChange: vi.fn() };
  render(<MemoryRouter initialEntries={[`/?section=${section}`]}><SerramentiTemplateEditor localModule={props} /></MemoryRouter>);
  return save;
}
describe("editor completo Persiane: isolamento locale", () => {
  it("usa un solo interruttore confronto e sincronizza ordine e flag senza perdere righe", async () => {
    const save = mount(vi.fn(), "page_confronto");
    await screen.findByText("Tabella tecnica che mostra il delta misurabile: serramento attuale vs nuovo.");
    expect(screen.queryByRole("checkbox", { name: "Mostra pagina confronto nel PDF" })).toBeNull();
    const toggle = screen.getByRole("switch", { name: "Mostra «Confronto prima e dopo» nel PDF" });
    expect(toggle).not.toBeChecked();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    expect(save.mock.calls[0][0].confronto_attivo).toBe(true);
    expect(save.mock.calls[0][0].pdf_pages_order.find((page: { id: string }) => page.id === "confronto").visible).toBe(true);
    expect(save.mock.calls[0][0].confronto_righe).toEqual(seed().confronto_righe);
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    expect(save.mock.calls[1][0].confronto_attivo).toBe(false);
    expect(save.mock.calls[1][0].pdf_pages_order.find((page: { id: string }) => page.id === "confronto").visible).toBe(false);
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("usa un titolo neutro nella pagina prodotto del modulo, non la descrizione degli infissi", () => {
    mount(vi.fn(), "page_come_funziona");
    expect(screen.getAllByRole("heading").some(h => h.textContent?.includes("Come funziona"))).toBe(true);
    expect(screen.queryByRole("heading", { name: "Come è fatto un serramento" })).not.toBeInTheDocument();
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("modifica e salva le esclusioni nella copia locale, senza toccare il template online", () => {
    const save = mount(vi.fn(), "contenuti");
    fireEvent.change(screen.getByLabelText("Esclusioni del modulo"), { target: { value: "Ripristini non compresi nella fornitura." } });
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    expect(save.mock.calls[0][0].pdf_blocchi.modulo_esclusioni).toBe("Ripristini non compresi nella fornitura.");
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("salva la copia locale senza modificare template o libreria online", () => {
    const save = mount();
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0].pdf_blocchi.modulo_edizione).toBe(2);
    expect(calls.remote).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Salva modulo in locale" })).toBeDisabled();
    expect(calls.preview).toHaveBeenLastCalledWith(expect.objectContaining({ moduleId: "persiane" }));
    expect(screen.queryByText("AI online generator")).toBeNull();
    expect(screen.queryByText("Area-wide presets")).toBeNull();
  });
  it("conserva la bozza modificata se lo spazio locale è esaurito", () => {
    mount(vi.fn(() => { throw new Error("Spazio locale esaurito"); }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    expect(calls.error).toHaveBeenCalledWith("Spazio locale esaurito");
    expect(screen.getByRole("button", { name: "Salva modulo in locale" })).toBeEnabled();
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("presenta i blocchi di controllo realmente modificabili", () => {
    mount(vi.fn(), "page_controlli");
    expect(screen.getByDisplayValue("La verifica, *vano per vano*")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Chiusure e fermi")).toBeInTheDocument();
  });
  it("non salva nella società sbagliata", () => {
    calls.company = "company-b";
    const save = mount();
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    expect(save).not.toHaveBeenCalled();
    expect(calls.error).toHaveBeenCalledWith(expect.stringContaining("azienda è cambiata"));
  });
});
it("un modello appena aperto non segnala modifiche mai fatte", () => {
  mount(vi.fn());
  expect(screen.getByText("Modello pronto · non ancora salvato")).toBeInTheDocument();
  expect(screen.queryByText(/Modifiche non salvate/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Salva modulo in locale" })).toBeEnabled();
});
