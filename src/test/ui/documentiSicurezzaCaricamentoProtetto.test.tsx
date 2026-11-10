import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CaricaDocumentoSicurezzaDialog } from "@/components/sicurezza/DocumentiSicurezza";

const api = vi.hoisted(() => ({ upload: vi.fn(), company: vi.fn() }));
vi.mock("@/components/sicurezza/SafetyWorkflow", () => ({ SafetyWorkflow: (): null => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const result = { data: [] as unknown[], error: null as null };
  const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, then: (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve) };
  return query;
} } }));
vi.mock("@/hooks/useDocumentiSicurezza", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  return {
    LIMITE_FILE_SICUREZZA: 50 * 1024 * 1024,
    useCaricaDocumentiSicurezza: (companyId: string) => { api.company(companyId); return useMutation({ mutationFn: api.upload }); },
    useDocumentiSicurezza: vi.fn(), useEliminaDocumentoSicurezza: vi.fn(), apriDocumentoSicurezza: vi.fn(),
  };
});
vi.mock("@/lib/sicurezza/durcExpiry", () => ({ extractDurcExpiryFromPdf: vi.fn().mockResolvedValue(null) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function setup() {
  const close = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><CaricaDocumentoSicurezzaDialog companyId="azienda-demo" open onOpenChange={close} /></QueryClientProvider>);
  return close;
}
async function scegliFile() {
  await act(async () => { fireEvent.change(screen.getByLabelText("File dei documenti di sicurezza"), { target: { files: [new File(["demo"], "prova.pdf", { type: "application/pdf" })] } }); });
  expect(await screen.findByLabelText("Titolo del documento")).toHaveValue("prova");
}
it("associa i campi e protegge upload, doppio invio e chiusura fino al risultato", async () => {
  let finish!: (v: unknown) => void;
  api.upload.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const close = setup();
  expect(screen.getByLabelText("Tipo di documento")).toHaveAttribute("role", "combobox");
  expect(screen.getByLabelText("Commessa")).toBeInTheDocument();
  expect(screen.getByLabelText("Impresa")).toBeInTheDocument();
  await scegliFile();
  fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Solo prova" } });
  const carica = screen.getByRole("button", { name: "Carica" });
  fireEvent.click(carica); fireEvent.click(carica);
  await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1));
  expect(api.company).toHaveBeenCalledWith("azienda-demo");
  expect(api.upload.mock.calls[0][0][0]).toMatchObject({ titolo: "prova", tipo: "altro", orderId: null, subappaltatoreId: null, note: "Solo prova" });
  expect(screen.getByLabelText("Note")).toBeDisabled();
  expect(screen.getByLabelText("Data del documento")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Annulla" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(close).not.toHaveBeenCalled();
  await act(async () => finish([]));
  await waitFor(() => expect(close).toHaveBeenCalledWith(false));
});
it("un errore conserva file e dati e permette un nuovo tentativo", async () => {
  api.upload.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
  const close = setup(); await scegliFile();
  fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Bozza da conservare" } });
  fireEvent.click(screen.getByRole("button", { name: "Carica" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Carica" })).toBeEnabled());
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Note")).toHaveValue("Bozza da conservare");
  expect(screen.getByLabelText("Titolo del documento")).toHaveValue("prova");
  fireEvent.click(screen.getByRole("button", { name: "Carica" }));
  await waitFor(() => expect(close).toHaveBeenCalledWith(false));
  expect(api.upload).toHaveBeenCalledTimes(2);
});
