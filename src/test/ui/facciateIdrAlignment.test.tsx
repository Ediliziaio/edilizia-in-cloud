import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FacciateTemplateEditor } from "@/components/facciate/FacciateTemplateEditor";
import { FacciateLocalImageField } from "@/components/facciate/FacciateLocalImageField";
import { templateEditorLayout } from "@/components/preventivi/TemplateEditorLayout";
import { clearFacDraft, getFacDraft } from "@/components/facciate/facDraftRecovery";
import { createFullFacTemplate, FULL_FAC_MODULES, type FullFacModuleId, type FullFacTemplate } from "@/lib/moduli-vendita/fullFacModules";
import { fotoDellaLibreria } from "../../../supabase/functions/_shared/blocchiPreventivo";
import { COVER_PRESETS } from "@/components/termoidraulico/coverPresets";
import { assertFacTemplate } from "@/lib/moduli-vendita/localFacTemplates";

const calls = vi.hoisted(() => ({ remote: vi.fn(() => { throw new Error("Network forbidden in local Facciate"); }), image: vi.fn(), preview: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, { get: calls.remote }) }));
vi.mock("@/lib/moduli-vendita/localTemplateImage", () => ({ readLocalTemplateImage: calls.image }));
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({ PdfBlobLivePreviewPanel: (props: { depsKey: string; activeSection: string }) => {
  calls.preview(props); return <div aria-label="Sezione PDF">{props.activeSection}</div>;
} }));

beforeEach(() => {
  localStorage.clear();
  for (const id of FULL_FAC_MODULES) clearFacDraft("fac-alignment", id);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const make = (id: FullFacModuleId = "cappotto") => createFullFacTemplate({ company_id: "fac-alignment" }, id);
function mount({ id = "cappotto", template = make(id), save = vi.fn(), saved = false, section = "page_cover" }: {
  id?: FullFacModuleId; template?: FullFacTemplate; save?: (value: FullFacTemplate) => void | Promise<void>; saved?: boolean; section?: string;
} = {}) {
  return render(<MemoryRouter initialEntries={[`/?area=facciate&modello=${id}&section=${section}`]}><FacciateTemplateEditor moduleId={id} template={template} save={save} saved={saved} /></MemoryRouter>);
}
const navigate = (name: string) => fireEvent.click(within(screen.getByRole("navigation", { name: "Pagine del PDF Facciate" })).getByRole("button", { name }));
const saveButton = () => screen.getByRole("button", { name: "Salva modello" });

describe("Facciate shared Idr visual contract, local only", () => {
  it("salva i controlli avanzati senza perdere immagini o metadati", async () => {
    const template = make(), save = vi.fn();
    template.pdf_blocchi.private_metadata = { keep: true };
    mount({ template, save });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Dimensione occhiello (pt)" }), { target: { value: "12" } });
    fireEvent.blur(screen.getByRole("spinbutton", { name: "Dimensione occhiello (pt)" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Posizione logo" }), { target: { value: "hidden" } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0]).toEqual({ ...template, pdf_cover_eyebrow_size: 12, pdf_cover_logo_position: "hidden" });
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it.each(FULL_FAC_MODULES)("uses the shared responsive shell and grouped orange nav for %s without changing data", async id => {
    const template = make(id), original = structuredClone(template), save = vi.fn();
    const { container } = mount({ id, template, save });
    expect(container.querySelector("[data-template-workspace]")).not.toBeNull();
    expect(container.querySelector("[data-template-navigation]")?.className).toBe(templateEditorLayout.navigation);
    expect(container.querySelector("[data-template-content]")?.className).toBe(templateEditorLayout.content);
    expect(container.querySelector("[data-template-preview]")?.className).toContain(templateEditorLayout.previewPanel);
    expect(screen.getByRole("navigation")).toHaveClass(...templateEditorLayout.navigationPanel.split(" "));
    for (const title of ["AZIENDA", "PAGINE DEL PDF", "DATI & CONTENUTI"]) expect(within(screen.getByRole("navigation")).getByText(title)).toBeInTheDocument();
    const selected = within(screen.getByRole("navigation")).getByRole("button", { name: "Copertina" });
    expect(selected).toHaveAttribute("aria-current", "page");
    expect(selected).toHaveClass("bg-orange-700", "text-white");
    const bar = container.querySelector("[data-template-save-bar]")!;
    expect(bar).toHaveClass(...templateEditorLayout.saveBar.split(" "));
    expect(bar).toContainElement(saveButton());
    expect(screen.getByRole("status")).toHaveTextContent("Nuovo modulo non ancora salvato");
    expect(getFacDraft("fac-alignment", id)).toBeUndefined();
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledWith(original));
    expect(template).toEqual(original);
    expect(calls.remote).not.toHaveBeenCalled();
  });

  it("passes stable selected section, not content-dependent title or page number, and preserves edits across mobile views", () => {
    mount();
    fireEvent.change(screen.getByRole("textbox", { name: "Titolo copertina" }), { target: { value: "Titolo personalizzato" } });
    const before = calls.preview.mock.lastCall![0].depsKey;
    navigate("Controlli di qualità");
    expect(screen.getByLabelText("Sezione PDF")).toHaveTextContent("page_controlli");
    expect(calls.preview.mock.lastCall![0].depsKey).toBe(before);
    fireEvent.click(screen.getByRole("button", { name: "Anteprima" }));
    expect(screen.getByRole("button", { name: "Anteprima" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Modifica" }));
    navigate("Copertina");
    expect(screen.getByRole("textbox", { name: "Titolo copertina" })).toHaveValue("Titolo personalizzato");
    expect(screen.getByRole("status")).toHaveTextContent("Modifiche non salvate");
  });

  it("offers actual module photos for the cover, updates both aliases and preserves other saved content", async () => {
    const template = make("balconi"), save = vi.fn();
    template.pdf_blocchi.private_metadata = { keep: [1, 2] };
    template.cover_title = "Titolo aziendale";
    const expected = fotoDellaLibreria("ristrutturazione", template.pdf_blocchi);
    mount({ id: "balconi", template, saved: true, save });
    fireEvent.click(screen.getByRole("button", { name: "Scegli dalla libreria del modulo" }));
    const library = within(screen.getByLabelText("Libreria foto Facciate"));
    expect(library.getAllByRole("button")).toHaveLength(expected.length);
    fireEvent.click(library.getByRole("button", { name: `Usa ${expected[1].nome} in copertina` }));
    expect(screen.getByAltText("Immagine copertina")).toHaveAttribute("src", expected[1].url);
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0]).toEqual({ ...template, pdf_cover_image_url: expected[1].url, cover_image_url: expected[1].url });
    expect(calls.remote).not.toHaveBeenCalled();
  });

  it("does not restore a deliberately removed cover on mount or when opening the library", async () => {
    const template = make(), save = vi.fn(); template.pdf_cover_image_url = null; template.cover_image_url = null;
    mount({ template, saved: true, save });
    expect(screen.queryByAltText("Immagine copertina")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Scegli dalla libreria del modulo" }));
    expect(saveButton()).toBeDisabled();
    expect(getFacDraft("fac-alignment", "cappotto")).toBeUndefined();
    fireEvent.change(screen.getByRole("textbox", { name: "Sottotitolo copertina" }), { target: { value: "Nuovo sottotitolo" } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0]).toMatchObject({ pdf_cover_image_url: null as null, cover_image_url: null as null });
  });

  it("edits testimonial headers, role, photo and visibility with shared local schema but no online-review hook", async () => {
    const template = make(), save = vi.fn();
    template.testimonianze = [{ autore: "Cliente autorizzato", testo: "Testo autentico", ruolo: "Condominio" }];
    template.pdf_ordine_capitoli = template.pdf_ordine_capitoli!.map(item => item.chiave === "recensioni" ? { ...item, visibile: true } : item);
    template.pdf_blocchi.testata_recensioni = { occhiello: "Esperienze", extra: "preservare" };
    mount({ template, saved: true, save, section: "page_testimonianze" });
    expect(screen.getByLabelText("Ruolo o contesto 1")).toHaveValue("Condominio");
    fireEvent.change(screen.getByLabelText("Ruolo o contesto 1"), { target: { value: "Amministratore" } });
    fireEvent.change(screen.getByLabelText("Titolo testimonianze"), { target: { value: "Le esperienze autorizzate" } });
    fireEvent.click(screen.getByRole("switch", { name: "Mostra «Dicono di noi» nel PDF" }));
    const navItem = within(screen.getByRole("navigation")).getByRole("button", { name: "Dicono di noi" });
    expect(within(navItem).getByLabelText("Esclusa dal PDF")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aggiorna.*foto/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Scegli dalla libreria" }));
    const photo = fotoDellaLibreria("ristrutturazione", template.pdf_blocchi)[0];
    fireEvent.click(screen.getByRole("img", { name: photo.nome }).closest("button")!);
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const stored = save.mock.calls[0][0] as FullFacTemplate;
    expect(stored.testimonianze[0]).toEqual({ ...template.testimonianze[0], ruolo: "Amministratore" });
    expect(stored.pdf_blocchi.testata_recensioni).toEqual({ occhiello: "Esperienze", extra: "preservare", titolo: "Le esperienze autorizzate" });
    expect(stored.pdf_blocchi.pagina_recensioni).toEqual({ foto: [photo.url], senzaFoto: false });
    expect(stored.pdf_blocchi.modulo_foto_revisione).toBe(template.pdf_blocchi.modulo_foto_revisione);
    expect(stored.pdf_ordine_capitoli?.find(item => item.chiave === "recensioni")?.visibile).toBe(false);
    expect(calls.remote).not.toHaveBeenCalled();
  });

  it("keeps pending, failed and retried saves explicit in the persistent bar without losing the draft", async () => {
    let reject!: (error: Error) => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; })).mockResolvedValueOnce(undefined);
    const { container } = mount({ save });
    fireEvent.change(screen.getByRole("textbox", { name: "Titolo copertina" }), { target: { value: "Da conservare" } });
    fireEvent.click(saveButton());
    const pending = screen.getByRole("button", { name: "Salvataggio…" });
    expect(pending).toBeDisabled(); fireEvent.click(pending); expect(save).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox", { name: "Titolo copertina" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Salvataggio in corso");
    await act(async () => reject(new Error("Quota locale esaurita")));
    expect(container.querySelector("[data-template-save-bar]")).toContainElement(screen.getByRole("alert"));
    expect(screen.getByRole("alert")).toHaveTextContent("Quota locale esaurita");
    expect(screen.getByRole("status")).toHaveTextContent("Modifiche non salvate");
    expect(getFacDraft("fac-alignment", "cappotto")?.template.cover_title).toBe("Da conservare");
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Modello salvato"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(saveButton()).toBeDisabled();
    expect(save.mock.calls[1][0].cover_title).toBe("Da conservare");
  });

  it.each(COVER_PRESETS)("applies native cover style $id without importing sector photos or losing content", async preset => {
    const template = make(), save = vi.fn();
    template.pdf_cover_image_url = null; template.cover_image_url = null;
    template.cover_title = "Titolo personale";
    mount({ template, save, saved: true });
    fireEvent.click(screen.getByText("Stile copertina"));
    // jsdom does not toggle <details> through fireEvent; open it explicitly as the browser would.
    screen.getByText("Stile copertina").closest("details")!.open = true;
    fireEvent.click(screen.getByRole("button", { name: `Applica stile ${preset.nome}` }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const stored = save.mock.calls[0][0] as FullFacTemplate;
    const { pdf_cover_image_url: _excluded, ...styles } = preset.patch;
    expect(stored).toEqual({ ...template, ...styles });
    expect(() => assertFacTemplate(stored, template.company_id, "cappotto")).not.toThrow();
    expect(stored.pdf_cover_image_url).toBeNull();
    expect(stored.cover_image_url).toBeNull();
    expect(calls.remote).not.toHaveBeenCalled();
  });

  it("shows the local empty uploader, pending/error state, retry and removal without network", async () => {
    let resolve!: (url: string) => void;
    calls.image.mockRejectedValueOnce(new Error("Formato non valido")).mockImplementationOnce(() => new Promise<string>(done => { resolve = done; }));
    const onChange = vi.fn(), props = { label: "Foto test", value: null as string | null, onChange };
    const mounted = render(<FacciateLocalImageField {...props} />);
    expect(screen.getByText("Nessuna immagine")).toBeVisible();
    const file = new File(["local"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Carica foto test"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Formato non valido"));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Carica foto test"), { target: { files: [file] } });
    expect(screen.getByRole("button", { name: "Carica" })).toBeDisabled();
    await act(async () => resolve("data:image/png;base64,AAAA"));
    expect(onChange).toHaveBeenCalledWith("data:image/png;base64,AAAA");
    mounted.rerender(<FacciateLocalImageField {...props} value="data:image/png;base64,AAAA" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByAltText("Foto test")).toHaveClass("object-contain");
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi foto test" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(calls.remote).not.toHaveBeenCalled();
  });
});
