import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ModuloLockedDialog } from "@/components/marketing/preventivi/moduli/ModuloLockedDialog";
import { MODULI_VENDITA } from "@/lib/moduli-vendita/config";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), success: vi.fn(), error: vi.fn(), close: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "test-company" }, user: { id: "test-user" } }) }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
function mount() { render(<ModuloLockedDialog open onOpenChange={mocks.close} view={{ modulo: MODULI_VENDITA[0], stato: "bloccato", isEnabled: false, isLoading: false, isError: false, errorMessage: null, source: "plan" }} />); }
it.each([{ data: null, error: new Error("404") }, { data: {}, error: null }, { data: { ok: false }, error: null }])("non conferma ricezioni non verificate: %j", async result => {
  mocks.invoke.mockResolvedValue(result); mount(); fireEvent.click(screen.getByRole("button", { name: "Richiedi attivazione" }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalled()); expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.close).not.toHaveBeenCalled(); expect(screen.getByRole("dialog")).toBeInTheDocument();
});
it("gestisce errori di trasporto senza falsa conferma", async () => { mocks.invoke.mockRejectedValue(new Error("offline")); mount(); fireEvent.click(screen.getByRole("button", { name: "Richiedi attivazione" })); await waitFor(() => expect(mocks.error).toHaveBeenCalled()); expect(mocks.success).not.toHaveBeenCalled(); });
it("conferma soltanto una risposta positiva del servizio", async () => { mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null }); mount(); fireEvent.click(screen.getByRole("button", { name: "Richiedi attivazione" })); await waitFor(() => expect(mocks.success).toHaveBeenCalled()); expect(mocks.close).toHaveBeenCalledWith(false); });
it("blocca invii ripetuti durante una richiesta", async () => {
  let finish!: (value: unknown) => void; mocks.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; })); mount();
  const button = screen.getByRole("button", { name: "Richiedi attivazione" }); fireEvent.click(button); fireEvent.click(button);
  expect(mocks.invoke).toHaveBeenCalledTimes(1); expect(button).toBeDisabled();
  finish({ data: { ok: true }, error: null }); await waitFor(() => expect(mocks.success).toHaveBeenCalled());
});
