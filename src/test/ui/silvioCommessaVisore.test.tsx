import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisoreFonte, type DocumentoDelVisore } from "@/components/silvio-commessa/VisoreFonte";

const pdf = vi.hoisted(() => ({ getDocument: vi.fn(), converti: vi.fn() }));
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument: pdf.getDocument }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "/worker.js" }));
vi.mock("@/lib/files/convertiHeic", () => ({ convertiHeic: pdf.converti }));
const differita = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((a) => { resolve = a; });
  return { promise, resolve };
};
const bytes = () => Promise.resolve(new Uint8Array([37, 80, 68, 70]).buffer);
const file = () => ({ type: "application/pdf", arrayBuffer: bytes }) as unknown as Blob;
const doc = (carica = async () => file()): DocumentoDelVisore => ({ titolo: "Simulazione.pdf", tipo: "pdf", pagina: 10, citazione: null, dove: "pagina 10", carica });
const pagina = { getViewport: () => ({ width: 500, height: 700, transform: [1, 0, 0, 1, 0, 0] }), getTextContent: async () => ({ items: [] }) };
let distruggi: ReturnType<typeof vi.fn>;
let getPage: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  distruggi = vi.fn(async () => {}); getPage = vi.fn(async () => pagina);
  pdf.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 10, getPage }), destroy: distruggi });
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:qa"); static revokeObjectURL = vi.fn(); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Il visore libera i documenti e mostra le foto iPhone", () => {
  it("apre la pagina citata e chiude il task/worker di pdf.js 6", async () => {
    const r = render(<VisoreFonte documento={doc()} onChiudi={() => {}} />);
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(10));
    expect(await screen.findByLabelText("Pagina 10 di 10")).toBeInTheDocument();
    r.unmount(); expect(distruggi).toHaveBeenCalledOnce();
  });
  it("non segnala una citazione mancante quando si sfogliano altre pagine", async () => {
    render(<VisoreFonte documento={{ ...doc(), citazione: "Importo letto alla pagina dieci" }} onChiudi={() => {}} />);
    await screen.findByText(/Il testo citato non si trova/);
    fireEvent.click(screen.getByRole("button", { name: "Prima" }));
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(9));
    await waitFor(() => expect(screen.queryByText(/Il testo citato non si trova/)).not.toBeInTheDocument());
  });
  it("chiudere durante il caricamento distrugge il task e ignora il PDF tardivo", async () => {
    const attesa = differita<{ numPages: number; getPage: typeof getPage }>();
    pdf.getDocument.mockReturnValue({ promise: attesa.promise, destroy: distruggi });
    const r = render(<VisoreFonte documento={doc()} onChiudi={() => {}} />);
    await waitFor(() => expect(pdf.getDocument).toHaveBeenCalledOnce()); r.unmount();
    await act(async () => attesa.resolve({ numPages: 10, getPage }));
    expect(distruggi).toHaveBeenCalledOnce(); expect(getPage).not.toHaveBeenCalled();
  });
  it("se il file arriva dopo la chiusura non crea un nuovo worker", async () => {
    const attesa = differita<Blob>();
    const r = render(<VisoreFonte documento={doc(() => attesa.promise)} onChiudi={() => {}} />);
    await act(async () => {}); r.unmount();
    await act(async () => attesa.resolve(file()));
    expect(pdf.getDocument).not.toHaveBeenCalled();
  });
  it("l'anteprima HEIC usa un JPEG senza cambiare l'originale", async () => {
    const originale = new Blob(["heic"], { type: "image/heic" });
    const jpeg = new File(["jpeg"], "prova.jpg", { type: "image/jpeg" });
    pdf.converti.mockResolvedValueOnce(jpeg);
    const r = render(<VisoreFonte documento={{ ...doc(async () => originale), titolo: "prova.heic", tipo: "immagine" }} onChiudi={() => {}} />);
    expect(await screen.findByRole("img", { name: "prova.heic" })).toHaveAttribute("src", "blob:qa");
    expect(URL.createObjectURL).toHaveBeenCalledWith(jpeg); expect(originale.type).toBe("image/heic");
    r.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:qa");
  });
});
