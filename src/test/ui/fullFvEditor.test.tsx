import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FotovoltaicoTemplateEditor } from "@/components/fotovoltaico/FotovoltaicoTemplateEditor";
import { createFullFvTemplate } from "@/lib/moduli-vendita/fullFvModules";
const calls = vi.hoisted(() => ({ remote: vi.fn(), error: vi.fn(), success: vi.fn(), company: "company-a", logo: "https://example.test/company-logo.png" as string | null, macros: [] as never[], quotes: [] as never[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: calls.company, logo_url: calls.logo } }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => calls.company }));
vi.mock("@/hooks/useCompanyAnagraficaForTemplate", () => ({ useCompanyAnagraficaForTemplate: () : null => null, inheritedPlaceholder: () => "" }));
vi.mock("@/hooks/useListinoMacrocategorie", () => ({ useListinoMacrocategorie: () => ({ macrocategorie: calls.macros, isLoading: false }) }));
vi.mock("@/hooks/useQuoteTemplates", () => ({ useQuoteTemplates: () => ({ templates: calls.quotes, upsertTemplate: { mutateAsync: calls.remote } }) }));
vi.mock("@/lib/fotovoltaico/queries", () => ({ useTemplatePdf: () => ({ data: null as null, isLoading: false }), useUpsertTemplatePdf: () => ({ mutate: calls.remote, isPending: false }) }));
vi.mock("@/components/fotovoltaico/FvLivePreviewPanel", () => ({ FvLivePreviewPanel: ({ logoUrl }: { logoUrl: string | null }) => <span data-testid="live-logo" data-logo={logoUrl ?? ""} /> }));
vi.mock("@/components/fotovoltaico/FvTemplatePreviewDialog", () => ({ default: ({ logoUrl }: { logoUrl: string | null }) => <p data-testid="dialog-logo" data-logo={logoUrl ?? ""}>Anteprima completa aperta</p> }));
vi.mock("@/components/common/ImgRiservata", () => ({ ImgRiservata: () : null => null }));
vi.mock("@/components/preventivi/AiTemplateGenerator", () => ({ AiTemplateGenerator: () => <p>AI online</p> }));
vi.mock("@/components/preventivi/StandardTextTemplatePicker", () => ({ StandardTextTemplatePicker: () => <p>Preset generici</p> }));
vi.mock("@/components/ui/rich-text-editor-safe", () => ({ RichTextEditorSafe: () : null => null }));
vi.mock("sonner", () => ({ toast: { success: calls.success, error: calls.error } }));
beforeEach(() => { calls.company = "company-a"; calls.logo = "https://example.test/company-logo.png"; vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
function mount(save = vi.fn(), logoUrl: string | null = null) {
  const template = createFullFvTemplate({}, "company-a", "accumulo");
  template.logo_url = logoUrl;
  render(<MemoryRouter initialEntries={["/?section=page_cover"]}><FotovoltaicoTemplateEditor embedded localModule={{ id: "accumulo", template, saved: false, save, onDirtyChange: vi.fn() }} /></MemoryRouter>);
  return save;
}
describe("Accumulo: editor originale e confine locale", () => {
  it.each([
    { label: "logo aziendale ereditato", templateLogo: null as null, companyLogo: "https://example.test/company-logo.png", expected: "https://example.test/company-logo.png" },
    { label: "logo del modello prioritario", templateLogo: "https://example.test/template-logo.png", companyLogo: "https://example.test/company-logo.png", expected: "https://example.test/template-logo.png" },
    { label: "nessun logo configurato", templateLogo: null as null, companyLogo: null as null, expected: "" },
  ])("$label: anteprime coerenti senza salvare", async ({ templateLogo, companyLogo, expected }) => {
    calls.logo = companyLogo;
    const save = mount(vi.fn(), templateLogo);
    expect(await screen.findByTestId("live-logo")).toHaveAttribute("data-logo", expected);
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    expect(await screen.findByTestId("dialog-logo")).toHaveAttribute("data-logo", expected);
    expect(save).not.toHaveBeenCalled();
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("salva solo l'adapter locale ed esclude preset e generatori per l'impianto intero", () => {
    const save = mount(); fireEvent.click(screen.getByRole("button", { name: "Salva in locale" }));
    expect(save).toHaveBeenCalledOnce(); expect(calls.remote).not.toHaveBeenCalled();
    expect(save.mock.calls[0][0].pdf_blocchi.modulo_intervento).toBe("accumulo");
    expect(screen.queryByText("AI online")).toBeNull(); expect(screen.queryByText("Preset generici")).toBeNull();
    expect(screen.queryByRole("button", { name: "{potenza_kwp}" })).toBeNull();
    expect(screen.getByRole("button", { name: "Salva in locale" })).toBeDisabled();
  });
  it("mantiene modifiche e salvataggio disponibile se lo spazio locale è esaurito", () => {
    mount(vi.fn(() => { throw new Error("Quota esaurita"); })); fireEvent.click(screen.getByRole("button", { name: "Salva in locale" }));
    expect(calls.error).toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Salva in locale" })).toBeEnabled();
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("rifiuta il salvataggio dopo un cambio azienda", () => {
    calls.company = "company-b"; const save = mount(); fireEvent.click(screen.getByRole("button", { name: "Salva in locale" }));
    expect(save).not.toHaveBeenCalled(); expect(calls.error).toHaveBeenCalled(); expect(calls.remote).not.toHaveBeenCalled();
  });
  it("apre anteprima e varianti specifiche senza salvare", async () => {
    const save = mount(); fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    await waitFor(() => expect(screen.getByText("Anteprima completa aperta")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Testi per questo modulo" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Accumulo fotovoltaico");
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(save).not.toHaveBeenCalled(); expect(calls.remote).not.toHaveBeenCalled();
  });
});
it("un modello appena aperto non segnala modifiche mai fatte", () => {
  mount(vi.fn());
  expect(screen.getByText("Modello pronto · non ancora salvato")).toBeInTheDocument();
  expect(screen.queryByText(/Modifiche non salvate/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Salva in locale" })).toBeEnabled();
});
