import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrdineSAL } from "@/components/orders/OrdineSAL";
import type { Installment } from "@/lib/orderUtils";

// No real query/mutation is executed: this test exercises the existing SAL form.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] as unknown[], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/components/shared/PrintPreviewModal", () => ({ PrintPreviewModal: (): null => null }));

const installments: Installment[] = [
  { id: "acconto", position: 1, label: "Acconto", type: "deposit", amount: 400, is_paid: true, paid_date: "2026-09-01", expected_date: "2026-09-01" },
  { id: "saldo", position: 2, label: "Saldo", type: "balance", amount: 820, is_paid: false, paid_date: null, expected_date: null },
];

afterEach(cleanup);

describe("SAL operativo separato dagli incassi", () => {
  it("mantiene il riepilogo incassi per i chiamanti esistenti", () => {
    render(<OrdineSAL orderId="ordine" companyId="azienda" orderTotalAmount={1000} installments={installments} />);
    expect(screen.getByText("Avanzamento incassi")).toBeVisible();
    expect(screen.getByText("1/2 rate incassate")).toBeVisible();
  });

  it("nasconde soltanto il riepilogo in Cantiere e conserva le rate nel verbale", () => {
    render(<OrdineSAL orderId="ordine" companyId="azienda" orderTotalAmount={1000} installments={installments} showPaymentProgress={false} />);
    expect(screen.queryByText("Avanzamento incassi")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crea verbale" }));
    expect(screen.getByText("Rata certificata da questo verbale")).toBeVisible();
    expect(screen.getByRole("button", { name: /Acconto ·/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Saldo ·/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Saldo ·/ }));
    expect(screen.getByRole("button", { name: /Saldo ·/ })).toHaveClass("font-medium");
    expect(screen.getByText("Voci di avanzamento")).toBeVisible();
  });
});
