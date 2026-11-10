import { beforeEach, describe, expect, it, vi } from "vitest";
import { scriviMisureAtomiche } from "@/lib/planimetrie/aggiornaMisureAtomiche";
import type { ConfrontoRiga } from "@/lib/planimetrie/computo";
import type { VoceComputo } from "@/lib/computo/alberoComputo";
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc } }));
const c = { misura: { id: "m1", voceId: "v1", planimetriaId: "p1", versione: 1, chiavi: ["bagno.pavimento"] }, vecchia: 5, nuova: 7, differenza: 2 } as ConfrontoRiga;
const v = { id: "v1", quantita: 10, prezzo_unitario_computo: 4 } as VoceComputo;
beforeEach(() => { vi.clearAllMocks(); mock.rpc.mockResolvedValue({ data: { righe: 1, voci: 1 }, error: null }); });
describe("Aggiornamento indivisibile del computo esistente", () => {
  it("invia righe, versioni e prezzi attesi in una singola operazione", async () => {
    await scriviMisureAtomiche("k1", [c], 3, new Map([[v.id, v]]));
    expect(mock.rpc).toHaveBeenCalledOnce();
    expect(mock.rpc).toHaveBeenCalledWith("planimetria_aggiorna_misure_computo", { p_upload_id: "k1", p_voci: [{ id: "v1", quantita: 10, prezzo: 4 }], p_righe: [{ id: "m1", voce_id: "v1", vecchia: 5, nuova: 7, vecchia_pianta: "p1", vecchia_versione: 1, pianta_id: "p1", versione: 3, chiavi: ["bagno.pavimento"] }] });
  });
  it("se una voce è sparita non inizia l'aggiornamento", async () => {
    await expect(scriviMisureAtomiche("k1", [c], 3, new Map())).rejects.toThrow(/voce/);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("propaga il conflitto senza provare una seconda scrittura", async () => {
    mock.rpc.mockResolvedValue({ error: { code: "40001", message: "Una misura è cambiata nel frattempo." } });
    await expect(scriviMisureAtomiche("k1", [c], 3, new Map([[v.id, v]]))).rejects.toThrow(/cambiata/);
    expect(mock.rpc).toHaveBeenCalledOnce();
  });
});
