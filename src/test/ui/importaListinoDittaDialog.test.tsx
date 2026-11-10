/**
 * «Carica listino» (lotto 7, 10/11/2026): un CSV si legge, le righe si abbinano, una si cambia a mano,
 * e si salva: prima le voci nuove della ditta, poi tutti i prezzi in un colpo con listino_ditta_salva.
 * Se i prezzi non entrano, le voci nuove si tolgono.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ImportaListinoDittaDialog } from "@/components/subappaltatori/ImportaListinoDittaDialog";

const finto = vi.hoisted(() => {
  const inseriti: Array<Record<string, unknown>> = [];
  const tolti: string[][] = [];
  type Esito = { data: unknown; error: { message: string } | null };
  const rpc = vi.fn(async (): Promise<Esito> => ({ data: { nuovi: 3, corretti: 0, chiusi: 0 }, error: null }));
  const from = () => ({
    insert: async (righe: Array<Record<string, unknown>>) => { inseriti.push(...righe); return { error: null as null }; },
    delete: () => ({ in: (_c: string, ids: string[]) => ({ eq: async () => { tolti.push(ids); return { error: null as null }; } }) }),
  });
  return { inseriti, tolti, rpc, from };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: finto.from, rpc: finto.rpc } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => { cleanup(); finto.inseriti.length = 0; finto.tolti.length = 0; finto.rpc.mockClear(); });

const voci: Array<{ id: string; nome: string; codice: string | null; unita: string; costo: number; subappaltatore_id: string | null; external_team_id: string | null }> = [
  { id: "t1", nome: "Intonaco civile", codice: "INT01", unita: "mq", costo: 15, subappaltatore_id: null, external_team_id: null },
  { id: "t2", nome: "Rasatura a gesso", codice: null, unita: "mq", costo: 8, subappaltatore_id: null, external_team_id: null },
];
const csv = "Codice;Descrizione;UM;Prezzo\nINT01;Intonaco civile;mq;14\n;Rasatura a gesso;mq;0,5\n;Punto luce;pz;38\n";

function apri() {
  const fatto = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ImportaListinoDittaDialog companyId="az" anagraficaId="rossi" nomeDitta="Rossi srl" voci={voci} validoDal="2026-11-10" onChiudi={vi.fn()} onFatto={fatto} />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("File del listino"), { target: { files: [new File([csv], "listino.csv", { type: "text/csv" })] } });
  return fatto;
}

describe("Carica il listino della ditta", () => {
  it("legge il CSV, propone, la riga fuori scala resta fuori; si carica con voci nuove e prezzi insieme", async () => {
    const fatto = apri();
    expect((await screen.findByRole("status")).textContent).toMatch(/1 su voci del listino · 1 voce nuova della ditta · 1 riga fuori/);
    expect(screen.getByText(/fuori scala/)).toBeInTheDocument();
    // La rasatura a 0,50 è un errore del file: qui la si lascia fuori, il resto si carica.
    fireEvent.click(screen.getByRole("button", { name: "Carica 2 prezzi" }));
    await waitFor(() => expect(finto.rpc).toHaveBeenCalled());
    expect(finto.inseriti).toHaveLength(1);
    expect(finto.inseriti[0]).toMatchObject({ company_id: "az", nome: "Punto luce", unita: "pz", unita_fatturazione: "pz", prezzo_costo: 38, subappaltatore_id: "rossi" });
    expect(finto.rpc).toHaveBeenCalledWith("listino_ditta_salva", {
      p_subappaltatore: "rossi", p_valido_dal: "2026-11-10",
      p_righe: [{ tariffa_id: "t1", costo: 14 }, { tariffa_id: finto.inseriti[0].id, costo: 38 }],
    });
    await waitFor(() => expect(fatto).toHaveBeenCalled());
  });

  it("una riga si cambia a mano; se i prezzi non entrano le voci nuove si tolgono", async () => {
    finto.rpc.mockResolvedValueOnce({ data: null, error: { message: "permesso negato" } });
    const fatto = apri();
    const scelta = await screen.findByRole("combobox", { name: "Dove va la riga 3" });
    fireEvent.change(scelta, { target: { value: "v:t2" } });
    fireEvent.click(screen.getByRole("button", { name: "Carica 3 prezzi" }));
    await waitFor(() => expect(finto.tolti).toHaveLength(1));
    expect(finto.tolti[0]).toEqual([finto.inseriti[0].id]);
    expect(fatto).not.toHaveBeenCalled();
  });
});
