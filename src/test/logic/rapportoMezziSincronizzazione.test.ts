import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RapportoInCoda } from "@/lib/campo/rapportoInCoda";

const { leggi, inserisci, salvaMezzi } = vi.hoisted(() => ({
  leggi: vi.fn(), inserisci: vi.fn(), salvaMezzi: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => {
        const filtri = { eq: () => filtri, maybeSingle: leggi };
        return filtri;
      },
      insert: inserisci,
    }),
    rpc: salvaMezzi,
  },
}));
vi.mock("@/lib/campo/rapportinoAssignment", () => ({ hasRapportinoAssignment: async () => true }));

const { inviaRapportoInCoda } = await import("@/lib/campo/rapportoInCoda");
const rapporto: RapportoInCoda = {
  company_id: "azienda", order_id: "commessa", user_id: "operaio", roleType: "employee", giorno: "2026-11-22",
  campi: {}, allegati: [],
  mezzi: [{ mezzo_id: "escavatore", usato: true, ore_lavorate: 6.25 }, { mezzo_id: "carotatrice", dove: "magazzino" }],
};
const idInvio = "rapporto-1";

beforeEach(() => {
  vi.resetAllMocks();
  inserisci.mockReturnValue({ select: () => ({ maybeSingle: async () => ({ data: { id: idInvio }, error: null as null }) }) });
  leggi.mockResolvedValue({ data: null, error: null as null });
});

describe("Ricevuta delle rilevazioni dei mezzi", () => {
  it("segnala una registrazione parziale quando un’attrezzatura è stata riassegnata prima della sincronizzazione", async () => {
    salvaMezzi.mockResolvedValue({ data: 1, error: null as null });
    const risultato = await inviaRapportoInCoda(rapporto, idInvio);
    expect(risultato).toMatchObject({ id: idInvio, avvisoMezzi: true });
    expect(inserisci).toHaveBeenCalledTimes(1);
  });

  it("dopo una risposta interrotta completa le rilevazioni su quello stesso rapportino", async () => {
    salvaMezzi.mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValueOnce({ data: 2, error: null as null });
    await expect(inviaRapportoInCoda(rapporto, idInvio)).rejects.toThrow("Failed to fetch");
    leggi.mockResolvedValue({ data: { invio_operazione_id: idInvio, stato: "inviato" }, error: null as null });
    await expect(inviaRapportoInCoda(rapporto, idInvio)).resolves.toMatchObject({ id: idInvio, avvisoMezzi: false });
    expect(inserisci).toHaveBeenCalledTimes(1);
    expect(salvaMezzi.mock.calls).toEqual(Array.from({ length: 2 }, () => [
      "campo_mezzi_fine_giornata", {
        p_order_id: "commessa", p_giorno: "2026-11-22", p_righe: rapporto.mezzi, p_rapportino_id: idInvio,
      },
    ]));
  });
});
