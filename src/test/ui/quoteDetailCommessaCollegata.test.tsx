/**
 * Dettaglio preventivo accettato (06/10/2026): una commessa sola per preventivo.
 *
 * «Converti in Cantiere» (edge function) rifiuta un preventivo che ha già la commessa, ma la strada «Crea commessa
 * (rivedi)» (Nuova commessa con ?quote_id) non controlla niente e non cambia lo stato del preventivo, che resta
 * «accettata»: la pagina continuava a offrire entrambi i pulsanti anche con «Vai alla commessa» accanto, e un secondo
 * clic creava una seconda commessa per la stessa vendita. Con la commessa già collegata i due pulsanti spariscono.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const finto = vi.hoisted(() => ({
  quote: {} as Record<string, unknown>,
  commessa: null as null | { id: string; order_code: string },
  invoke: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1", name: "Bianchi" } }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isAdmin: true, canEditOrders: true, canViewOrders: true, canEditPreventivi: true }),
}));
vi.mock("@/hooks/useSignatureActions", () => ({
  useSignatureActions: () => ({ sendForSignature: { mutateAsync: vi.fn(), isPending: false }, openWhatsApp: vi.fn(), copySignatureLink: vi.fn() }),
}));
vi.mock("@/components/marketing/preventivi/SendSignatureDialog", () => ({ SendSignatureDialog: (): null => null }));
vi.mock("@/components/marketing/preventivi/QuoteSignatureStatusCard", () => ({ QuoteSignatureStatusCard: (): null => null }));
vi.mock("@/components/marketing/preventivi/VersioniPreventivo", () => ({ VersioniPreventivo: (): null => null }));
vi.mock("@/components/orders/BloccaPrezzoCard", () => ({ BloccaPrezzoCard: (): null => null }));
vi.mock("@/integrations/supabase/client", () => {
  const costruttore = (tabella: string) => {
    const risposta = () => {
      if (tabella === "quotes") return { data: finto.quote, error: null as null };
      if (tabella === "orders") return { data: finto.commessa, error: null as null };
      if (tabella === "quote_versions") return { data: null as null, count: 0, error: null as null };
      return { data: [] as unknown[], error: null as null };
    };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order"]) b[m] = () => b;
    b.single = () => Promise.resolve(risposta());
    b.maybeSingle = () => Promise.resolve(risposta());
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(risposta()).then(ok, ko);
    return b;
  };
  return { supabase: { from: (t: string) => costruttore(t), functions: { invoke: finto.invoke } } };
});

import { toast } from "sonner";
import QuoteDetail from "@/pages/azienda/marketing/QuoteDetail";

afterEach(() => cleanup());
beforeEach(() => {
  finto.invoke.mockReset();
  finto.commessa = null;
  vi.mocked(toast.warning).mockClear();
  vi.mocked(toast.success).mockClear();
  finto.quote = {
    id: "q1", company_id: "c1", quote_number: "PRV-2026-0001", title: "Rifacimento facciata", status: "accettata", source: null,
    client_name: "Mario Rossi", client_email: "mario@example.it", subtotal: 10000, discount_amount: 0, vat_amount: 2200, total: 12200,
    created_at: "2026-10-01T08:00:00Z",
  };
});

function pagina() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/azienda/marketing/preventivi/q1"]}>
        <Routes>
          <Route path="/azienda/marketing/preventivi/:id" element={<QuoteDetail />} />
          <Route path="/azienda/ordini/:ordineId" element={<div>PAGINA DELLA COMMESSA</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("dettaglio preventivo accettato: una commessa sola", () => {
  it("senza commessa si offrono le due strade, e righe non copiate si dicono (non «successo»)", async () => {
    finto.invoke.mockResolvedValue({ data: { success: true, order_id: "o1", avviso: "Righe non copiate: boom" }, error: null });
    pagina();
    const converti = await screen.findByRole("button", { name: /Converti in Cantiere/ });
    expect(screen.getByRole("button", { name: /Crea commessa \(rivedi\)/ })).toBeTruthy();
    fireEvent.click(converti);
    await waitFor(() => expect(screen.getByText("PAGINA DELLA COMMESSA")).toBeTruthy());
    expect(toast.warning).toHaveBeenCalledWith("Commessa creata, ma non completa", expect.objectContaining({ description: "Righe non copiate: boom" }));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("con la commessa già collegata resta «Vai alla commessa»: né «Converti in Cantiere» né «Crea commessa (rivedi)»", async () => {
    finto.commessa = { id: "o1", order_code: "OC-2026-0007" };
    pagina();
    await screen.findByRole("button", { name: /Vai alla commessa/ });
    expect(screen.queryByRole("button", { name: /Converti in Cantiere/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Crea commessa \(rivedi\)/ })).toBeNull();
  });

  it("un preventivo ancora in bozza non offre nessuna delle due strade (com'era)", async () => {
    finto.quote = { ...finto.quote, status: "bozza" };
    pagina();
    await screen.findByText("PRV-2026-0001");
    expect(screen.queryByRole("button", { name: /Converti in Cantiere/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Crea commessa \(rivedi\)/ })).toBeNull();
  });
});
