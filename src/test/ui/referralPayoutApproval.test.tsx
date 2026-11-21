import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PayoutApprovalTab } from "@/components/admin/referral/PayoutApprovalTab";

const demo = vi.hoisted(() => {
  const alpha = {
    id: "payout-a", referrer_id: "alpha", amount: 82, status: "processing",
    payment_method: "bank_transfer", created_at: "2026-11-01T10:00:00Z", transaction_reference: null as string | null,
  };
  return { alpha, rpc: vi.fn(), csv: vi.fn() };
});

vi.mock("@/lib/csvExport", () => ({ exportToCSV: demo.csv }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: demo.rpc,
    from(table: string) {
      let statuses: string[] | undefined;
      const query = {
        select: () => query, eq: () => query, order: () => query, gte: () => query, limit: () => query,
        in: (column: string, values: string[]) => { if (column === "status") statuses = values; return query; },
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then(resolve: (result: { data: unknown[]; error: null }) => void) {
          const data = table === "referral_payouts" ? (statuses?.includes(demo.alpha.status) ? [{ ...demo.alpha }] : [])
            : table === "referrers" ? [{
              id: "alpha", name: "Partner Demo Alfa", email: "alfa@example.invalid", payout_method: "bank_transfer",
              has_accepted_terms: true, payout_details: { iban: "IT60X0542811101000000123456", account_holder: "Demo Alfa",
                bank_verification: { status: "verified" }, contract: { status: "approved" } },
            }] : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  },
}));

afterEach(() => cleanup());

it("mostra le richieste in distinta, scarica la stessa causale e riconcilia la riga nello storico", async () => {
  demo.rpc.mockImplementation((_name, input) => {
    if (input.p_action === "prepare") {
      return Promise.resolve({ data: { payment_method: "bank_transfer", payout_id: "payout-a", amount: 82,
        reference: "EIC-DEMO-ALFA", beneficiary: "Demo Alfa", iban: "IT60X0542811101000000123456" }, error: null });
    }
    demo.alpha.status = "paid";
    demo.alpha.transaction_reference = input.p_reference;
    return Promise.resolve({ data: { status: "paid" }, error: null });
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><PayoutApprovalTab /></QueryClientProvider>);
  expect(await screen.findByText("Da riconciliare")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Distinta CSV" }));
  await vi.waitFor(() => expect(demo.csv).toHaveBeenCalledWith(
    [expect.objectContaining({ amount: "82.00", reference: "EIC-DEMO-ALFA" })],
    expect.any(Array), "distinta-EIC-DEMO-ALFA.csv",
  ));
  fireEvent.click(screen.getByRole("button", { name: "Riconcilia" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Riferimento transazione"), { target: { value: "DEMO-TRN-ALFA" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Conferma incrocio con la banca" }));
  expect(await screen.findByText("DEMO-TRN-ALFA")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Riconcilia" })).toBeNull();
  expect(demo.rpc).toHaveBeenCalledWith("referral_payout_transition", {
    p_payout_id: "payout-a", p_action: "confirm", p_reference: "DEMO-TRN-ALFA",
  });
});
