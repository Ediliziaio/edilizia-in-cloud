import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { VoceComputo } from "@/lib/computo/alberoComputo";
const stato = vi.hoisted(() => ({ patch: {} as Record<string, unknown>, filtri: [] as unknown[], righe: [{ id: "v1" }] as unknown[], inserimenti: [] as unknown[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({
  update: (patch: Record<string, unknown>) => {
    stato.patch = patch;
    const q = { eq: (k: string, v: unknown) => { stato.filtri.push([k, v]); return q; },
      is: (k: string, v: unknown) => { stato.filtri.push([k, v]); return q; },
      select: async () => ({ data: stato.righe, error: null }) };
    return q;
  },
  insert: async (patch: unknown) => { stato.inserimenti.push(patch); return { error: null }; },
}) } }));
import { VociComputoEditor } from "@/components/orders/materiali/VociComputoEditor";
const v = { id: "v1", ordine: 1, numero_ordine: "1", descrizione_breve: "Cavo elettrico", quantita: 10, unita_misura: "m",
  prezzo_unitario_computo: null, categoria: "Elettrico", codice_tariffa: null, codice_voce: null, misure: [], warnings: [] } as unknown as VoceComputo;
const salvata = vi.fn(), bozza = vi.fn();
function mostra(puoModificare = true) {
  return render(<QueryClientProvider client={new QueryClient()}><VociComputoEditor voci={[v]} computoId="computo"
    companyId="azienda" puoModificare={puoModificare} mostraPrezzi onMostraTutte={() => {}} onSalvata={salvata} onBozza={bozza} /></QueryClientProvider>);
}
beforeEach(() => { stato.patch = {}; stato.filtri = []; stato.righe = [{ id: "v1" }]; stato.inserimenti = []; salvata.mockReset(); bozza.mockReset(); });
it("salva una correzione con virgola soltanto nella voce e nel computo mostrati", async () => {
  mostra(); fireEvent.click(screen.getByRole("button", { name: "Modifica voce 1" }));
  fireEvent.change(screen.getByLabelText("Quantità della voce"), { target: { value: "12,5" } });
  fireEvent.click(screen.getByRole("button", { name: "Salva voce e ricalcola" }));
  await waitFor(() => expect(salvata).toHaveBeenCalledOnce());
  expect(stato.patch).toMatchObject({ quantita: 12.5, prezzo_unitario_computo: null, importo_computo: null });
  expect(stato.filtri).toEqual(expect.arrayContaining([["id", "v1"], ["company_id", "azienda"], ["computo_upload_id", "computo"], ["quantita", 10]]));
});
it("una modifica concorrente lascia il form aperto e non dichiara il salvataggio", async () => {
  stato.righe = []; mostra();
  fireEvent.click(screen.getByRole("button", { name: "Modifica voce 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Salva voce e ricalcola" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/un'altra sessione/);
  expect(salvata).not.toHaveBeenCalled();
});
it("aggiunge una voce senza inventare il prezzo", async () => {
  mostra(); fireEvent.click(screen.getByRole("button", { name: "Aggiungi voce" }));
  fireEvent.change(screen.getByLabelText("Descrizione della voce"), { target: { value: "Canalina" } });
  fireEvent.change(screen.getByLabelText("Unità della voce"), { target: { value: "m" } });
  fireEvent.change(screen.getByLabelText("Quantità della voce"), { target: { value: "25" } });
  fireEvent.click(screen.getByRole("button", { name: "Salva voce e ricalcola" }));
  await waitFor(() => expect(salvata).toHaveBeenCalledOnce());
  expect(stato.inserimenti[0]).toMatchObject({ company_id: "azienda", computo_upload_id: "computo", quantita: 25, prezzo_unitario_computo: null, is_modified: true });
});
it("il computo contrattuale non offre correzioni senza sblocco", () => {
  mostra(false);
  expect(screen.queryByRole("button", { name: "Aggiungi voce" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Modifica voce 1" })).toBeNull();
});
