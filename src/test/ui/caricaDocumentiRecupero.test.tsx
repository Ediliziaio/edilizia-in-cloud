import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CaricaDocumentiDialog } from "@/components/orders/CaricaDocumentiDialog";

const m = vi.hoisted(() => ({ riduci: vi.fn(), upload: vi.fn(), insert: vi.fn(), remove: vi.fn(), success: vi.fn(), error: vi.fn(), liberi: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "utente-demo" }, profile: {}, effectiveCompany: { id: "demo" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({}) }));
vi.mock("@/lib/commesse/caricaAllegatoConProgresso", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/commesse/caricaAllegatoConProgresso")>(),
  caricaAllegatoConProgresso: (_bucket: string, path: string, file: File, progress: (value: number) => void) => m.upload(path, file, progress),
}));
vi.mock("@/hooks/useSpazioArchiviazione", () => ({ useSpazioArchiviazione: () => ({ data: null as null }), byteLiberi: m.liberi, chiaveSpazio: () => ["spazio-demo"] }));
vi.mock("@/lib/commesse/riduciFoto", () => ({ riduciFile: m.riduci, fotoDaRidurre: () => false }));
vi.mock("@/lib/commesse/riduciPdf", () => ({ pdfDaValutare: () => false }));
vi.mock("@/lib/commesse/miniatura", () => ({ caricaMiniatura: async (): Promise<null> => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ upload: m.upload, remove: m.remove }) }, from: () => ({ insert: m.insert }) } }));
vi.mock("sonner", () => ({ toast: { success: m.success, error: m.error } }));
vi.mock("@/utils/logger", () => ({ logger: { error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  m.riduci.mockImplementation(async file => ({ file, ridotta: false, byteOriginali: file.size }));
  m.upload.mockResolvedValue({ error: null });
  m.insert.mockResolvedValue({ error: null });
  m.remove.mockResolvedValue({ error: null });
  m.liberi.mockReturnValue(null);
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
  await screen.findByText("Caricamento completato");
  expect(screen.getByRole("progressbar", {name: "Avanzamento complessivo"})).toHaveAttribute("aria-valuenow", "100");
  fireEvent.click(screen.getByRole("button", {name: "Fine"}));
  expect(close).toHaveBeenCalledWith(false);
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
  await screen.findByText("Caricamento completato");
  expect(screen.getByRole("progressbar", {name: "Avanzamento complessivo"})).toHaveAttribute("aria-valuenow", "100");
  fireEvent.click(screen.getByRole("button", {name: "Fine"}));
  expect(close).toHaveBeenCalledWith(false);
  expect(m.upload).toHaveBeenCalledTimes(2);
});


it("trascina un POS e mostra i byte inviati prima di confermare il salvataggio", async () => {
  let fineInvio: () => void;
  m.upload.mockImplementationOnce((_path, _file, avanti) => new Promise<void>(resolve => {
    fineInvio = resolve;
    avanti(45);
  }));
  apri([]);
  fireEvent.drop(screen.getByRole("button", {name: /Aggiungi file/}), {dataTransfer: {types: ["Files"], files: [pdf("POS-Cantiere.pdf")]}});
  expect(screen.getByText("POS-Cantiere.pdf")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "Carica 1 file"}));
  await waitFor(() => expect(screen.getByRole("progressbar", {name: "Caricamento POS-Cantiere.pdf"})).toHaveAttribute("aria-valuenow", "45"));
  expect(screen.queryByText("Caricamento completato")).not.toBeInTheDocument();
  fineInvio();
  await screen.findByText("Caricamento completato");
  expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({cantiere_tipo: "pos", folder_id: null, visible_to_customer: false}));
});


it("dopo un timeout durante il salvataggio riprova con gli stessi file e ID", async () => {
  m.insert.mockImplementationOnce(async () => {
    m.liberi.mockReturnValue(0);
    return { error: { code: "", message: "Network timeout" } };
  });
  apri([pdf("allegato.pdf")]);
  fireEvent.click(screen.getByRole("button", { name: "Carica 1 file" }));
  const retry = await screen.findByRole("button", { name: "Riprova 1 file" });
  expect(m.remove).not.toHaveBeenCalled();
  fireEvent.click(retry);
  await screen.findByText("Caricamento completato");
  expect(m.upload).toHaveBeenCalledTimes(1);
  expect(m.insert.mock.calls[1][0]).toEqual(m.insert.mock.calls[0][0]);
});


it("riprende lo stesso oggetto quando lo storage lo ha ricevuto prima del timeout", async () => {
  m.upload.mockRejectedValueOnce(new Error("Upload timeout"));
  m.upload.mockRejectedValueOnce(Object.assign(new Error("The resource already exists"), {statusCode: 400, code: "Duplicate"}));
  apri([pdf("POS-cantiere.pdf")]);
  fireEvent.click(screen.getByRole("button", {name: "Carica 1 file"}));
  fireEvent.click(await screen.findByRole("button", {name: "Riprova 1 file"}));
  await screen.findByText("Caricamento completato");
  const [percorso] = m.upload.mock.calls[0];
  expect(m.upload.mock.calls[1][0]).toBe(percorso);
  expect(m.insert.mock.calls[0][0]).toEqual(expect.objectContaining({file_url: percorso, cantiere_tipo: "pos"}));
  expect(m.remove).not.toHaveBeenCalled();
});
