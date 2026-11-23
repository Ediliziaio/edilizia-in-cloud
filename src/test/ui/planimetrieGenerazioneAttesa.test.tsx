import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { nuovaPlanimetria } from "../../../shared/planimetrie/modello";
import { PianiDaDwg } from "@/components/planimetrie/PianiDaDwg";

const api = vi.hoisted(() => ({ prepara: vi.fn(), tavolePdf: vi.fn(), editor: vi.fn(), invoke: vi.fn(), pdf: vi.fn(), normalizza: vi.fn(), anteprima: vi.fn(), dimensioni: vi.fn(), leggiDwg: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-test" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: api.invoke } } }));
vi.mock("@/components/planimetrie/editor/generazione", async (original) => ({ ...await original<typeof import("@/components/planimetrie/editor/generazione")>(), preparaImmagine: api.prepara, preparaTavolePdf: api.tavolePdf, paginaPdf: api.pdf, anteprimaFoglio: api.anteprima, misureImmagine: api.dimensioni, inBase64: vi.fn(async () => "base64") }));
vi.mock("@/lib/planimetrie/documentoImmagine", async (original) => ({ ...await original<typeof import("@/lib/planimetrie/documentoImmagine")>(), normalizzaDocumento: api.normalizza }));
vi.mock("@/lib/planimetrie/dwgLocale", async (original) => ({ ...await original<typeof import("@/lib/planimetrie/dwgLocale")>(), leggiTavolaDwg: api.leggiDwg }));
vi.mock("@/components/planimetrie/editor/EditorConSalvataggio", () => ({ EditorConSalvataggio: (props: { origine: string; sopra?: React.ReactNode; iniziale?: { titolo?: string } }) => {
  api.editor(props);
  const { origine, sopra, iniziale } = props;
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
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function monta(file = new File(["foto"], "pianta.png", { type: "image/png" })) {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/azienda/planimetrie/nuova?da=documento"]}><RenderPlanimetriaNuova /></MemoryRouter></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("PDF o foto della pianta"), { target: { files: [file] } });
  const bottone = screen.getByRole("button", { name: "Ricava la pianta" }) as HTMLButtonElement;
  await waitFor(() => expect(bottone).toBeEnabled());
  return bottone;
}
describe("preparazione del documento", () => {
  it("blocca la ricostruzione DWG con unità discordanti e registra due quote indipendenti", () => {
    const ricostruisci = vi.fn();
    const ritaglio = { x: 5, y: 5, width: 90, height: 90 };
    const larghezza = { id: "A1", testo: "18.18", lunghezza: 18.18, angolo: 0, punto: [12, 3] as [number, number] };
    const profondita = { id: "A2", testo: "14.09", lunghezza: 14.09, angolo: 90, punto: [3, 9] as [number, number] };
    render(<PianiDaDwg riferimento={{ unita: 4, rettangolo: [0, 0, 25, 22], quote: [larghezza, profondita] }}
      ritaglio={ritaglio} occupato={false} onAggiunto={() => {}} onRicostruisci={ricostruisci} />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi ritaglio come piano" }));
    const azione = screen.getByRole("button", { name: "Ricava pianta e 3D" });
    const quota1 = screen.getByRole("textbox", { name: "Quota 1 in m" });
    const quota2 = screen.getByRole("textbox", { name: "Quota 2 in m" });
    fireEvent.change(quota1, { target: { value: "18,18" } });
    fireEvent.change(quota2, { target: { value: "14,09" } });
    expect(azione).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Unità compatibile con le quote inserite · Metri");
    fireEvent.click(screen.getByRole("button", { name: "Usa metri" }));
    expect(screen.getByText("Scala coerente su due quote")).toBeInTheDocument();
    fireEvent.click(azione);
    expect(ricostruisci).toHaveBeenCalledWith(expect.objectContaining({ unita: 6 }), [ritaglio], [
      { quota: larghezza, metri: 18.18 }, { quota: profondita, metri: 14.09 },
    ]);

    fireEvent.change(quota2, { target: { value: "1,409" } });
    expect(azione).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Le quote indicano scale diverse");
  });

  it("riunisce le quattro origini nella stessa pagina e conserva il contesto della commessa", () => {
    const commessa="11111111-1111-4111-8111-111111111111";
    const query=new URLSearchParams({commessa,titolo:"Appartamento A",torna:`/azienda/ordini/${commessa}`});
    render(<MemoryRouter initialEntries={[`/azienda/planimetrie/nuova?${query}`]}><RenderPlanimetriaNuova/></MemoryRouter>);
    const origini=screen.getByRole("navigation",{name:"Origine della planimetria"});
    expect(screen.getByRole("heading",{name:"Nuova planimetria"})).toBeInTheDocument();
    expect(within(origini).getAllByRole("link")).toHaveLength(4);
    const link=within(origini).getByRole("link",{name:/Importa tavola/});
    const destinazione=new URL(link.getAttribute("href")!,"https://example.test");
    expect(Object.fromEntries(destinazione.searchParams)).toMatchObject({commessa,titolo:"Appartamento A",da:"documento"});
    fireEvent.click(link);
    expect(screen.getByRole("heading",{name:"Nuova planimetria"})).toBeInTheDocument();
    expect(screen.getByLabelText("PDF o foto della pianta")).toBeInTheDocument();
  });

  it("mostra la tavola del DWG e la apre come base da ricalcare senza invocare l’AI", async () => {
    vi.stubEnv("VITE_PLANIMETRIE_DWG_LOCALE", "1");
    const dwg = new File(["AC1027"], "Pianta piano terra.DWG");
    const png = new File(["png"], "Pianta piano terra.png", { type: "image/png" });
    api.leggiDwg.mockResolvedValue({ file: png, riferimento: null });
    api.prepara.mockResolvedValue({ file: png, mime: png.type, larghezza: 1800, altezza: 900 });
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/azienda/planimetrie/nuova?da=documento"]}><RenderPlanimetriaNuova /></MemoryRouter></QueryClientProvider>);

    fireEvent.change(screen.getByLabelText("DWG, PDF o foto della pianta"), { target: { files: [dwg] } });
    await screen.findByRole("img", { name: "Anteprima del foglio" });
    expect(api.leggiDwg).toHaveBeenCalledWith(dwg, expect.any(AbortSignal));
    expect(api.anteprima.mock.lastCall?.[0]).toBe(png);
    fireEvent.click(screen.getByRole("button", {name:"Ricalca nell’editor"}));
    expect(await screen.findByText("Origine: importazione")).toBeInTheDocument();
    expect(api.invoke).not.toHaveBeenCalled();
  });

  it.each([["pianta.pdf","application/pdf"],["pianta.png","image/png"]])("apre %s come tavola da ricalcare senza invocare l’AI", async (nome,mime) => {
    const png=new Blob(["png"],{type:"image/png"});
    api.pdf.mockResolvedValue({canvas:{},pagine:1});
    api.prepara.mockResolvedValue({file:png,mime:png.type,larghezza:1800,altezza:900});
    await monta(new File(["foglio"],nome,{type:mime}));
    fireEvent.click(screen.getByRole("button",{name:"Ricalca nell’editor"}));
    expect(await screen.findByText("Origine: importazione")).toBeInTheDocument();
    expect(api.invoke).not.toHaveBeenCalled();
  });

  it("apre per il ritaglio la pagina PDF selezionata", async () => {
    const png=new Blob(["png"],{type:"image/png"});
    const canvas={};
    api.anteprima.mockResolvedValue({file:png,pagine:2});
    api.pdf.mockResolvedValue({canvas,pagine:2});
    api.prepara.mockResolvedValue({file:png,mime:png.type,larghezza:1000,altezza:700});
    const pdf=new File(["pdf"],"tavole.pdf",{type:"application/pdf"});
    await monta(pdf);
    fireEvent.click(screen.getByRole("button",{name:"Pagina successiva"}));
    expect(await screen.findByText("Pagina 2 di 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Ritaglia foglio"}));
    expect(await screen.findByRole("dialog",{name:"Ritaglia il foglio da leggere"})).toBeInTheDocument();
    expect(api.pdf).toHaveBeenCalledWith(pdf,2);
    expect(api.prepara).toHaveBeenCalledWith(pdf,0,canvas,null,{squadra:false});
  });

  it("apre solo le pagine PDF assegnate, con la loro rotazione, quota e tavola", async () => {
    const png = new Blob(["png"], {type: "image/png"});
    const pdf = new File(["pdf"], "Casa.pdf", {type: "application/pdf"});
    api.anteprima.mockResolvedValue({file: png, pagine: 3});
    api.tavolePdf.mockResolvedValue([
      {file: png, mime: png.type, larghezza: 1000, altezza: 700},
      {file: png, mime: png.type, larghezza: 800, altezza: 800},
    ]);
    await monta(pdf);
    fireEvent.click(screen.getByRole("button", {name: "Ruota a destra"}));
    const prima = screen.getByRole("button", {name: "Aggiungi pagina 1"});
    await waitFor(() => expect(prima).toBeEnabled());
    fireEvent.click(prima);
    fireEvent.change(screen.getByRole("textbox", {name: "Nome del piano, pagina 1"}), {target: {value: "Seminterrato"}});
    fireEvent.change(screen.getByRole("textbox", {name: "Quota in metri, pagina 1"}), {target: {value: "-1,20"}});

    fireEvent.click(screen.getByRole("button", {name: "Pagina successiva"}));
    await screen.findByText("Pagina 2 di 3");
    fireEvent.click(screen.getByRole("button", {name: "Pagina successiva"}));
    const terza = await screen.findByRole("button", {name: "Aggiungi pagina 3"});
    await waitFor(() => expect(terza).toBeEnabled());
    fireEvent.click(terza);
    fireEvent.change(screen.getByRole("textbox", {name: "Nome del piano, pagina 3"}), {target: {value: "Piano terra"}});
    const quotaTerza = screen.getByRole("textbox", {name: "Quota in metri, pagina 3"});
    fireEvent.change(quotaTerza, {target: {value: "-1.20"}});
    const apri = screen.getByRole("button", {name: "Apri 2 piani nell’editor"});
    expect(apri).toBeDisabled();
    fireEvent.change(quotaTerza, {target: {value: "0"}});
    fireEvent.click(apri);

    expect(await screen.findByText("Origine: importazione")).toBeInTheDocument();
    expect(api.tavolePdf).toHaveBeenCalledWith(pdf, [
      {pagina: 1, rotazione: 90, ritaglio: null},
      {pagina: 3, rotazione: 0, ritaglio: null},
    ], expect.any(AbortSignal));
    const { iniziale, tavoleDaRicalcare } = api.editor.mock.lastCall![0];
    expect(iniziale.livelli).toMatchObject([
      {nome: "Seminterrato", quota: -120, ricalco: {calibrata: false, proporzione: 0.7}},
      {nome: "Piano terra", quota: 0, ricalco: {calibrata: false, proporzione: 1}},
    ]);
    expect(iniziale.livelli.map((piano: {ricalco: {percorso: string}}) => tavoleDaRicalcare[piano.ricalco.percorso].name)).toEqual([
      "Casa - pagina 1.png", "Casa - pagina 3.png",
    ]);
    expect(api.invoke).not.toHaveBeenCalled();
  });

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
    expect(api.anteprima).toHaveBeenCalledWith(jpeg, 1, 0, null, { squadra: false });
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
    const risposta = (titolo: string) => ({ data: { success: true, planimetria: { ...nuovaPlanimetria(), titolo }, origine_versione: "ai_foto", generazione: { ingresso: "documento", scala: null as number | null, avvisi: [] as string[], superfici_scritte: {}, sorgente_path: null as string | null, sfondo_dxf: null as Record<string, unknown> | null } }, error: null as null });
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
