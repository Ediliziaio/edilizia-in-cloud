import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";

const state = vi.hoisted(() => ({ url: "blob:first", doc: null as any, getDocument: vi.fn(), generate: vi.fn() }));
vi.mock("@/components/shared/livePreview/useGenerazioneProtetta", () => ({ useGenerazioneProtetta: (...args: unknown[]) => {
  state.generate(...args);
  return { risultato: state.url, caricamento: false, errore: null as null, rigenera: vi.fn() };
} }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument: (...args: unknown[]) => {
  state.getDocument(...args); return { promise: Promise.resolve(state.doc) };
} }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "local-worker" }));

let width = 420;
let resize: (() => void) | null = null;
const makeDocument = (mapping: Record<string, number> = { controlli: 4, diario: 6, cover: 0 }) => ({
  numPages: 9,
  getDestination: vi.fn(async (id: string) => mapping[id.replace("edile.section.", "")] === undefined ? null : [{ num: mapping[id.replace("edile.section.", "")] + 20, gen: 0 }]),
  getPageIndex: vi.fn(async (ref: { num: number }) => ref.num - 20),
  getPage: vi.fn(async () => ({ getViewport: ({ scale }: { scale: number }) => ({ width: 595 * scale, height: 841 * scale }), render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })) })),
  destroy: vi.fn(),
});
const panel = () => document.querySelector<HTMLDivElement>("[data-pdf-scroll-container]")!;
const canvas = (page: number) => panel().querySelector<HTMLCanvasElement>(`canvas[data-page="${page}"]`)!;
const top = (page: number) => canvas(page).getBoundingClientRect().top + panel().scrollTop;
const props = { depsKey: "same-content", renderBlobUrl: async () => state.url };

beforeEach(() => {
  width = 420; state.url = "blob:first"; state.doc = makeDocument(); state.getDocument.mockClear(); state.generate.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })));
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() { resize?.(); } disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as any);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    const item = this as HTMLElement;
    if (item.tagName !== "CANVAS") return { top: 0, height: width ? 500 : 0, width, bottom: 500, left: 0, right: width, x: 0, y: 0, toJSON() {} };
    const items = Array.from(item.closest("[data-pdf-scroll-container]")?.querySelectorAll("canvas") ?? []);
    const index = items.indexOf(item as HTMLCanvasElement);
    const height = width ? Number(item.getAttribute("height")) : 0;
    const pageTop = 12 + items.slice(0, index).reduce((sum, previous) => sum + Number(previous.getAttribute("height")) + 12, 0) - (panel()?.scrollTop ?? 0);
    return { top: pageTop, height, width: Number(item.getAttribute("width")), bottom: pageTop + height, left: 0, right: width, x: 0, y: pageTop, toJSON() {} };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("shared semantic PDF preview, including Facciate direct consumer", () => {
  it("uses native destinations without regenerating, text lookup or window scroll", async () => {
    const { rerender } = render(<PdfBlobLivePreviewPanel {...props} activeSection="page_controlli" />);
    await screen.findByText("Sezione selezionata · pagina 5 di 9");
    expect(panel().scrollTop).toBeCloseTo(top(5) - 12);
    rerender(<PdfBlobLivePreviewPanel {...props} activeSection="page_diario" />);
    await screen.findByText("Sezione selezionata · pagina 7 di 9");
    expect(panel().scrollTop).toBeCloseTo(top(7) - 12);
    expect(state.getDocument).toHaveBeenCalledOnce();
    expect(state.generate.mock.calls.every(call => call[1] === "same-content")).toBe(true);
  });
  it("keeps zoom and the user's within-page position when zooming and regenerating", async () => {
    const { rerender } = render(<PdfBlobLivePreviewPanel {...props} activeSection="page_controlli" />);
    await screen.findByText("Sezione selezionata · pagina 5 di 9");
    panel().scrollTop = top(5) + 100; panel().scrollLeft = 18; fireEvent.scroll(panel());
    const fraction = 100 / canvas(5).height;
    fireEvent.click(screen.getByTitle("Ingrandisci"));
    await waitFor(() => expect(canvas(5).height).toBeGreaterThan(600));
    await waitFor(() => expect(panel().scrollTop).toBeCloseTo(top(5) + fraction * canvas(5).height));
    expect(panel().scrollLeft).toBe(18);
    state.doc = makeDocument({ controlli: 6 }); state.url = "blob:reordered";
    rerender(<PdfBlobLivePreviewPanel {...props} depsKey="changed-content" activeSection="page_controlli" />);
    await screen.findByText("Sezione selezionata · pagina 7 di 9");
    expect(screen.getByText("125%")).toBeInTheDocument();
    expect(panel().scrollTop).toBeCloseTo(top(7) + fraction * canvas(7).height);
  });
  it("keeps the current view for a hidden or absent section and for settings", async () => {
    const { rerender } = render(<PdfBlobLivePreviewPanel {...props} activeSection="page_controlli" />);
    await screen.findByText("Sezione selezionata · pagina 5 di 9");
    const previous = panel().scrollTop;
    rerender(<PdfBlobLivePreviewPanel {...props} activeSection="page_lavori" />);
    await screen.findByText(/Sezione non presente/);
    expect(panel().scrollTop).toBe(previous);
    rerender(<PdfBlobLivePreviewPanel {...props} activeSection="page_ordine" />);
    await waitFor(() => expect(screen.queryByText(/Sezione non presente/)).not.toBeInTheDocument());
    expect(panel().scrollTop).toBe(previous);
  });
  it("does not fit at width zero; reveal fits and navigates the latest section", async () => {
    width = 0;
    const { rerender } = render(<PdfBlobLivePreviewPanel {...props} activeSection="page_controlli" />);
    await screen.findByLabelText("Pagina 9 di 9");
    expect(state.doc.getPage).not.toHaveBeenCalled();
    expect(state.doc.getDestination).not.toHaveBeenCalled();
    rerender(<PdfBlobLivePreviewPanel {...props} activeSection="page_diario" />);
    act(() => { width = 380; resize?.(); });
    await screen.findByText("Sezione selezionata · pagina 7 di 9");
    expect(canvas(1).width).toBe(356);
    expect(panel().scrollTop).toBeCloseTo(top(7) - 12);
  });
  it("preserves the last visible scroll position through hide/reveal at the same width", async () => {
    render(<PdfBlobLivePreviewPanel {...props} activeSection="page_controlli" />);
    await screen.findByText("Sezione selezionata · pagina 5 di 9");
    panel().scrollTop = top(5) + 77; fireEvent.scroll(panel());
    const previous = panel().scrollTop;
    act(() => { width = 0; resize?.(); });
    panel().scrollTop = 0;
    act(() => { width = 420; resize?.(); });
    await waitFor(() => expect(panel().scrollTop).toBeCloseTo(previous));
  });
  it("ignores stale destination resolution after a newer section selection", async () => {
    let release: ((value: unknown[]) => void) | undefined;
    const original = state.doc.getDestination;
    state.doc.getDestination = vi.fn((id: string) => id.endsWith("controlli") ? new Promise(resolve => { release = resolve; }) : original(id));
    const { rerender } = render(<PdfBlobLivePreviewPanel {...props} activeSection="page_controlli" />);
    await waitFor(() => expect(release).toBeDefined());
    rerender(<PdfBlobLivePreviewPanel {...props} activeSection="page_diario" />);
    await screen.findByText("Sezione selezionata · pagina 7 di 9");
    const current = panel().scrollTop;
    await act(async () => { release?.([0]); });
    expect(panel().scrollTop).toBe(current);
    expect(screen.getByText("Sezione selezionata · pagina 7 di 9")).toBeInTheDocument();
  });
});
