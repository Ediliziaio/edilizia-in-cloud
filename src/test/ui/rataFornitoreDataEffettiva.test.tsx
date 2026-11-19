import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RateFornitori } from "@/components/scadenzario/RateFornitori";

const update = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewCosts: true, solaLettura: false }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => {
    const q = {
      select: () => q, eq: () => q, neq: () => q, order: () => q,
      range: async () => ({ data: [{ id: "r1", numero: 1, stato: "da_pagare", importo: 123, metodo: "MP12", scadenza: "2026-11-16" }] }),
      update: (payload: unknown) => { update(payload); return q; },
      single: async () => ({ data: { id: "r1" }, error: null as null }),
    };
    return q;
  } },
}));
it("registra la data scelta per l’addebito Ri.Ba.", async () => {
  render(<QueryClientProvider client={new QueryClient()}><RateFornitori companyId="co" anno="all" cerca="" /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Segna pagata" }));
  fireEvent.change(screen.getByLabelText("Data effettiva del pagamento"), { target: { value: "2025-11-17" } });
  fireEvent.click(screen.getByRole("button", { name: "Conferma pagamento" }));
  await waitFor(() => expect(update).toHaveBeenCalledWith({ stato: "pagata", pagata_il: "2025-11-17" }));
});
