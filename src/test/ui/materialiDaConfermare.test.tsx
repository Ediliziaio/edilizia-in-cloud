/**
 * I materiali proposti dal computo (17/11/2026): una riga nella pagina, la scelta in un popup per
 * fasi; «Inserisci» manda solo quelli spuntati, «Scarta» quelli senza spunta.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (f: string, a: unknown) => rpc(f, a) } }));
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
});
