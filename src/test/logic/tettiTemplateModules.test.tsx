import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import type { TetTemplatePdf } from "@/types/tetti";
import { TETTI_TEMPLATE_MODULES, createTettiModuleTemplate, buildTettiTemplatePreview } from "@/lib/moduli-vendita/tettiTemplateModules";
import { localTettiTemplateKey, loadLocalTettiTemplate, saveLocalTettiTemplate } from "@/lib/moduli-vendita/localTettiTemplates";
import { TettiModuleTemplatesPanel } from "@/components/tetti/TettiModuleTemplatesPanel";
import { buildQuoteTemplatesModuleParams, buildQuoteTemplatesTabParams } from "@/lib/settingsQuoteTemplatesRoute";
import { readLocalTemplateImage } from "@/lib/moduli-vendita/localTemplateImage";

const base = { id: "online", company_id: "company-a", logo_url: "/brand.png", color_primary: "#123456", default_iva_pct: 22, cover_title: "Online originale" } as TetTemplatePdf;
const state = vi.hoisted(() => ({ company: "company-a", canEdit: true, error: false, loading: false, remoteSave: vi.fn() }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditSettingsPricing: state.canEdit }) }));
vi.mock("@/hooks/useTettiProgetto", () => ({
  useEffectiveCompanyId: () => state.company,
  useTetTemplatePdf: () => ({ data: { ...base, company_id: state.company }, isLoading: state.loading, isError: state.error }),
  useUpsertTetTemplatePdf: () => ({ mutateAsync: state.remoteSave }),
}));
vi.mock("@/components/tetti/TettiTemplateEditor", () => ({
  TettiTemplateEditor: ({ localModule }: { localModule?: { template: TetTemplatePdf; saved: boolean; onDirtyChange: (dirty: boolean) => void; save: (template: TetTemplatePdf) => void } }) => {
    useEffect(() => { localModule?.onDirtyChange(!localModule.saved); }, [localModule?.saved, localModule?.onDirtyChange]);
    if (!localModule) return <p>Editor online esistente</p>;
    return <><p>{localModule.template.cover_subtitle}</p><button onClick={() => { localModule.save(localModule.template); localModule.onDirtyChange(false); }}>Salva copia test</button></>;
  },
}));
beforeEach(() => { localStorage.clear(); state.company = "company-a"; state.canEdit = true; state.error = false; state.loading = false; state.remoteSave.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const seed = (id: typeof TETTI_TEMPLATE_MODULES[number]["id"] = "ripasso", companyId = "company-a") => createTettiModuleTemplate({ ...base, company_id: companyId }, id);
const mount = (query = "") => render(<MemoryRouter initialEntries={["/?modulo=tetti" + query]}><TettiModuleTemplatesPanel /></MemoryRouter>);

describe("modelli PDF Tetti indipendenti", () => {
  it("crea sei modelli completi con testi, capitoli, esclusioni e FAQ diversi", () => {
    expect(TETTI_TEMPLATE_MODULES).toHaveLength(6);
    const models = TETTI_TEMPLATE_MODULES.map(m => seed(m.id));
    expect(new Set(models.map(m => m.cover_title)).size).toBe(6);
    expect(new Set(models.map(m => JSON.stringify(m.soluzione))).size).toBe(6);
    for (const model of models) {
      expect(model.logo_url).toBe(base.logo_url);
      expect(model.soluzione).toHaveLength(4);
      expect(model.faq).toHaveLength(2);
      expect(model.pdf_blocchi?.compreso).toHaveProperty("escluse");
      expect(model.default_detrazione_pct).toBe(0);
      expect(model.testimonianze).toEqual([]);
      expect(model.show_margine).toBe(false);
    }
    models[0].cover_title = "Modificato";
    expect(models[1].cover_title).toBe("Ripasso del tetto");
    expect(base.cover_title).toBe("Online originale");
    expect(seed().pdf_blocchi?.pagina_compreso).toEqual({ senzaFoto: true });
    expect(seed("rifacimento").pdf_blocchi?.pagina_compreso).toEqual({ senzaFoto: false });
  });
  it.each(TETTI_TEMPLATE_MODULES.map(m => [m.id] as const))("usa lo stesso computo pertinente nelle anteprime %s", id => {
    const template = seed(id);
    const payload = buildTettiTemplatePreview("company-a", template, id);
    expect(payload.progetto.tipo_intervento).toBe(template.cover_title);
    expect(payload.computo.map(r => r.descrizione)).toEqual(template.soluzione.map(r => r.titolo));
    expect(JSON.stringify(payload.computo)).not.toMatch(/tramezzi|porcellanato|impianto elettrico/i);
    expect(payload.progetto.totale_imponibile).toBe(payload.computo.reduce((n, r) => n + r.importo, 0));
    expect(payload.progetto.detrazione_pct).toBe(0);
  });
  it("isola i salvataggi per azienda e per modulo", () => {
    saveLocalTettiTemplate("company-a", "ripasso", seed(), null);
    saveLocalTettiTemplate("company-a", "rifacimento", seed("rifacimento"), null);
    saveLocalTettiTemplate("company-b", "ripasso", { ...seed("ripasso", "company-b"), cover_title: "Altra azienda" }, null);
    expect(loadLocalTettiTemplate("company-a", "ripasso")?.template.cover_title).toBe("Ripasso del tetto");
    expect(loadLocalTettiTemplate("company-b", "ripasso")?.template.cover_title).toBe("Altra azienda");
    expect(loadLocalTettiTemplate("company-a", "lattoneria")).toBeNull();
  });
  it("preserva i contenuti personalizzati dopo la riapertura", () => {
    const first = saveLocalTettiTemplate("company-a", "ripasso", seed(), null);
    saveLocalTettiTemplate("company-a", "ripasso", { ...first.template, cover_title: "Titolo personale" }, first.savedAt);
    expect(loadLocalTettiTemplate("company-a", "ripasso")?.template.cover_title).toBe("Titolo personale");
  });
  it("rifiuta sovrascritture da una seconda scheda", () => {
    saveLocalTettiTemplate("company-a", "ripasso", seed(), null);
    expect(() => saveLocalTettiTemplate("company-a", "ripasso", seed(), null)).toThrow("un'altra scheda");
  });
  it("non sovrascrive copie danneggiate", () => {
    const key = localTettiTemplateKey("company-a", "ripasso");
    localStorage.setItem(key, "{broken");
    expect(() => loadLocalTettiTemplate("company-a", "ripasso")).toThrow("danneggiata");
    expect(() => saveLocalTettiTemplate("company-a", "ripasso", seed(), null)).toThrow();
    expect(localStorage.getItem(key)).toBe("{broken");
  });
  it("rifiuta copie appartenenti a un'altra azienda", () => {
    const record = saveLocalTettiTemplate("company-a", "ripasso", seed(), null);
    localStorage.setItem(localTettiTemplateKey("company-b", "ripasso"), JSON.stringify(record));
    expect(() => loadLocalTettiTemplate("company-b", "ripasso")).toThrow("non è leggibile");
  });
  it("segnala quota esaurita senza dichiarare il salvataggio riuscito", () => {
    const storage = { getItem: () : null => null, setItem: () => { throw new DOMException("quota"); } };
    expect(() => saveLocalTettiTemplate("company-a", "ripasso", seed(), null, storage)).toThrow("spazio esaurito");
  });
  it("rimuove modello e sezione quando si cambia area o tab", () => {
    const p = new URLSearchParams("modulo=tetti&modello=ripasso&section=page_cover&keep=yes");
    expect(buildQuoteTemplatesModuleParams(p, "serramenti").has("modello")).toBe(false);
    expect(buildQuoteTemplatesModuleParams(p, null).has("section")).toBe(false);
    expect(buildQuoteTemplatesTabParams(p, "documenti").has("modello")).toBe(false);
    expect(buildQuoteTemplatesModuleParams(p, "serramenti").get("keep")).toBe("yes");
  });
  it("legge immagini locali senza storage remoto e rifiuta file inadatti", async () => {
    expect(await readLocalTemplateImage(new File(["fake"], "test.png", { type: "image/png" }))).toMatch(/^data:image\/png;base64,/);
    await expect(readLocalTemplateImage(new File(["x"], "file.svg", { type: "image/svg+xml" }))).rejects.toThrow("PNG");
    await expect(readLocalTemplateImage(new File([new Uint8Array(1024 * 1024 + 1)], "large.png", { type: "image/png" }))).rejects.toThrow("1 MB");
  });
});

describe("libreria moduli nelle impostazioni", () => {
  it("mostra sei modelli configurabili e non crea record all'apertura", () => {
    mount();
    expect(screen.getAllByRole("article")).toHaveLength(6);
    expect(screen.getAllByRole("button", { name: /^Configura/ })).toHaveLength(6);
    expect(localStorage.length).toBe(0);
    expect(screen.queryByText("In progettazione")).not.toBeInTheDocument();
  });
  it("apre e salva il modulo selezionato senza chiamare il salvataggio aziendale", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Configura Ripasso del tetto" }));
    expect(screen.getByText("Recuperare il manto riutilizzabile. Intervenire sui punti che ne hanno bisogno.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salva copia test" }));
    expect(loadLocalTettiTemplate("company-a", "ripasso")).not.toBeNull();
    expect(state.remoteSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tutti i moduli Tetti" }));
    expect(screen.getByText("Salvato in locale")).toBeInTheDocument();
  });
  it("protegge il ritorno all'elenco con modifiche non salvate", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount("&modello=ripasso");
    fireEvent.click(screen.getByRole("button", { name: "Tutti i moduli Tetti" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Salva copia test" })).toBeInTheDocument();
  });
  it("non tratta i pulsanti di un dialogo portale come un'uscita dall'editor", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount("&modello=ripasso");
    const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog");
    const button = document.createElement("button"); button.textContent = "Annulla dialogo"; dialog.append(button); document.body.append(dialog);
    fireEvent.pointerDown(button); fireEvent.click(button);
    expect(confirm).not.toHaveBeenCalled(); dialog.remove();
  });
  it("non monta un editor se il permesso manca", () => {
    state.canEdit = false; mount("&modello=ripasso");
    expect(screen.queryByRole("button", { name: "Salva copia test" })).not.toBeInTheDocument();
  });
  it("non ripiega sul generale per un id inesistente", () => {
    mount("&modello=ignoto");
    expect(screen.getByRole("alert")).toHaveTextContent("Modulo non riconosciuto");
    expect(screen.queryByText("Editor online esistente")).not.toBeInTheDocument();
  });
  it("non sovrascrive i dati in caso di errore di lettura aziendale", () => {
    state.error = true; mount();
    expect(screen.getByRole("alert")).toHaveTextContent("Impossibile leggere");
    expect(localStorage.length).toBe(0);
  });
});
