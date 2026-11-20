import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PlanimetrieDialog from "@/components/orders/materiali/PlanimetrieDialog";
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" }, user: { id: "utente" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditOrders: true }) }));
vi.mock("@/components/orders/materiali/DisegnoCadPannello", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (tabella: string) => {
  const q = { select: () => q, eq: () => q, ilike: () => q, or: () => q, order: () => q, then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ error: null,
    data: tabella === "order_attachments" ? [{ id: "preventivo", file_name: "Trovato Vincenzo.pdf", file_url: "preventivo.pdf" }] : [] })) }; return q;
} } }));
afterEach(cleanup);
beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
it("un preventivo resta disponibile senza essere scelto automaticamente come planimetria", async () => {
  render(<QueryClientProvider client={new QueryClient()}><PlanimetrieDialog orderId="ordine" open onOpenChange={() => {}} /></QueryClientProvider>);
  await screen.findByText("Scegli o carica una planimetria");
  expect(screen.getByRole("button", { name: "Conta le sigle" })).toBeDisabled();
  fireEvent.click(screen.getByRole("combobox", { name: "Tavola" }));
  fireEvent.click(await screen.findByRole("option", { name: "Trovato Vincenzo.pdf" }));
  expect(screen.getByText(/PDF selezionato manualmente/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Conta le sigle" })).not.toBeDisabled();
});
