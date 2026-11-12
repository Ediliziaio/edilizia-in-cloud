import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CaricaDocumentiDialog } from "@/components/orders/CaricaDocumentiDialog";

const m = vi.hoisted(() => ({ riduci: vi.fn(), upload: vi.fn(), insert: vi.fn(), remove: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "utente-demo" }, profile: {}, effectiveCompany: { id: "demo" } }) }));
vi.mock("@/hooks/useSpazioArchiviazione", () => ({ useSpazioArchiviazione: () => ({ data: null }), byteLiberi: () => null, chiaveSpazio: () => ["spazio-demo"] }));
vi.mock("@/lib/commesse/riduciFoto", () => ({ riduciFile: m.riduci, fotoDaRidurre: () => false }));
vi.mock("@/lib/commesse/riduciPdf", () => ({ pdfDaValutare: () => false }));
vi.mock("@/lib/commesse/miniatura", () => ({ caricaMiniatura: async () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ upload: m.upload, remove: m.remove }) }, from: () => ({ insert: m.insert }) } }));
vi.mock("sonner", () => ({ toast: { success: m.success, error: m.error } }));
vi.mock("@/utils/logger", () => ({ logger: { error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  m.riduci.mockImplementation(async file => ({ file, ridotta: false, byteOriginali: file.size }));
  m.upload.mockResolvedValue({ error: null });
  m.insert.mockResolvedValue({ error: null });
  m.remove.mockResolvedValue({ error: null });
});
afterEach(cleanup);
function apri(files: File[]) {
  const close = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><CaricaDocumentiDialog open onOpenChange={close} orderId="commessa-demo" filesIniziali={files} cartelle={[]} cartellaPredefinita={null}/></QueryClientProvider>);
  return close;
}
const pdf = (name: string) => new File(["PDF dimostrativo"], name, { type: "application/pdf" });

it("un errore nella preparazione non blocca la coda; riprova solo il file fallito", async () => {
  m.riduci.mockRejectedValueOnce(new Error("Failed to fetch dynamically imported module"));
  const close = apri([pdf("primo.pdf"), pdf("secondo.pdf")]);
  fireEvent.click(screen.getByRole("button", { name: "Carica 2 file" }));
  const retry = await screen.findByRole("button", { name: "Riprova 1 file" });
  expect(retry).toBeEnabled();
  expect(screen.getByText("Connessione interrotta: premi Riprova")).toBeInTheDocument();
  expect(m.upload).toHaveBeenCalledTimes(1);
  expect(m.upload.mock.calls[0][1].name).toBe("secondo.pdf");
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(retry);
  await waitFor(() => expect(close).toHaveBeenCalledWith(false));
  expect(m.upload).toHaveBeenCalledTimes(2);
  expect(m.upload.mock.calls[1][1].name).toBe("primo.pdf");
  expect(m.success).toHaveBeenCalledWith("Documento caricato");
});

it("se il metadato non si salva, rimuove il file invisibile e consente il nuovo tentativo", async () => {
  m.insert.mockResolvedValueOnce({ error: { code: "42501", message: "row-level security" } });
  const close = apri([pdf("contratto.pdf")]);
  fireEvent.click(screen.getByRole("button", { name: "Carica 1 file" }));
  const retry = await screen.findByRole("button", { name: "Riprova 1 file" });
  expect(screen.getByText("Non hai il permesso di caricare documenti su questa commessa")).toBeInTheDocument();
  expect(m.remove).toHaveBeenCalledWith([expect.stringMatching(/^orders\/commessa-demo\//)]);
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(retry);
  await waitFor(() => expect(close).toHaveBeenCalledWith(false));
  expect(m.upload).toHaveBeenCalledTimes(2);
});
