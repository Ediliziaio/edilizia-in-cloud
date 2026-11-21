import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { PaymentGateHost } from "@/components/billing/PaymentGateHost";
import { usePaymentGateStore } from "@/store/paymentGateStore";

const caricato = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: "company_admin" }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/usePaymentMethodGate", () => ({ usePaymentMethodGate: (): { reason: null } => ({ reason: null }) }));
vi.mock("@/hooks/useBilling", () => {
  caricato();
  return { useStartCardSetup: () => ({ isPending: false, mutate: vi.fn() }) };
});
vi.mock("@/components/billing/AddonWhatsAppOfferta", () => ({ AddonWhatsAppOfferta: (): null => null }));
vi.mock("@/components/credits/RechargeDialog", () => ({
  RechargeDialog: ({ walletType }: { walletType: string }) => <p role="status">Ricarica {walletType}</p>,
}));

beforeEach(() => {
  usePaymentGateStore.setState({ open: false, kind: "payment", dettaglio: null, apertoAt: 0 });
});

it("carica il gate alla prima richiesta e mantiene la ricarica quando il gate si chiude", async () => {
  render(<MemoryRouter><PaymentGateHost /></MemoryRouter>);
  expect(caricato).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();

  act(() => usePaymentGateStore.getState().show("credits", { portafoglio: "render" }));
  await act(async () => { await import("@/components/billing/PaymentGateDialog"); });
  const ricarica = await screen.findByRole("button", { name: "Ricarica ora" }, { timeout: 5_000 });
  expect(caricato).toHaveBeenCalledTimes(1);
  fireEvent.click(ricarica);
  expect(usePaymentGateStore.getState().open).toBe(false);
  expect(screen.getByText("Ricarica render")).toBeInTheDocument();
}, 10_000);
