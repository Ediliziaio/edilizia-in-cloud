import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import NewEntryDialog from "@/components/prima-nota/NewEntryDialog";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  storage: { from: () => ({ upload: mocks.upload }) },
  from: () => {
    const result: { data: unknown[]; error: null } = { data: [], error: null };
    const q = { select: () => q, eq: () => q, order: () => q, limit: () => q,
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
    return q;
  },
} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("conserva modulo e allegato dopo un errore e consente di riprovare senza salvare una voce incompleta", async () => {
  mocks.upload.mockResolvedValueOnce({ error: new Error("Caricamento interrotto") }).mockResolvedValueOnce({ error: null });
  const confirm = vi.fn();
  render(<NewEntryDialog open onOpenChange={vi.fn()} onConfirm={confirm} isPending={false} />);
  fireEvent.change(screen.getByPlaceholderText("es. Pagamento fornitore ABC"), { target: { value: "Prova allegato" } });
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "12" } });
  const file = new File(["Documento sintetico"], "prova.pdf", { type: "application/pdf" });
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Registra" }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("non è stata salvata")));
  expect(confirm).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("Prova allegato")).toBeTruthy();
  expect(screen.getByText("prova.pdf")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Registra" }));
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ description: "Prova allegato", amount: 12, attachment_name: "prova.pdf", attachment_url: expect.stringMatching(/^prima-nota-attachments\/demo\/.+\.pdf$/) }));
});
