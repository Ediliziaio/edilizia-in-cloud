import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LearningReview } from "@/components/admin/silvio-hub/LearningReview";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
const candidate = {
  id: "doc", version: "version-1", title: "Esempio fittizio", content: "Risposta originale da non copiare in memoria.",
  persona_keys: ["silvio"], kb_section: "gold_standard", review_state: "pending", reviewed_content: null as string | null,
};
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><LearningReview /></QueryClientProvider>);
}
async function openCandidate() {
  fireEvent.click(await screen.findByText("Esempio utile · silvio"));
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockImplementation(async (name: string) => name === "silvio_learning_candidates"
    ? { data: [candidate], error: null } : { data: { ok: true }, error: null });
});
afterEach(cleanup);

describe("manual learning review", () => {
  it("never approves or pre-fills the raw response automatically", async () => {
    mount(); await openCandidate();
    expect((screen.getByLabelText("Regola verificata da conservare") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByRole("button", { name: "Approva regola" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("submits the distilled rule with the exact reviewed document version", async () => {
    mount(); await openCandidate();
    fireEvent.change(screen.getByLabelText("Regola verificata da conservare"), { target: { value: "  Verifica sempre la fonte del costo prima di rispondere.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Approva regola" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("silvio_review_learning", {
      p_document_id: "doc", p_version: "version-1", p_decision: "approved",
      p_content: "Verifica sempre la fonte del costo prima di rispondere.",
    }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
  });
  it("can reject without manufacturing a replacement rule", async () => {
    mount(); await openCandidate();
    fireEvent.click(screen.getByRole("button", { name: "Escludi esempio" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("silvio_review_learning", {
      p_document_id: "doc", p_version: "version-1", p_decision: "rejected", p_content: null,
    }));
  });
  it("shows database unavailability as an error, never an empty successful queue", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("RPC missing") });
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Revisione non disponibile");
    expect(screen.queryByText("Nessun esempio in questa pagina.")).toBeNull();
  });
  it("keeps the draft and reports a stale-version rejection without success", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "silvio_learning_candidates"
      ? { data: [candidate], error: null } : { data: null, error: new Error("Esempio modificato") });
    mount(); await openCandidate();
    const rule = "Verifica sempre la fonte prima di riportare un costo.";
    fireEvent.change(screen.getByLabelText("Regola verificata da conservare"), { target: { value: rule } });
    fireEvent.click(screen.getByRole("button", { name: "Approva regola" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.success).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Regola verificata da conservare") as HTMLTextAreaElement).value).toBe(rule);
  });
});
