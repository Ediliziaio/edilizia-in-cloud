import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { nuovaPlanimetria } from "../../../shared/planimetrie/modello";

const api = vi.hoisted(() => ({ prepara: vi.fn(), invoke: vi.fn(), pdf: vi.fn(), normalizza: vi.fn(), anteprima: vi.fn(), dimensioni: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-test" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: api.invoke } } }));
vi.mock("@/components/planimetrie/editor/generazione", async (original) => ({ ...await original<typeof import("@/components/planimetrie/editor/generazione")>(), preparaImmagine: api.prepara, paginaPdf: api.pdf, anteprimaFoglio: api.anteprima, misureImmagine: api.dimensioni, inBase64: vi.fn(async () => "base64") }));
vi.mock("@/lib/planimetrie/documentoImmagine", async (original) => ({ ...await original<typeof import("@/lib/planimetrie/documentoImmagine")>(), normalizzaDocumento: api.normalizza }));
vi.mock("@/components/planimetrie/editor/EditorConSalvataggio", () => ({ EditorConSalvataggio: ({ origine, sopra, iniziale }: { origine: string; sopra?: React.ReactNode; iniziale?: { titolo?: string } }) => {
  const [nome] = useState(iniziale?.titolo);
  return <>{sopra}<p>Origine: {origine}</p><p>Lettura editor: {nome}</p></>;
} }));
import RenderPlanimetriaNuova from "@/pages/azienda/RenderPlanimetriaNuova";

beforeEach(() => {
  vi.clearAllMocks();
  const BaseURL = URL;
  class URLConBlob extends BaseURL {}
  Object.assign(URLConBlob, { createObjectURL: (): string => "blob:test-pianta", revokeObjectURL: (): void => {} });
  vi.stubGlobal("URL", URLConBlob);
  api.invoke.mockResolvedValue({ data: { success: false, codice: "non_leggibile" }, error: null as Error | null });
  api.normalizza.mockImplementation(async (file: File) => file);
  api.anteprima.mockResolvedValue({ file: new Blob(["jpeg"], { type: "image/jpeg" }), pagine: 1 });
  api.dimensioni.mockResolvedValue({ larghezza: 1200, altezza: 1200 });
});
afterEach(() => vi.unstubAllGlobals());
async function monta(file = new File(["foto"], "pianta.png", { type: "image/png" })) {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/azienda/planimetrie/nuova?da=documento"]}><RenderPlanimetriaNuova /></MemoryRouter></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("PDF o foto della pianta"), { target: { files: [file] } });
  const bottone = screen.getByRole("button", { name: "Ricava la pianta" }) as HTMLButtonElement;
  await waitFor(() => expect(bottone).toBeEnabled());
  return bottone;
}
describe("preparazione del documento", () => {
  it.each([["application/pdf", "ai_pdf"], ["image/png", "ai_foto"]])("conserva l'origine %s anche se il trasporto al motore e' PNG", async (mime, origine) => {
    api.pdf.mockResolvedValue({ canvas: { toDataURL: () => "data:image/png;base64,AAAA" }, pagine: 1 });
    api.prepara.mockResolvedValue({ file: new Blob(["png"], { type: "image/png" }), mime: "image/png", larghezza: 1000, altezza: 1000 });
    api.invoke.mockResolvedValue({ data: { success: true, planimetria: nuovaPlanimetria(), origine_versione: "ai_foto", generazione: { ingresso: "documento", scala: { metodo: "quota_letta", cm_per_unita: 1, da_confermare: false }, avvisi: [], superfici_scritte: {}, sorgente_path: null, sfondo_dxf: null } }, error: null });
    fireEvent.click(await monta(new File(["foglio"], "pianta", { type: mime })));
    expect(await screen.findByText(`Origine: ${origine}`)).toBeInTheDocument();
  });

  it("blocca un secondo invio già mentre prepara l'immagine", async () => {
    let prosegui!: () => void;
    api.prepara.mockReturnValue(new Promise<unknown>((resolve) => { prosegui = () => resolve({ file: new File(["foto"], "pronta.png", { type: "image/png" }), mime: "image/png", larghezza: 800, altezza: 600 }); }));
    const bottone = await monta();
    fireEvent.click(bottone);
    expect(bottone.disabled).toBe(true);
    fireEvent.click(bottone);
    expect(api.prepara).toHaveBeenCalledOnce();
    await act(async () => prosegui());
    await waitFor(() => expect(api.invoke).toHaveBeenCalledOnce());
    await waitFor(() => expect(bottone.disabled).toBe(false));
  });
  it("mostra un errore leggibile e permette di riprovare se la preparazione fallisce", async () => {
    api.prepara.mockRejectedValue(new Error("Errore del decoder"));
    const bottone = await monta();
    fireEvent.click(bottone);
    expect((await screen.findByRole("alert")).textContent).toContain("Non riesco a preparare il documento");
    expect(bottone.disabled).toBe(false);
    expect(api.invoke).not.toHaveBeenCalled();
  });
  it("converte l'HEIC prima dell'anteprima e invia al motore solo l'immagine preparata", async () => {
    const jpeg = new File(["jpeg"], "bagno.jpg", { type: "image/jpeg" });
    api.normalizza.mockResolvedValue(jpeg);
    api.prepara.mockResolvedValue({ file: new Blob(["png"], { type: "image/png" }), mime: "image/png", larghezza: 1200, altezza: 1200 });
    fireEvent.click(await monta(new File(["heic"], "bagno.HEIC", { type: "image/heic" })));
    await waitFor(() => expect(api.invoke).toHaveBeenCalledWith("planimetria-genera", { body: expect.objectContaining({ mime: "image/png", larghezza: 1200 }) }));
    expect(api.anteprima).toHaveBeenCalledWith(jpeg, 1, 0, null);
    expect(api.prepara).toHaveBeenCalledWith(jpeg, 0, undefined, null);
  });
  it("un HEIC non decodificabile non avvia l'AI e non consuma un credito", async () => {
    api.normalizza.mockRejectedValue(new Error("HEIC non leggibile"));
    render(<MemoryRouter initialEntries={["/?da=documento"]}><RenderPlanimetriaNuova /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("PDF o foto della pianta"), { target: { files: [new File(["x"], "bagno.heic", { type: "image/heic" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("HEIC non leggibile");
    expect(screen.getByRole("button", { name: "Ricava la pianta" })).toBeDisabled();
    expect(api.invoke).not.toHaveBeenCalled();
  });
  it("rilegge lo stesso documento con le indicazioni dell'utente e apre la nuova bozza nell'editor", async () => {
    const risposta = (titolo: string) => ({ data: { success: true, planimetria: { ...nuovaPlanimetria(), titolo }, origine_versione: "ai_foto", generazione: { ingresso: "documento", scala: null, avvisi: [], superfici_scritte: {}, sorgente_path: null, sfondo_dxf: null } }, error: null });
    api.prepara.mockResolvedValue({ file: new Blob(["png"], { type: "image/png" }), mime: "image/png", larghezza: 1200, altezza: 1200 });
    api.invoke.mockResolvedValueOnce(risposta("Prima lettura")).mockResolvedValueOnce(risposta("Seconda lettura"));
    fireEvent.click(await monta());
    await screen.findByText("Lettura editor: Prima lettura");
    fireEvent.change(screen.getByLabelText("Indicazioni per la rilettura"), { target: { value: "Conserva entrambe le profondità da verificare." } });
    fireEvent.click(screen.getByRole("button", { name: "Rileggi il documento · 1 credito" }));
    await screen.findByText("Lettura editor: Seconda lettura");
    expect(api.normalizza).toHaveBeenCalledOnce();
    expect(api.invoke).toHaveBeenCalledTimes(2);
    expect(api.invoke.mock.calls[1][1].body).toMatchObject({ file_base64: "base64", mime: "image/png", larghezza: 1200, ingresso: "documento" });
    expect(api.invoke.mock.calls[1][1].body.nota).toContain("Conserva entrambe le profondità");
    expect(screen.queryByText("Lettura editor: Prima lettura")).not.toBeInTheDocument();
  });
});
