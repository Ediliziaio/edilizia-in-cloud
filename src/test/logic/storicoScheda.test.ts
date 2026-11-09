import { describe, expect, it, vi } from "vitest";
import { storicoSenzaDoppioni, type MessaggioStorico } from "@/lib/email/storicoScheda";
import { eventiCommittente } from "@/lib/appalto/diarioCommittente";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const email = (ref_id: string, direzione: string, oggetto: string, ts: string): MessaggioStorico =>
  ({ canale: "email", direzione, controparte: "a@b.invalid", oggetto, testo: "x", ts, ref_id });

describe("lo storico condiviso", () => {
  it("non ripete l'email ricevuta che chi guarda ha già nella sua casella", () => {
    const m = [email("e1", "in", "Rendiconto", "2026-11-05T10:00:00Z"), email("e2", "in", "Altro", "2026-11-05T11:00:00Z")];
    expect(storicoSenzaDoppioni(m, [{ id: "e1", subject: "Rendiconto", received_at: "2026-11-05T10:00:00Z" }]).map((x) => x.ref_id)).toEqual(["e2"]);
  });

  it("non ripete la copia dell'email che ho mandato io, ma la mostra a un collega", () => {
    const m = [email("o1", "out", "Contratto 2026", "2026-11-05T10:00:00Z")];
    expect(storicoSenzaDoppioni(m, [{ id: "c1", subject: " contratto 2026 ", received_at: "2026-11-05T10:01:00Z" }])).toEqual([]);
    expect(storicoSenzaDoppioni(m, [])).toHaveLength(1);
  });

  it("due email con lo stesso oggetto in giorni diversi restano due", () => {
    const m = [email("o1", "out", "Sollecito", "2026-11-05T10:00:00Z")];
    expect(storicoSenzaDoppioni(m, [{ id: "c1", subject: "Sollecito", received_at: "2026-10-01T10:00:00Z" }])).toHaveLength(1);
  });

  it("la stessa risposta arrivata a due colleghi è una riga sola", () => {
    const m = [email("e1", "in", "Re: Listino", "2026-11-05T10:00:00Z"), email("e2", "in", "Re: Listino", "2026-11-05T10:00:00Z")];
    expect(storicoSenzaDoppioni(m, [])).toHaveLength(1);
  });

  it("WhatsApp e SMS non si toccano", () => {
    const m: MessaggioStorico[] = [{ canale: "whatsapp", direzione: "out", oggetto: null, testo: "ciao", ts: "2026-11-05T10:00:00Z", ref_id: "e1" }];
    expect(storicoSenzaDoppioni(m, [{ id: "e1", subject: null, received_at: "2026-11-05T10:00:00Z" }])).toHaveLength(1);
  });
});

describe("il diario del committente", () => {
  const apri = vi.fn();
  const rendiconto = { id: "s", numero: 3, periodo_dal: "2026-10-01", periodo_al: "2026-10-31", accettato_da_nome: null as string | null };

  it("un rendiconto in bozza non è ancora successo", () => {
    expect(eventiCommittente([], [{ ...rendiconto, inviato_at: null, accettato_il: null }], apri)).toEqual([]);
  });

  it("racconta contratto, invio e accettazione, e apre il pannello giusto", () => {
    const eventi = eventiCommittente(
      [{ id: "c", nome: "Accordo 2026", valido_dal: "2026-01-01", created_at: "2026-01-02T09:00:00Z" }],
      [{ ...rendiconto, inviato_at: "2026-11-01T09:00:00Z", accettato_il: "2026-11-03", accettato_da_nome: "Rossi" }],
      apri,
    );
    expect(eventi.map((e) => e.titolo)).toEqual(["Contratto: Accordo 2026", "Rendiconto N. 3 mandato", "Rendiconto N. 3 accettato"]);
    expect(eventi[2].descrizione).toBe("Da Rossi");
    eventi[1].onClick?.();
    expect(apri).toHaveBeenCalledWith("rendiconti");
  });
});
