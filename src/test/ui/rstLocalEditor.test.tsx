import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RistrutturazioneTemplateEditor } from "@/components/ristrutturazione/RistrutturazioneTemplateEditor";
import { createFullRstTemplate, type FullRstModuleId } from "@/lib/moduli-vendita/fullRstModules";
import type { RstTemplatePdf } from "@/types/ristrutturazione";

const calls = vi.hoisted(() => ({ remote: vi.fn(), preview: vi.fn(), success: vi.fn(), error: vi.fn(), profile: {}, storage: vi.fn(), image: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: calls.storage } } }));
vi.mock("@/lib/moduli-vendita/localTemplateImage", () => ({ readLocalTemplateImage: calls.image }));
vi.mock("@/hooks/useRistrutturazioneProgetto", () => ({
  useEffectiveCompanyId: () => "company-a", useRstTemplatePdf: () => ({ data: null as null, isLoading: false }),
  useUpsertRstTemplatePdf: () => ({ mutateAsync: calls.remote, isPending: false }),
  useRstBackendReady: () => ({ data: true }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: null as null }) }));
vi.mock("@/hooks/useCompanySalesProfile", () => ({ useCompanySalesProfile: () => ({ profile: calls.profile, save: vi.fn() }), EMPTY_SALES_PROFILE: {} }));
vi.mock("@/hooks/useRistrutturazionePDF", () => ({ useRistrutturazionePDF: () => ({ previewPDF: calls.preview, isGenerating: false }) }));
vi.mock("@/components/ristrutturazione/RistrutturazioneLivePreviewPanel", () => ({ RistrutturazioneLivePreviewPanel: () : null => null }));
vi.mock("@/components/ristrutturazione/RistrutturazioneTemplatePreviewDialog", () => ({ RistrutturazioneTemplatePreviewDialog: () : null => null }));
vi.mock("@/components/preventivi/StandardTextTemplatePicker", () => ({ StandardTextTemplatePicker: () : null => null }));
vi.mock("@/components/preventivi/AiSalesProfileForm", () => ({ AiSalesProfileForm: () : null => null }));
vi.mock("@/components/preventivi/AiTemplateReviewDialog", () => ({ AiTemplateReviewDialog: () : null => null }));
vi.mock("sonner", () => ({ toast: { success: calls.success, error: calls.error } }));

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const template = (id: FullRstModuleId = "completa") => createFullRstTemplate({ id: "online", company_id: "company-a", default_iva_pct: 22, font_family: "helvetica" } as RstTemplatePdf, id);
function mount(save: (t: RstTemplatePdf) => void, id: FullRstModuleId = "completa") {
  return render(<MemoryRouter initialEntries={["/?section=page_cover"]}><RistrutturazioneTemplateEditor embedded localModule={{ id, template: template(id), saved: false, save, onDirtyChange: vi.fn() }} /></MemoryRouter>);
}
describe("editor Ristrutturazioni: confine locale/online", () => {
  it("apre l'Intervento a computo con dati e salvataggio locali propri", async () => {
    const save = vi.fn(); mount(save, "computo");
    expect(screen.getByRole("textbox", { name: "Titolo copertina" })).toHaveValue("Ogni lavorazione.\nUn prezzo leggibile.");
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    const preview = calls.preview.mock.calls[0][0];
    expect(preview.progetto.tipo_intervento).toBe("Intervento a computo");
    expect(preview.progetto.totale).toBe(3761.26);
    expect(preview.computo.every((row: { descrizione: string }) => row.descrizione.startsWith("Ambito A:"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].id).toBe("local-ristrutturazioni-computo");
    expect(calls.remote).not.toHaveBeenCalled(); expect(calls.storage).not.toHaveBeenCalled();
  });
  it("usa layout, importi e salvataggio propri della Redistribuzione", async () => {
    const save = vi.fn(); mount(save, "spazi");
    expect(screen.getByRole("textbox", { name: "Titolo copertina" })).toHaveValue("Nuovi spazi.\nLa stessa casa, ripensata.");
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    const preview = calls.preview.mock.calls[0][0];
    expect(preview.progetto.tipo_intervento).toBe("Redistribuzione degli spazi");
    expect(preview.progetto.totale).toBe(6885.68);
    expect(preview.computo.every((row: { descrizione: string }) => row.descrizione.startsWith("Nuovo layout:"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].id).toBe("local-ristrutturazioni-spazi");
    expect(calls.remote).not.toHaveBeenCalled(); expect(calls.storage).not.toHaveBeenCalled();
  });
  it("usa il computo ufficio e il salvataggio indipendente del modulo commerciale", async () => {
    const save = vi.fn(); mount(save, "commerciale");
    expect(screen.getByRole("textbox", { name: "Titolo copertina" })).toHaveValue("Spazi che lavorano.\nUn progetto per la tua attività.");
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    const preview = calls.preview.mock.calls[0][0];
    expect(preview.progetto.immobile_tipo).toBe("Ufficio");
    expect(preview.progetto.totale).toBe(12602.6);
    expect(preview.computo.every((row: { descrizione: string }) => row.descrizione.startsWith("Locale ufficio:"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].id).toBe("local-ristrutturazioni-commerciale");
    expect(calls.remote).not.toHaveBeenCalled(); expect(calls.storage).not.toHaveBeenCalled();
  });
  it("mantiene titolo, immagini, computo e salvataggio della Parziale separati dalla Completa", async () => {
    const save = vi.fn(); mount(save, "parziale");
    expect(screen.getByRole("textbox", { name: "Titolo copertina" })).toHaveValue("Cambia ciò che serve.\nConserva ciò che ami.");
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    const preview = calls.preview.mock.calls[0][0];
    expect(preview.progetto.tipo_intervento).toBe("Ristrutturazione parziale");
    expect(preview.progetto.immobile_superficie_mq).toBeNull();
    expect(preview.progetto.totale).toBe(4904.4);
    expect(preview.computo.every((row: { descrizione: string }) => row.descrizione.startsWith("Zona soggiorno:"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].id).toBe("local-ristrutturazioni-parziale");
    expect(save.mock.calls[0][0].pdf_cover_image_url).toContain("ristrutturazioni-parziale-cover");
    expect(calls.remote).not.toHaveBeenCalled(); expect(calls.storage).not.toHaveBeenCalled();
  });
  it("carica immagini nel modulo senza chiamare Storage online", async () => {
    calls.image.mockResolvedValue("data:image/png;base64,LOCAL");
    const save = vi.fn(), { container } = mount(save);
    const file = new File(["test"], "logo.png", { type: "image/png" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(calls.image).toHaveBeenCalledWith(file));
    await waitFor(() => expect(calls.success).toHaveBeenCalledWith("Immagine aggiunta"));
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].cover_logo_url).toBe("data:image/png;base64,LOCAL");
    expect(calls.storage).not.toHaveBeenCalled(); expect(calls.remote).not.toHaveBeenCalled();
  });
  it("rimuove entrambi i campi immagine, senza fallback della vecchia copertina", async () => {
    const save = vi.fn(); mount(save);
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi immagine copertina (sfondo)" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].pdf_cover_image_url).toBeNull();
    expect(save.mock.calls[0][0].cover_image_url).toBeNull();
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
    expect(save.mock.calls[0][0].cover_title).toBe(template().cover_title);
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
  it("apre l'anteprima dedicata, senza detrazioni automatiche", () => {
    mount(vi.fn());
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    expect(calls.preview).toHaveBeenCalledTimes(1);
    expect(calls.preview.mock.calls[0][0].progetto.tipo_intervento).toBe("Ristrutturazione completa");
    expect(calls.preview.mock.calls[0][0].progetto.detrazione_pct).toBe(0);
    expect(calls.preview.mock.calls[0][0].computo).toHaveLength(6);
    expect(calls.remote).not.toHaveBeenCalled();
  });
});
it("un modello appena aperto non segnala modifiche mai fatte", () => {
  mount(vi.fn());
  expect(screen.getByText("Modello pronto · non ancora salvato")).toBeInTheDocument();
  expect(screen.queryByText(/Modifiche non salvate/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Salva modello" })).toBeEnabled();
});
