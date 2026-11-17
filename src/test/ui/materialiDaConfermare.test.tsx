/**
 * I materiali proposti dal computo (17/11/2026): una riga nella pagina, la scelta in un popup per
 * fasi; «Inserisci» manda solo quelli spuntati, «Scarta» quelli senza spunta.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const aggiorna = vi.fn();
// Le letture della finestra (chi fa le fasi, le ditte) e la scrittura di «chi la fa» sulla fase.
const catena = (tabella: string) => {
  const c: Record<string, unknown> = {};
  const fine = async () => ({
    data: tabella === "subappaltatori" ? [{ id: "d1", ragione_sociale: "Idraulica Prova" }]
      : tabella === "orders" ? { company_id: "az1" } : tabella === "order_work_phases" ? [{ id: "f1", esecuzione: null as string | null }, { id: "f2", esecuzione: null as string | null }] : [],
    error: null as unknown,
  });
  Object.assign(c, {
    select: (): unknown => c, eq: (): unknown => c, order: fine, maybeSingle: fine,
    then: (r: (v: unknown) => unknown) => fine().then(r),
    update: (v: unknown): unknown => {
      aggiorna(tabella, v);
      return { eq: (_k: string, id: string) => ({ select: async (): Promise<{ data: { id: string }[]; error: null }> => ({ data: [{ id }], error: null }) }) };
    },
  });
  return c;
};
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (f: string, a: unknown) => rpc(f, a), from: (t: string) => catena(t) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MaterialiDaConfermare, type MaterialeProposto } from "@/components/orders/materiali/MaterialiDaConfermare";

const proposte: (MaterialeProposto & { origini: unknown[] })[] = [
  { id: "p1", chiave: "k1", phase_id: "f1", descrizione: "Pannello isolante per cappotto", specifiche: null, quantita: 120, unita_misura: "mq", supplier_id: null, fornitore: null, consigliata: true, origine: "computo", origini: [] },
  { id: "p2", chiave: "k2", phase_id: "f1", descrizione: "Tasselli a percussione", specifiche: null, quantita: 600, unita_misura: "pz", supplier_id: null, fornitore: null, consigliata: false, origine: "computo", origini: [] },
  { id: "p3", chiave: "k3", phase_id: "f2", descrizione: "Ventilconvettore a parete", specifiche: null, quantita: 4, unita_misura: "pz", supplier_id: "s1", fornitore: "Termo Srl", consigliata: true, origine: "computo", origini: [] },
];
const fasi = [{ id: "f1", nome: "Cappotto" }, { id: "f2", nome: "Impianto termico" }];

function Pagina() {
  const [aperto, setAperto] = useState(false);
  return <MaterialiDaConfermare orderId="o1" fasi={fasi} aperto={aperto} onAperto={setAperto} />;
}
const monta = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Pagina /></QueryClientProvider>);

describe("Materiali dal computo da confermare", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockImplementation(async (f: string) => {
      if (f === "materiali_proposti_elenco") return { data: proposte, error: null };
      if (f === "materiali_proposti_conferma") return { data: { inserite: 2, confermate: 2 }, error: null };
      if (f === "materiali_proposti_scarta") return { data: 1, error: null };
      if (f === "commessa_assegna_subappaltatore") return { data: "a1", error: null };
      return { data: null, error: null };
    });
  });

  it("una riga nella pagina, la scelta nel popup per fasi; si inseriscono solo gli spuntati", async () => {
    monta();
    expect(await screen.findByText("Dal computo: 3 materiali da confermare")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scegli e inserisci" }));
    const finestra = await screen.findByRole("dialog");
    // La prima fase: la proposta dell'AI parte senza spunta.
    expect(within(finestra).getByText("1 su 2 da inserire")).toBeInTheDocument();
    expect(within(finestra).getByRole("checkbox", { name: "Seleziona Tasselli a percussione" })).not.toBeChecked();
    fireEvent.click(within(finestra).getByRole("button", { name: /Impianto termico/ }));
    expect(within(finestra).getByText("Termo Srl")).toBeInTheDocument();
    fireEvent.click(within(finestra).getByRole("button", { name: "Inserisci 2 negli articoli" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("materiali_proposti_conferma", { p_order: "o1", p_ids: ["p1", "p3"] }));
  });

  it("«Scarta» manda solo quelli senza spunta", async () => {
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "Scegli e inserisci" }));
    const finestra = await screen.findByRole("dialog");
    fireEvent.click(within(finestra).getByRole("button", { name: "Scarta quello non spuntato" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("materiali_proposti_scarta", { p_order: "o1", p_ids: ["p2"] }));
  });

  it("una fase data alla ditta chiavi in mano non compra niente: ditta col costo previsto, materiali scartati col motivo", async () => {
    aggiorna.mockReset();
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "Scegli e inserisci" }));
    const finestra = await screen.findByRole("dialog");
    fireEvent.click(within(finestra).getByRole("button", { name: /Impianto termico/ }));
    fireEvent.click(within(finestra).getByRole("radio", { name: "Ditta chiavi in mano" }));
    expect(within(finestra).getByText(/Niente da comprare/)).toBeInTheDocument();
    fireEvent.change(await within(finestra).findByRole("combobox", { name: /Ditta della fase/ }), { target: { value: "d1" } });
    fireEvent.change(within(finestra).getByRole("textbox", { name: /Costo previsto della ditta/ }), { target: { value: "5.200,00" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Inserisci 1 negli articoli · 1 fase alla ditta" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("materiali_proposti_conferma", { p_order: "o1", p_ids: ["p1"] }));
    expect(aggiorna).toHaveBeenCalledWith("order_work_phases", { esecuzione: "subappalto_fornitura_posa" });
    expect(rpc).toHaveBeenCalledWith("commessa_assegna_subappaltatore", expect.objectContaining({ p_subappaltatore_id: "d1", p_phase_id: "f2", p_cost_preventivo: 5200 }));
    expect(rpc).toHaveBeenCalledWith("materiali_proposti_scarta", { p_order: "o1", p_ids: ["p3"], p_motivo: expect.stringContaining("chiavi in mano") });
  });
});
