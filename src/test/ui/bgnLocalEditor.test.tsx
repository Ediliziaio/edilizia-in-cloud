import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BagniTemplateEditor } from "@/components/bagni/BagniTemplateEditor";
import { createFullBgnTemplate, type FullBgnModuleId } from "@/lib/moduli-vendita/fullBgnModules";
import type { BgnTemplatePdf } from "@/types/bagni";

const calls = vi.hoisted(() => ({ remote: vi.fn(), preview: vi.fn(), success: vi.fn(), error: vi.fn(), profile: {}, storage: vi.fn(), image: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: calls.storage } } }));
vi.mock("@/lib/moduli-vendita/localTemplateImage", () => ({ readLocalTemplateImage: calls.image }));
vi.mock("@/hooks/useBagniProgetto", () => ({
  useEffectiveCompanyId: () => "company-a", useBgnTemplatePdf: () => ({ data: null as null, isLoading: false }),
  useUpsertBgnTemplatePdf: () => ({ mutateAsync: calls.remote, isPending: false }),
  useBgnBackendReady: () => ({ data: true }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: null as null }) }));
vi.mock("@/hooks/useCompanySalesProfile", () => ({ useCompanySalesProfile: () => ({ profile: calls.profile, save: vi.fn() }), EMPTY_SALES_PROFILE: {} }));
vi.mock("@/hooks/useBagniPDF", () => ({ useBagniPDF: () => ({ previewPDF: calls.preview, isGenerating: false }) }));
vi.mock("@/components/bagni/BagniLivePreviewPanel", () => ({ BagniLivePreviewPanel: () : null => null }));
vi.mock("@/components/bagni/BagniTemplatePreviewDialog", () => ({ BagniTemplatePreviewDialog: () : null => null }));
vi.mock("@/components/preventivi/StandardTextTemplatePicker", () => ({ StandardTextTemplatePicker: () : null => null }));
vi.mock("@/components/preventivi/CopertinaAnteprima", () => ({ CopertinaAnteprima: () : null => null }));
vi.mock("@/components/preventivi/AiSalesProfileForm", () => ({ AiSalesProfileForm: () : null => null }));
vi.mock("@/components/preventivi/AiTemplateReviewDialog", () => ({ AiTemplateReviewDialog: () : null => null }));
vi.mock("sonner", () => ({ toast: { success: calls.success, error: calls.error } }));

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const template = (id: FullBgnModuleId = "completo") => createFullBgnTemplate({ id: "online", company_id: "company-a", default_iva_pct: 22, font_family: "helvetica" } as BgnTemplatePdf, id);
function mount(save: (t: BgnTemplatePdf) => void, id: FullBgnModuleId = "completo") {
  return render(<MemoryRouter initialEntries={["/?section=page_cover"]}><BagniTemplateEditor embedded localModule={{ id, template: template(id), saved: false, save, onDirtyChange: vi.fn() }} /></MemoryRouter>);
}
describe("editor Bagni: confine locale/online", () => {
  it("usa Rinnovo estetico con finiture e copia locale indipendente", async () => {
    const save = vi.fn(); mount(save, "rinnovo");
    expect(screen.getByRole("textbox", { name: "Titolo copertina" })).toHaveValue("Il tuo bagno, un nuovo tono.\nSenza cambiare tutto.");
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    const preview = calls.preview.mock.calls[0][0];
    expect(preview.progetto.tipo_intervento).toBe("Rinnovo estetico");
    expect(preview.progetto.totale).toBe(1529.88); expect(preview.computo).toHaveLength(7);
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].id).toBe("local-bagni-rinnovo");
    expect(save.mock.calls[0][0].pdf_cover_image_url).toContain("bagni-rinnovo-cover");
    expect(calls.remote).not.toHaveBeenCalled(); expect(calls.storage).not.toHaveBeenCalled();
  });
  it("usa il modulo accessibilità senza marcarlo conforme né scrivere online", async () => {
    const save = vi.fn(); mount(save, "accessibilita");
    expect(screen.getByRole("textbox", { name: "Titolo copertina" })).toHaveValue("Il bagno, vicino a te.\nSpazio ai tuoi gesti.");
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    const preview = calls.preview.mock.calls[0][0];
    expect(preview.progetto.tipo_intervento).toBe("Bagno accessibile");
    expect(preview.progetto.totale).toBe(4611.6);
    expect(preview.progetto.accessibile).toBe(false);
    expect(preview.computo).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].id).toBe("local-bagni-accessibilita");
    expect(save.mock.calls[0][0].pdf_cover_image_url).toContain("bagni-accessibilita-cover");
    expect(calls.remote).not.toHaveBeenCalled(); expect(calls.storage).not.toHaveBeenCalled();
  });
  it("usa il computo Sanitari senza scritture online", async () => {
    const save = vi.fn(); mount(save, "sanitari");
    expect(screen.getByRole("textbox", { name: "Titolo copertina" })).toHaveValue("Nuovi gesti quotidiani.\nScelte che si fanno notare.");
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    const preview = calls.preview.mock.calls[0][0];
    expect(preview.progetto.tipo_intervento).toBe("Sanitari e rubinetteria");
    expect(preview.progetto.totale).toBe(2196);
    expect(preview.computo).toHaveLength(7);
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].id).toBe("local-bagni-sanitari");
    expect(save.mock.calls[0][0].pdf_cover_image_url).toContain("bagni-sanitari-cover");
    expect(calls.remote).not.toHaveBeenCalled(); expect(calls.storage).not.toHaveBeenCalled();
  });
  it("mantiene Rifacimento zona doccia nell'editor e nell'anteprima originali", async () => {
    const save = vi.fn(); mount(save, "doccia");
    expect(screen.getByRole("textbox", { name: "Titolo copertina" })).toHaveValue("La tua doccia, rinnovata.\nOgni dettaglio conta.");
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    const preview = calls.preview.mock.calls[0][0];
    expect(preview.progetto.tipo_intervento).toBe("Rifacimento zona doccia");
    expect(preview.progetto.totale).toBe(4392);
    expect(preview.progetto.immobile_superficie_mq).toBeNull();
    expect(preview.computo.every((r: { descrizione: string }) => r.descrizione.startsWith("Zona doccia:"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].id).toBe("local-bagni-doccia");
    expect(save.mock.calls[0][0].pdf_cover_image_url).toContain("bagni-doccia-cover");
    expect(calls.remote).not.toHaveBeenCalled(); expect(calls.storage).not.toHaveBeenCalled();
  });
  it("usa copertina, computo e salvataggio propri per Da vasca a doccia", async () => {
    const save = vi.fn(); mount(save, "vasca-doccia");
    expect(screen.getByRole("textbox", { name: "Titolo copertina" })).toHaveValue("Dalla vasca alla doccia.\nPiù spazio al quotidiano.");
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    const preview = calls.preview.mock.calls[0][0];
    expect(preview.progetto.tipo_intervento).toBe("Da vasca a doccia");
    expect(preview.progetto.totale).toBe(4233.4);
    expect(preview.progetto.immobile_superficie_mq).toBeNull();
    expect(preview.computo.every((r: { descrizione: string }) => r.descrizione.startsWith("Zona vasca:"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].id).toBe("local-bagni-vasca-doccia");
    expect(save.mock.calls[0][0].pdf_cover_image_url).toContain("bagni-vasca-doccia-cover");
    expect(calls.remote).not.toHaveBeenCalled(); expect(calls.storage).not.toHaveBeenCalled();
  });
  it("carica immagini nel modulo senza chiamare Storage online", async () => {
    calls.image.mockResolvedValue("data:image/png;base64,LOCAL");
    const save = vi.fn(), { container } = mount(save);
    const file = new File(["test"], "logo.png", { type: "image/png" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(calls.image).toHaveBeenCalledWith(file));
    await waitFor(() => expect(calls.success).toHaveBeenCalledWith("Immagine aggiunta in locale"));
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].cover_logo_url).toBe("data:image/png;base64,LOCAL");
    expect(calls.storage).not.toHaveBeenCalled(); expect(calls.remote).not.toHaveBeenCalled();
  });
  it("rimuove entrambi i campi immagine, senza fallback della vecchia copertina", async () => {
    const save = vi.fn(); mount(save);
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi immagine di sfondo cover (opzionale)" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].cover_title).toContain("\n");
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("salva tramite l'adapter locale senza invocare upsert Supabase", async () => {
    const save = vi.fn(); mount(save);
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].cover_title).toBe(template().cover_title);
    expect(calls.remote).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Salva modulo in locale" })).toBeDisabled();
  });
  it("mantiene la bozza sporca quando il salvataggio fallisce", () => {
    mount(() => { throw new Error("Quota esaurita"); });
    fireEvent.click(screen.getByRole("button", { name: "Salva modulo in locale" }));
    expect(calls.error).toHaveBeenCalled();
    expect(calls.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Salva modulo in locale" })).toBeEnabled();
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("apre l'anteprima dedicata, senza detrazioni automatiche", () => {
    mount(vi.fn());
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    expect(calls.preview).toHaveBeenCalledTimes(1);
    expect(calls.preview.mock.calls[0][0].progetto.tipo_intervento).toBe("Rifacimento completo del bagno");
    expect(calls.preview.mock.calls[0][0].progetto.detrazione_pct).toBe(0);
    expect(calls.preview.mock.calls[0][0].computo).toHaveLength(8);
    expect(calls.remote).not.toHaveBeenCalled();
  });
});
it("un modello appena aperto non segnala modifiche mai fatte", () => {
  mount(vi.fn());
  expect(screen.getByText("Modello pronto · non ancora salvato")).toBeInTheDocument();
  expect(screen.queryByText(/Modifiche non salvate/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Salva modulo in locale" })).toBeEnabled();
});
