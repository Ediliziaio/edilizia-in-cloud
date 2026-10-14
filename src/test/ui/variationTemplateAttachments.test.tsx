import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VariationTemplateAttachments } from "@/components/orders/VariationTemplateAttachments";
import { blankVariationTemplate } from "@/lib/orders/variationTemplates";
const mock = vi.hoisted(() => ({ list: vi.fn(), upload: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/orders/variationTemplateFiles", () => ({ listVariationFiles: mock.list, uploadVariationFile: mock.upload, downloadVariationFile: mock.download, archiveVariationFile: vi.fn(), VARIATION_FILES_MAX: 10, variationPackageName: (n: string) => n }));
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({ PdfBlobLivePreviewPanel: () => <div>Visore allegato PDF</div> }));
vi.mock("@/lib/orders/variationTemplateExample", () => ({ variationTemplateExamplePdf: async () => ({ output: () => new Uint8Array([37,80,68,70]).buffer }), variationTemplateVisualKey: (c: unknown) => JSON.stringify(c) }));
vi.mock("jszip", () => ({ default: class { file() { return this; } async generateAsync() { return new Blob(["ZIP-DEMO"], { type: "application/zip" }); } } }));
const row = { id: "file", company_id: "company", template_id: "template", file_name: "Condizioni.pdf", file_size: 1000, is_active: true };
beforeEach(() => { vi.clearAllMocks(); mock.list.mockResolvedValue([row]); });
afterEach(cleanup);
function setup(canEdit = true) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><VariationTemplateAttachments company="company" template="template" content={blankVariationTemplate()} canEdit={canEdit} disabled={false} onBusyChange={vi.fn()} /></QueryClientProvider>); }
it("elenca senza scaricare file finché non si richiede anteprima o download", async () => {
  setup(); expect(await screen.findByText("Condizioni.pdf")).toBeInTheDocument(); expect(mock.download).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Mostra PDF" })); expect(screen.getByText("Visore allegato PDF")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Scarica esempio e allegati (ZIP)" })).toBeInTheDocument();
});
it("sola lettura: anteprima e download sì, caricamento/rimozione no", async () => {
  setup(false); await screen.findByText("Condizioni.pdf"); expect(screen.queryByRole("button", { name: "Aggiungi PDF" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Rimuovi dal modello" })).not.toBeInTheDocument(); expect(screen.getByLabelText("Carica allegato PDF")).toBeDisabled();
});
it("errore nell'elenco non viene presentato come nessun allegato", async () => {
  mock.list.mockRejectedValue(new Error("offline")); setup(); expect(await screen.findByRole("alert")).toHaveTextContent("non disponibili");
  expect(screen.queryByText(/Nessun allegato/)).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Aggiungi PDF" })).toBeDisabled();
});
it("prepara il pacchetto completo e nasconde il download vecchio dopo una modifica", async () => {
  mock.download.mockResolvedValue({ arrayBuffer: async () => new Uint8Array([37,80,68,70]).buffer });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const content = blankVariationTemplate();
  const view = (value = content) => <QueryClientProvider client={client}><VariationTemplateAttachments company="company" template="template" content={value} canEdit disabled={false} onBusyChange={vi.fn()} /></QueryClientProvider>;
  const ui = render(view()); await screen.findByText("Condizioni.pdf");
  fireEvent.click(screen.getByRole("button", { name: "Scarica esempio e allegati (ZIP)" }));
  const link = await screen.findByRole("link", { name: "Scarica ZIP pronto" });
  expect(link.getAttribute("download")).toBe("esempio-variante-e-allegati.zip"); expect(link.getAttribute("href")).toMatch(/^data:application\/zip/);
  expect(mock.download).toHaveBeenCalledOnce();
  ui.rerender(view({ ...content, document_heading: "Titolo modificato" }));
  expect(screen.queryByRole("link", { name: "Scarica ZIP pronto" })).not.toBeInTheDocument();
});
it("se un allegato manca, non offre un pacchetto parziale", async () => {
  mock.download.mockRejectedValue(new Error("File mancante")); setup(); await screen.findByText("Condizioni.pdf");
  fireEvent.click(screen.getByRole("button", { name: "Scarica esempio e allegati (ZIP)" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("File mancante")); expect(screen.queryByRole("link", { name: "Scarica ZIP pronto" })).not.toBeInTheDocument();
});
