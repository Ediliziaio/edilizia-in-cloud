/**
 * Dettaglio preventivo accettato (06/10/2026): una commessa sola per preventivo.
 *
 * «Converti in Cantiere» (edge function) rifiuta un preventivo che ha già la commessa, ma la strada «Crea commessa
 * (rivedi)» (Nuova commessa con ?quote_id) non controlla niente e non cambia lo stato del preventivo, che resta
 * «accettata»: la pagina continuava a offrire entrambi i pulsanti anche con «Vai alla commessa» accanto, e un secondo
 * clic creava una seconda commessa per la stessa vendita. Con la commessa già collegata i due pulsanti spariscono.
 *
 * 07/10/2026: la guardia leggeva la commessa collegata da una copia in cache che l'app tiene fresca 5 minuti
 * (DEFAULT_QUERY_STALE_TIME_MS di App.tsx), e nessuno la invalidava: tornando sul preventivo entro 5 minuti dopo la
 * «rivedi» si rivedevano i due pulsanti. Le prove usano un client con lo staleTime VERO dell'app (5 minuti): con lo
 * staleTime di prova (0) ogni apertura rilegge comunque e il buco non si vede.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const finto = vi.hoisted(() => ({
  quote: {} as Record<string, unknown>,
  commessa: null as null | { id: string; order_code: string },
  /** Se c'è, la lettura della commessa collegata aspetta che si risolva (per vedere la pagina «durante il controllo»). */
  attesaOrdini: null as null | Promise<void>,
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
    const quando = () => (tabella === "orders" && finto.attesaOrdini ? finto.attesaOrdini : Promise.resolve());
    b.single = () => quando().then(risposta);
    b.maybeSingle = () => quando().then(risposta);
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => quando().then(risposta).then(ok, ko);
    return b;
  };
  return { supabase: { from: (t: string) => costruttore(t), functions: { invoke: finto.invoke } } };
});

import { toast } from "sonner";
import QuoteDetail from "@/pages/azienda/marketing/QuoteDetail";
import { queryKeys } from "@/lib/queryKeys";

afterEach(() => cleanup());
beforeEach(() => {
  finto.invoke.mockReset();
  finto.commessa = null;
  finto.attesaOrdini = null;
  vi.mocked(toast.warning).mockClear();
  vi.mocked(toast.success).mockClear();
  finto.quote = {
    id: "q1", company_id: "c1", quote_number: "PRV-2026-0001", title: "Rifacimento facciata", status: "accettata", source: null,
    client_name: "Mario Rossi", client_email: "mario@example.it", subtotal: 10000, discount_amount: 0, vat_amount: 2200, total: 12200,
    created_at: "2026-10-01T08:00:00Z",
  };
});

/** Come nell'app sul web (DEFAULT_QUERY_STALE_TIME_MS di App.tsx): una copia in cache vale 5 minuti. */
const clientComeApp = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } } });

function pagina(client: QueryClient = clientComeApp()) {
  return render(
    <QueryClientProvider client={client}>
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
    await waitFor(() => expect(converti).toBeEnabled()); // finito il controllo «c'è già una commessa?»
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

  it("la commessa nata mentre la pagina era chiusa («rivedi», un collega): riaprendola entro 5 minuti i pulsanti non tornano", async () => {
    const client = clientComeApp();
    const prima = pagina(client);
    await screen.findByRole("button", { name: /Crea commessa \(rivedi\)/ }); // ancora nessuna commessa: le due strade
    prima.unmount();
    // «Crea commessa (rivedi)» scrive il legame sulla commessa e non cambia lo stato del preventivo (resta «accettata»)
    finto.commessa = { id: "o9", order_code: "OC-2026-0009" };
    pagina(client); // stessa cache dell'app, ancora «fresca» (5 minuti)
    await screen.findByRole("button", { name: /Vai alla commessa/ });
    expect(screen.queryByRole("button", { name: /Converti in Cantiere/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Crea commessa \(rivedi\)/ })).toBeNull();
  });

  it("mentre si controlla se la commessa c'è già (copia vecchia in cache) le due strade sono spente", async () => {
    const client = clientComeApp();
    const prima = pagina(client);
    await screen.findByRole("button", { name: /Crea commessa \(rivedi\)/ });
    prima.unmount();
    let rilascia!: () => void;
    finto.attesaOrdini = new Promise<void>((ok) => { rilascia = ok; });
    pagina(client);
    const rivedi = await screen.findByRole("button", { name: /Crea commessa \(rivedi\)/ });
    expect(rivedi).toBeDisabled();
    expect(screen.getByRole("button", { name: /Converti in Cantiere/ })).toBeDisabled();
    finto.commessa = { id: "o9", order_code: "OC-2026-0009" };
    rilascia();
    await screen.findByRole("button", { name: /Vai alla commessa/ });
    expect(screen.queryByRole("button", { name: /Crea commessa \(rivedi\)/ })).toBeNull();
  });

  it("senza commessa, finito il controllo le due strade si accendono", async () => {
    pagina();
    const rivedi = await screen.findByRole("button", { name: /Crea commessa \(rivedi\)/ });
    await waitFor(() => expect(rivedi).toBeEnabled());
    expect(screen.getByRole("button", { name: /Converti in Cantiere/ })).toBeEnabled();
  });

  it("dopo «Converti in Cantiere» la pagina dice anche alla commessa collegata di rileggersi", async () => {
    finto.invoke.mockResolvedValue({ data: { success: true, order_id: "o1", avviso: null }, error: null });
    const client = clientComeApp();
    const spia = vi.spyOn(client, "invalidateQueries");
    pagina(client);
    const converti = await screen.findByRole("button", { name: /Converti in Cantiere/ });
    await waitFor(() => expect(converti).toBeEnabled());
    fireEvent.click(converti);
    await waitFor(() => expect(screen.getByText("PAGINA DELLA COMMESSA")).toBeTruthy());
    expect(spia).toHaveBeenCalledWith({ queryKey: queryKeys.quotes.linkedOrder("q1") });
  });

  it("un preventivo ancora in bozza non offre nessuna delle due strade (com'era)", async () => {
    finto.quote = { ...finto.quote, status: "bozza" };
    pagina();
    await screen.findByText("PRV-2026-0001");
    expect(screen.queryByRole("button", { name: /Converti in Cantiere/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Crea commessa \(rivedi\)/ })).toBeNull();
  });
});
