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

const apri = (onGenera = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VerbaleSalDialog numero={2} orderId="o" companyId="c" dal={null} al="2026-10-30" inCorso={false} onGenera={onGenera} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  return onGenera;
};
afterEach(cleanup);

describe("Stampa del verbale SAL", () => {
  it.each([["Solo periodo", "periodo"], ["Sintetico", "sintetico"]] as const)("prepara il %s quando si sceglie la versione", (titolo, formato) => {
    const onGenera = apri();
    expect(screen.getByRole("button", { name: /Completo/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(titolo) }));
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    expect(onGenera).toHaveBeenCalledWith([], [], formato);
  });

  it("mostra gli allegati su richiesta e conserva le scelte quando si richiudono", () => {
    const onGenera = apri();
    expect(screen.getByRole("button", { name: /Solo periodo/ })).toBeInTheDocument();
    const opzioni = screen.getByRole("button", { name: /Foto e allegati/ });
    expect(opzioni).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Elenco allegati" })).toBeNull();
    fireEvent.click(opzioni);
    fireEvent.click(screen.getByRole("button", { name: "+ Libretto delle misure" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Computo metrico" }));
    expect(screen.queryByRole("button", { name: "+ Computo metrico" })).toBeNull();
    fireEvent.click(opzioni);
    expect(opzioni).toHaveAttribute("aria-expanded", "false");
    expect(opzioni).toHaveTextContent("2");
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    expect(onGenera).toHaveBeenCalledWith([], ["Libretto delle misure", "Computo metrico"], "completo");
  });
});
