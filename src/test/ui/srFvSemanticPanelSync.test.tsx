import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SerramentiLivePreviewPanel } from "@/components/serramenti/SerramentiLivePreviewPanel";
import { FvLivePreviewPanel } from "@/components/fotovoltaico/FvLivePreviewPanel";

const state = vi.hoisted(() => ({ doc: null as any, scroll: vi.fn(), htmlScroll: vi.fn(), generated: vi.fn() }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/serramenti/mockPdfData", () => ({ buildMockPdfData: async () => ({}) }));
vi.mock("@/components/serramenti/SerramentoPDF", () => ({ SerramentoPDF: () : null => null }));
vi.mock("@react-pdf/renderer", () => ({ Page: "PAGE", pdf: () => ({ toBlob: async () => { state.generated(); return { arrayBuffer: async () => new ArrayBuffer(0) }; } }) }));
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve(state.doc) }) }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "local-worker" }));
vi.mock("@/hooks/useFileRiservati", () => ({ useImmaginiModelloFirmate: (f: unknown) => f, useFileRiservato: (f: unknown) => f }));
vi.mock("@/components/shared/livePreview/useFitScale", () => ({ LARGHEZZA_A4_PX: 794, useFitScale: () => ({ ref: null as null, scala: 1, percentuale: 100, adatta: vi.fn(), riduci: vi.fn(), aumenta: vi.fn() }) }));

const outline = () => [
  { title: "sr-section:cover", dest: [{ num: 70, gen: 0 }], items: [] as never[] },
  { title: "sr-section:controlli", dest: [{ num: 73, gen: 0 }], items: [] as never[] },
  { title: "sr-section:diario", dest: [{ num: 75, gen: 0 }], items: [] as never[] },
];
let width = 420;
const observers = new Set<() => void>();
beforeEach(() => {
  width = 420;
  observers.clear();
  state.doc = {
    numPages: 6, getOutline: vi.fn(async () => outline()), getDestination: vi.fn(),
    getPageIndex: vi.fn(async (ref: { num: number }) => ref.num - 70),
    getPage: vi.fn(async () => ({ getViewport: () => ({ width: 400, height: 600 }), render: () => ({ promise: Promise.resolve() }) })),
  };
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: () => void) { observers.add(callback); }
    observe() {} unobserve() {} disconnect() { observers.delete(this.callback); }
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:semantic");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as any);
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function () { return Number((this as HTMLElement).dataset.pageWrap ?? 0) * 600; });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: state.scroll });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: state.htmlScroll });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("Sr native preview uses outline identities", () => {
  it("waits for reveal and navigates to the latest selection without regeneration", async () => {
    width = 0;
    const { rerender } = render(<SerramentiLivePreviewPanel template={{}} activeSection="page_controlli" />);
    await waitFor(() => expect(state.generated).toHaveBeenCalledOnce(), { timeout: 2500 });
    expect(state.doc.getPage).not.toHaveBeenCalled();
    rerender(<SerramentiLivePreviewPanel template={{}} activeSection="page_diario" />);
    act(() => { width = 420; observers.forEach(callback => callback()); });
    await waitFor(() => expect(state.scroll).toHaveBeenLastCalledWith({ top: 3592, behavior: "smooth" }));
    expect(state.generated).toHaveBeenCalledOnce();
  });
  it("navigates to actual references after canvases render; absent chapters do not move it", async () => {
    const { rerender } = render(<SerramentiLivePreviewPanel template={{}} activeSection="page_controlli" />);
    await waitFor(() => expect(state.scroll).toHaveBeenLastCalledWith({ top: 2392, behavior: "smooth" }), { timeout: 2500 });
    expect(state.doc.getPageIndex).toHaveBeenCalledWith({ num: 73, gen: 0 });
    expect(screen.getByRole("status")).toHaveTextContent("Sezione selezionata · pagina 4 di 6");
    expect(state.generated).toHaveBeenCalledOnce();
    const count = state.scroll.mock.calls.length;
    rerender(<SerramentiLivePreviewPanel template={{}} activeSection="page_lavori" />);
    await waitFor(() => expect(state.doc.getOutline).toHaveBeenCalledTimes(2));
    await screen.findByText("Sezione non presente in questo PDF: vista mantenuta.");
    expect(state.scroll).toHaveBeenCalledTimes(count);
    rerender(<SerramentiLivePreviewPanel template={{}} activeSection="page_diario" />);
    await waitFor(() => expect(state.scroll).toHaveBeenLastCalledWith({ top: 3592, behavior: "smooth" }));
    expect(state.generated).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Sezione selezionata · pagina 6 di 6");
    rerender(<SerramentiLivePreviewPanel template={{}} activeSection="page_ordine" />);
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("ignores an old async resolution after a new section selection", async () => {
    let release: ((value: ReturnType<typeof outline>) => void) | undefined;
    state.doc.getOutline.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const { rerender } = render(<SerramentiLivePreviewPanel template={{}} activeSection="page_controlli" />);
    await waitFor(() => expect(release).toBeDefined(), { timeout: 2500 });
    rerender(<SerramentiLivePreviewPanel template={{}} activeSection="page_diario" />);
    await waitFor(() => expect(state.scroll).toHaveBeenLastCalledWith({ top: 3592, behavior: "smooth" }));
    const count = state.scroll.mock.calls.length;
    await act(async () => release?.(outline()));
    expect(state.scroll).toHaveBeenCalledTimes(count);
  });
});

describe("FV iframe semantic navigation", () => {
  it("syncs on iframe load, on selection, and after a reordered srcDoc; hidden pages are no-op", () => {
    const { rerender } = render(<FvLivePreviewPanel form={{}} activeSection="page_controlli" />);
    const iframe = screen.getByTitle("Anteprima preventivo Fotovoltaico") as HTMLIFrameElement;
    vi.spyOn(iframe.contentWindow!, "scrollTo").mockImplementation(state.htmlScroll);
    iframe.contentDocument!.body.innerHTML = '<div class="page" id="quality"><h1 data-fv-section="controlli">Titolo cambiato</h1></div><div class="page" id="journal"><h1 data-fv-section="diario">Altro titolo</h1></div>';
    Object.defineProperty(iframe.contentDocument!.getElementById("quality"), "offsetTop", { value: 730 });
    Object.defineProperty(iframe.contentDocument!.getElementById("journal"), "offsetTop", { value: 1940 });
    fireEvent.load(iframe);
    expect(state.htmlScroll).toHaveBeenLastCalledWith({ top: 730, behavior: "smooth" });
    expect(screen.getByRole("status")).toHaveTextContent("pagina 1 di 2 (anteprima HTML)");
    rerender(<FvLivePreviewPanel form={{}} activeSection="page_diario" />);
    expect(state.htmlScroll).toHaveBeenLastCalledWith({ top: 1940, behavior: "smooth" });
    expect(screen.getByRole("status")).toHaveTextContent("pagina 2 di 2 (anteprima HTML)");
    iframe.contentDocument!.body.innerHTML = '<div class="page" id="journal-new"><h1 data-fv-section="diario">Di nuovo rinominato</h1></div>';
    Object.defineProperty(iframe.contentDocument!.getElementById("journal-new"), "offsetTop", { value: 126 });
    fireEvent.load(iframe);
    expect(state.htmlScroll).toHaveBeenLastCalledWith({ top: 126, behavior: "smooth" });
    expect(screen.getByRole("status")).toHaveTextContent("pagina 1 di 1 (anteprima HTML)");
    const count = state.htmlScroll.mock.calls.length;
    rerender(<FvLivePreviewPanel form={{}} activeSection="page_controlli" />);
    expect(state.htmlScroll).toHaveBeenCalledTimes(count);
    expect(screen.getByRole("status")).toHaveTextContent("Sezione non presente in questa anteprima");
    rerender(<FvLivePreviewPanel form={{}} activeSection="page_ordine" />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
