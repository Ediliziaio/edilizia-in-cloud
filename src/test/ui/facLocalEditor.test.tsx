import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { FacciateModuleTemplatePanel } from "@/components/facciate/FacciateModuleTemplatePanel";
import { FacciateTemplateEditor } from "@/components/facciate/FacciateTemplateEditor";
import { createFullFacTemplate, FULL_FAC_MODULES, type FullFacModuleId, type FullFacTemplate } from "@/lib/moduli-vendita/fullFacModules";
import { loadLocalFacTemplate, saveLocalFacTemplate } from "@/lib/moduli-vendita/localFacTemplates";
import { clearFacDraft, getFacDraft } from "@/components/facciate/facDraftRecovery";

const calls = vi.hoisted(() => ({ remote: vi.fn(() => { throw new Error("Online access forbidden"); }), image: vi.fn(), preview: vi.fn(), archivio: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, { get: calls.remote }) }));
// Dal 25/09 i modelli si salvano per l'azienda (archivioModelli.ts, tabella
// modelli_libreria_azienda): l'editor non chiama mai il database da sé, passa
// dall'archivio. Qui l'archivio scrive solo nel browser e registra il salvataggio.
vi.mock("@/lib/moduli-vendita/archivioModelli", () => ({
  archivioModelliAzienda: {
    getItem: (chiave: string) => localStorage.getItem(chiave),
    setItem: (chiave: string, valore: string) => { calls.archivio(chiave); localStorage.setItem(chiave, valore); },
  },
  modelliDaMandareOnline: (): string[] => [],
  sincronizzaModelliAzienda: async () => ({ scaricati: 0, caricati: 0, daMandareOnline: [] as string[] }),
}));
vi.mock("@/lib/moduli-vendita/localTemplateImage", () => ({ readLocalTemplateImage: calls.image }));
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({ PdfBlobLivePreviewPanel: (props: { depsKey: string }) => { calls.preview(props.depsKey); return <div aria-label="PDF natif" />; } }));
beforeEach(() => { localStorage.clear(); for (const id of FULL_FAC_MODULES) clearFacDraft("company-a", id); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const make = (id: FullFacModuleId = "cappotto") => createFullFacTemplate({ company_id: "company-a" }, id);
function Location() { const loc = useLocation(), go = useNavigate(); return <><output aria-label="Route">{loc.search}</output><button onClick={() => go("/?area=bagni")}>Vai ai bagni</button><Link to="/?area=serramenti">Sidebar serramenti</Link></>; }
function mount(id: FullFacModuleId = "cappotto", save?: (template: FullFacTemplate) => void | Promise<void>) {
  return render(<MemoryRouter initialEntries={[`/?tab=moduli&area=facciate&modello=${id}&section=page_cover`]}>
    <Location />{save ? <FacciateTemplateEditor moduleId={id} template={make(id)} saved={false} save={save} /> : <FacciateModuleTemplatePanel companyId="company-a" moduleId={id} />}
  </MemoryRouter>);
}
describe("dedicated Facciate native editor", () => {
  it.each(FULL_FAC_MODULES)("treats untouched new %s as unsaved, not dirty, and allows its first save", async id => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount(id);
    expect(screen.getByText("Nuovo modulo non ancora salvato")).toBeVisible();
    expect(screen.queryByText("Modifiche non salvate")).toBeNull();
    expect(getFacDraft("company-a", id)).toBeUndefined();
    const reload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(reload);
    expect(reload.defaultPrevented).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "← Moduli Facciate" }));
    expect(screen.getByLabelText("Route")).not.toHaveTextContent("modello=");
    fireEvent.click(screen.getByRole("link", { name: "Sidebar serramenti" }));
    expect(screen.getByLabelText("Route")).toHaveTextContent("area=serramenti");
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(loadLocalFacTemplate("company-a", id)).not.toBeNull());
    expect(screen.getByRole("button", { name: "Salva modello" })).toBeDisabled();
  });
  it("clears dirty when a new edit is undone without pretending the module was saved", () => {
    mount();
    const title = screen.getByRole("textbox", { name: "Titolo copertina" });
    fireEvent.change(title, { target: { value: "Bozza" } });
    expect(screen.getByText("Modifiche non salvate")).toBeVisible();
    fireEvent.change(title, { target: { value: make().cover_title } });
    expect(screen.getByText("Nuovo modulo non ancora salvato")).toBeVisible();
    expect(getFacDraft("company-a", "cappotto")).toBeUndefined();
    expect(screen.getByRole("button", { name: "Salva modello" })).toBeEnabled();
  });
  it("updates old missing photos only by explicit action, keeping local copy dirty until saved", async () => {
    const t = make(), defaults = t.pdf_blocchi.modulo_defaults as Record<string, unknown>;
    const previous = t.pdf_blocchi.protezione as Record<string, unknown>;
    t.pdf_blocchi.protezione = { ...previous, titolo: "Testo da conservare", foto: [], senzaFoto: true };
    defaults.protezione = { ...previous, foto: [], senzaFoto: true };
    saveLocalFacTemplate("company-a", "cappotto", t, null); mount();
    expect(screen.getByRole("button", { name: "Salva modello" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Completa le foto Facciate" }));
    expect(screen.getByRole("button", { name: "Salva modello" })).toBeEnabled();
    expect((loadLocalFacTemplate("company-a", "cappotto")?.template.pdf_blocchi.protezione as { foto: string[] }).foto).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(loadLocalFacTemplate("company-a", "cappotto")?.template.pdf_blocchi.protezione).toMatchObject({ titolo: "Testo da conservare", senzaFoto: false }));
  });
  it("recovers interrupted drafts without adopting a newer tab's revision", async () => {
    const first = saveLocalFacTemplate("company-a", "cappotto", make(), null);
    const mounted = mount();
    fireEvent.change(screen.getByRole("textbox", { name: "Titolo copertina" }), { target: { value: "Bozza da recuperare" } });
    mounted.unmount();
    const concurrent = make(); concurrent.cover_title = "Altra scheda";
    saveLocalFacTemplate("company-a", "cappotto", concurrent, first.savedAt);
    mount();
    expect(screen.getByRole("textbox", { name: "Titolo copertina" })).toHaveValue("Bozza da recuperare");
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("altra scheda"));
    expect(loadLocalFacTemplate("company-a", "cappotto")?.template.cover_title).toBe("Altra scheda");
  });
  it.each(FULL_FAC_MODULES)("opens, edits, saves and reloads %s locally", async id => {
    const first = mount(id);
    const title = screen.getByRole("textbox", { name: "Titolo copertina" });
    expect(title.tagName).toBe("TEXTAREA"); expect(title).toHaveValue(make(id).cover_title);
    fireEvent.change(title, { target: { value: `Titolo ${id}\nSeconda riga` } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Salva modello" })).toBeDisabled());
    expect(loadLocalFacTemplate("company-a", id)?.template.cover_title).toBe(`Titolo ${id}\nSeconda riga`);
    first.unmount(); mount(id); expect(screen.getByRole("textbox", { name: "Titolo copertina" })).toHaveValue(`Titolo ${id}\nSeconda riga`);
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("uses the real section editor and order component, preserving per-page edits", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Come funziona" }));
    const titles = screen.getAllByRole("textbox");
    expect(titles.some(input => (input as HTMLInputElement).value === "La specifica dell'intervento")).toBe(true);
    const title = titles.find(input => (input as HTMLInputElement).value === "La specifica dell'intervento")!;
    fireEvent.change(title, { target: { value: "Specifica modificata" } });
    fireEvent.click(screen.getByRole("button", { name: "Ordine e pagine" }));
    expect(screen.getByRole("button", { name: "Aggiungi una pagina vostra" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Nascondi Come funziona" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(loadLocalFacTemplate("company-a", "cappotto")).not.toBeNull());
    const saved = loadLocalFacTemplate("company-a", "cappotto")!.template;
    expect(saved.pdf_ordine_capitoli?.find(p => p.chiave === "comeFunziona")?.visibile).toBe(false);
    expect((saved.pdf_blocchi.comeFunziona as { titolo: string }).titolo).toBe("Specifica modificata");
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("edits all eight FAQ answers in native page controls", async () => {
    mount("interno"); fireEvent.click(screen.getByRole("button", { name: "Domande e risposte" }));
    expect(screen.getAllByRole("textbox", { name: /^Domanda \d/ })).toHaveLength(8);
    fireEvent.change(screen.getByRole("textbox", { name: "Risposta 8" }), { target: { value: "Risposta personalizzata" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(loadLocalFacTemplate("company-a", "interno")?.template.faq[7].risposta).toBe("Risposta personalizzata"));
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("uploads and removes cover images in both native aliases without online calls", async () => {
    calls.image.mockResolvedValue("data:image/png;base64,AAAA"); mount();
    const file = new File(["local"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Carica immagine copertina"), { target: { files: [file] } });
    await waitFor(() => expect(calls.image).toHaveBeenCalledWith(file));
    await waitFor(() => expect(screen.getByAltText("Immagine copertina")).toHaveAttribute("src", "data:image/png;base64,AAAA"));
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi immagine copertina" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(loadLocalFacTemplate("company-a", "cappotto")?.template.pdf_cover_image_url).toBeNull());
    expect(loadLocalFacTemplate("company-a", "cappotto")?.template.cover_image_url).toBeNull(); expect(calls.remote).not.toHaveBeenCalled();
  });
  it("retains dirty work after revision conflict or quota failure", async () => {
    mount(); saveLocalFacTemplate("company-a", "cappotto", make(), null);
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("altra scheda"));
    expect(screen.getByRole("button", { name: "Salva modello" })).toBeEnabled();
    cleanup(); mount("balconi", () => { throw new Error("Quota esaurita"); });
    fireEvent.change(screen.getByRole("textbox", { name: "Titolo copertina" }), { target: { value: "Bozza con quota esaurita" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Quota esaurita"));
    expect(screen.getByText("Modifiche non salvate")).toBeVisible();
  });
  it("guards routes and reload, allowing section changes without losing edits", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false); mount();
    fireEvent.change(screen.getByRole("textbox", { name: "Titolo copertina" }), { target: { value: "Bozza da proteggere" } });
    const reload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(reload); expect(reload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Come lavoriamo" }));
    expect(confirm).not.toHaveBeenCalled(); expect(screen.getByLabelText("Route")).toHaveTextContent("section=page_percorso");
    fireEvent.click(screen.getByRole("button", { name: "Vai ai bagni" })); expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Route")).toHaveTextContent("area=facciate");
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Salva modello" })).toBeDisabled());
    const cleanReload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(cleanReload); expect(cleanReload.defaultPrevented).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Vai ai bagni" })); expect(screen.getByLabelText("Route")).toHaveTextContent("area=bagni");
  });
  it("applies only the chosen intervention-copy section", async () => {
    mount("riparazioni");
    fireEvent.change(screen.getByRole("textbox", { name: "Titolo copertina" }), { target: { value: "Mio titolo" } });
    fireEvent.click(screen.getByRole("button", { name: "Testi per questo modulo" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Sezione e variante" }), { target: { value: "sottotitolo-breve" } });
    fireEvent.click(screen.getByRole("button", { name: "Applica a sottotitolo" }));
    expect(screen.getByRole("textbox", { name: "Titolo copertina" })).toHaveValue("Mio titolo");
    expect(screen.getByRole("textbox", { name: "Sottotitolo copertina" })).toHaveValue("Zone, difetti e raccordi. Un intervento circoscritto e misurabile.");
    expect(loadLocalFacTemplate("company-a", "riparazioni")).toBeNull();
  });
  it("guards the panel's external back button and a sidebar link, then allows explicit discard", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false); mount();
    fireEvent.change(screen.getByRole("textbox", { name: "Titolo copertina" }), { target: { value: "Non perdere questa modifica" } });
    fireEvent.click(screen.getByRole("button", { name: "← Moduli Facciate" }));
    expect(screen.getByLabelText("Route")).toHaveTextContent("modello=cappotto");
    fireEvent.click(screen.getByRole("link", { name: "Sidebar serramenti" }));
    expect(screen.getByLabelText("Route")).toHaveTextContent("area=facciate");
    expect(screen.getByRole("textbox", { name: "Titolo copertina" })).toHaveValue("Non perdere questa modifica");
    expect(confirm).toHaveBeenCalledTimes(2);
    confirm.mockReturnValue(true); fireEvent.click(screen.getByRole("button", { name: "← Moduli Facciate" }));
    expect(screen.getByLabelText("Route")).not.toHaveTextContent("modello=");
  });
  it("rejects foreign branding before creating a workspace", () => {
    render(<MemoryRouter><FacciateModuleTemplatePanel companyId="company-b" moduleId="cappotto" branding={{ company_id: "company-a", ragione_sociale: "Altra azienda" }} /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("altra azienda"); expect(screen.queryByRole("textbox")).toBeNull();
  });
});
