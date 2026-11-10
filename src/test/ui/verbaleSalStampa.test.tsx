// La stampa del verbale SAL (10/11/2026): completo o breve, foto e allegati facoltativi.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [] as unknown[], error: null as null }).then(ok) };
  for (const m of ["select", "eq", "order", "limit"]) q[m] = () => q;
  return { supabase: { from: () => q, storage: { from: () => ({ createSignedUrls: async () => ({ data: [] as unknown[] }) }) } } };
});

import { VerbaleSalDialog } from "@/components/orders/VerbaleSalDialog";

const apri = (conSottofasi: boolean, onGenera = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VerbaleSalDialog numero={2} orderId="o" companyId="c" dal={null} al="2026-10-30" inCorso={false} conSottofasi={conSottofasi} onGenera={onGenera} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  return onGenera;
};
afterEach(cleanup);

describe("Stampa del verbale SAL", () => {
  it("si sceglie completo o breve; per default completo", () => {
    const onGenera = apri(true);
    expect(screen.getByRole("button", { name: /Completo/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Breve/ }));
    fireEvent.click(screen.getByRole("button", { name: "Prepara il verbale" }));
    expect(onGenera).toHaveBeenCalledWith([], [], false);
  });

  it("gli allegati soliti si aggiungono con un clic", () => {
    const onGenera = apri(false);
    expect(screen.queryByRole("button", { name: /Breve/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+ Libretto delle misure" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Computo metrico" }));
    expect(screen.queryByRole("button", { name: "+ Computo metrico" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Prepara il verbale" }));
    expect(onGenera).toHaveBeenCalledWith([], ["Libretto delle misure", "Computo metrico"], true);
  });
});
