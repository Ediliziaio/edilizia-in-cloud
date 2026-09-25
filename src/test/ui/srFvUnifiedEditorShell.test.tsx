import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SerramentiTemplateEditor } from "@/components/serramenti/SerramentiTemplateEditor";
import { FotovoltaicoTemplateEditor } from "@/components/fotovoltaico/FotovoltaicoTemplateEditor";
import { FULL_SERRAMENTI_MODULES, createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { FULL_FV_MODULES, createFullFvTemplate } from "@/lib/moduli-vendita/fullFvModules";
import { templateEditorLayout } from "@/components/preventivi/TemplateEditorLayout";

const calls = vi.hoisted(() => ({ remote: vi.fn(), error: vi.fn(), company: "company-a", brand: {}, quotes: [] as never[], macros: [] as never[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: calls.company, logo_url: null as null } }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => calls.company }));
vi.mock("@/hooks/useCompanyAnagraficaForTemplate", () => ({ useCompanyAnagraficaForTemplate: () : null => null, inheritedPlaceholder: () => "" }));
vi.mock("@/hooks/useBrandSettings", () => ({ useBrandSettings: () => ({ brand: calls.brand }) }));
vi.mock("@/hooks/useListinoMacrocategorie", () => ({ useListinoMacrocategorie: () => ({ macrocategorie: calls.macros, isLoading: false }) }));
vi.mock("@/hooks/useQuoteTemplates", () => ({ useQuoteTemplates: () => ({ templates: calls.quotes, upsertTemplate: { mutateAsync: calls.remote } }) }));
vi.mock("@/lib/serramenti/queries", () => ({ useTemplatePdf: () => ({ data: null as null, isLoading: false }), useUpsertTemplatePdf: () => ({ mutate: calls.remote, isPending: false }) }));
vi.mock("@/lib/fotovoltaico/queries", () => ({ useTemplatePdf: () => ({ data: null as null, isLoading: false }), useUpsertTemplatePdf: () => ({ mutate: calls.remote, isPending: false }) }));
vi.mock("@/components/serramenti/SerramentiLivePreviewPanel", () => ({ SerramentiLivePreviewPanel: () => <p>Preview Sr</p> }));
vi.mock("@/components/fotovoltaico/FvLivePreviewPanel", () => ({ FvLivePreviewPanel: () => <p>Preview FV</p> }));
vi.mock("@/components/serramenti/SerramentiTemplatePreviewDialog", () => ({ SerramentiTemplatePreviewDialog: () => <p>Dialog Sr</p> }));
vi.mock("@/components/fotovoltaico/FvTemplatePreviewDialog", () => ({ default: () => <p>Dialog FV</p> }));
vi.mock("@/components/common/ImgRiservata", () => ({ ImgRiservata: () : null => null }));
vi.mock("@/components/preventivi/AiTemplateGenerator", () => ({ AiTemplateGenerator: () : null => null }));
vi.mock("@/components/preventivi/StandardTextTemplatePicker", () => ({ StandardTextTemplatePicker: () : null => null }));
vi.mock("@/components/ui/rich-text-editor-safe", () => ({ RichTextEditorSafe: () : null => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: calls.error, info: vi.fn() } }));

beforeEach(() => {
  calls.company = "company-a";
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const fixtures = [
  ...FULL_SERRAMENTI_MODULES.map(id => ({ sector: "serramenti" as const, id })),
  ...FULL_FV_MODULES.map(id => ({ sector: "fotovoltaico" as const, id })),
];
function mount(fixture: typeof fixtures[number], saved = false, save = vi.fn()) {
  const onDirtyChange = vi.fn();
  const common = { saved, save, onDirtyChange };
  function buildEditor() {
    if (fixture.sector === "serramenti") {
      const template = createFullSerramentiTemplate({ company_id: "company-a" }, fixture.id);
      template.pdf_cover_hero = "Titolo personalizzato da preservare";
      return { before: structuredClone(template), editor: <SerramentiTemplateEditor embedded localModule={{ ...common, id: fixture.id, template }} /> };
    }
    const template = createFullFvTemplate({}, "company-a", fixture.id);
    template.pdf_cover_hero = "Titolo personalizzato da preservare";
    return { before: structuredClone(template), editor: <FotovoltaicoTemplateEditor embedded localModule={{ ...common, id: fixture.id, template }} /> };
  }
  const { before, editor } = buildEditor();
  const view = render(<MemoryRouter initialEntries={["/?section=page_controlli"]}>{editor}</MemoryRouter>);
  const content = view.container.querySelector(`[data-template-editor-content="${fixture.sector}"]`)! as HTMLElement;
  const bar = content.querySelector("[data-template-save-bar]")! as HTMLElement;
  const saveButton = within(bar).getByRole("button", { name: "Salva modello" });
  return { ...view, content, bar, saveButton, save, before, onDirtyChange };
}

describe("Shell condivisa Sr/FV: tutti i 12 editor incorporati", () => {
  it.each(fixtures)("$sector/$id: 2/6/4, footer nel form e copia conservata", fixture => {
    const { content, bar, saveButton, save, before, onDirtyChange } = mount(fixture);
    expect(content.className).toBe(templateEditorLayout.content);
    expect(content.parentElement).toHaveClass(...templateEditorLayout.grid.split(" "));
    expect(content).toHaveAttribute("data-template-content");
    const navigation = content.previousElementSibling!;
    expect(navigation).toHaveAttribute("data-template-navigation");
    expect(navigation.className).toBe(templateEditorLayout.navigation);
    expect(navigation.querySelector("nav")?.className).toBe(templateEditorLayout.navigationPanel);
    expect(within(navigation as HTMLElement).getByRole("button", { name: "Scegli la pagina da modificare" })).toHaveAttribute("aria-expanded", "false");
    expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(navigation.querySelector('[aria-current="page"]')).toHaveTextContent(/Controlli/i);
    expect(content.nextElementSibling?.className).toBe(templateEditorLayout.preview);
    expect(content.nextElementSibling).toHaveAttribute("data-template-preview");
    expect(content.nextElementSibling?.firstElementChild?.className).toBe(templateEditorLayout.previewPanel);
    expect(bar.className).toBe(templateEditorLayout.saveBar);
    expect(content.lastElementChild).toBe(bar);
    expect(within(bar).getByRole("status")).toHaveTextContent("Modello da salvare");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(saveButton);
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0].pdf_cover_hero).toBe(before.pdf_cover_hero);
    expect(save.mock.calls[0][0].pdf_blocchi).toEqual(before.pdf_blocchi);
    expect(saveButton).toBeDisabled();
    expect(within(bar).getByRole("status")).toHaveTextContent("Tutto salvato");
    expect(calls.remote).not.toHaveBeenCalled();
  });

  for (const fixture of [fixtures[0], fixtures[7]]) {
    it(`${fixture.sector}: aria-current segue solo la sezione selezionata senza salvare`, () => {
      const { content, save, onDirtyChange } = mount(fixture);
      const navigation = content.previousElementSibling! as HTMLElement;
      fireEvent.click(within(navigation).getByRole("button", { name: "Scegli la pagina da modificare" }));
      const previous = within(navigation).getByRole("button", { current: "page" });
      const next = within(navigation).getByRole("button", { name: "Copertina" });
      fireEvent.click(next);
      expect(next).toHaveAttribute("aria-current", "page");
      expect(previous).not.toHaveAttribute("aria-current");
      expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
      expect(onDirtyChange).toHaveBeenLastCalledWith(false);
      expect(save).not.toHaveBeenCalled();
      expect(calls.remote).not.toHaveBeenCalled();
    });
    it(`${fixture.sector}: mobile, anteprima dal footer e nessun salvataggio implicito`, async () => {
      const { content, bar, save } = mount(fixture);
      const switcher = screen.getByRole("group", { name: "Vista del modello" });
      fireEvent.click(within(switcher).getByRole("button", { name: "Anteprima" }));
      expect(within(switcher).getByRole("button", { name: "Anteprima" })).toHaveAttribute("aria-pressed", "true");
      expect(content.parentElement).toHaveClass("[&>[data-template-content]]:hidden");
      fireEvent.click(within(switcher).getByRole("button", { name: "Modifica" }));
      expect(content.parentElement).toHaveClass("[&>[data-template-preview]]:hidden");
      expect(content.querySelector("[data-template-save-bar]")).toBe(bar);
      const picker = screen.getByRole("button", { name: "Scegli la pagina da modificare" });
      fireEvent.click(picker);
      expect(picker).toHaveAttribute("aria-expanded", "true");
      expect(document.getElementById(picker.getAttribute("aria-controls")!)).not.toHaveClass("hidden");
      fireEvent.click(picker);
      expect(picker).toHaveAttribute("aria-expanded", "false");
      expect(document.getElementById(picker.getAttribute("aria-controls")!)).toHaveClass("hidden");
      fireEvent.click(within(bar).getByRole("button", { name: "Apri anteprima PDF" }));
      await waitFor(() => expect(screen.getByText(fixture.sector === "serramenti" ? "Dialog Sr" : "Dialog FV")).toBeInTheDocument());
      expect(save).not.toHaveBeenCalled();
      expect(calls.remote).not.toHaveBeenCalled();
    });
    it(`${fixture.sector}: errore locale mantiene footer salvabile`, () => {
      const { bar, saveButton } = mount(fixture, false, vi.fn(() => { throw new Error("Quota esaurita"); }));
      fireEvent.click(saveButton);
      expect(calls.error).toHaveBeenCalled();
      expect(saveButton).toBeEnabled();
      expect(within(bar).getByRole("status")).toHaveTextContent("Modello da salvare");
      expect(calls.remote).not.toHaveBeenCalled();
    });
    it(`${fixture.sector}: copia già salvata resta pulita all'apertura`, () => {
      const { bar, saveButton, onDirtyChange } = mount(fixture, true);
      expect(saveButton).toBeDisabled();
      expect(onDirtyChange).toHaveBeenLastCalledWith(false);
      expect(within(bar).getByRole("status")).toHaveTextContent("Tutto salvato");
    });
  }
});
