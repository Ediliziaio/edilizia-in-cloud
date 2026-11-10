import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { azioniCommittente, type NumeriCommittente } from "@/lib/appalto/numeriScheda";

const numeri = (x: Partial<NumeriCommittente> = {}): NumeriCommittente => ({
  rendicontato: 0, da_rendicontare: 0, da_fatturare: 0, ritenute: 0, da_incassare: 0, scaduto: 0, scaduto_giorni: null,
  rendiconti_in_attesa: 0, rendiconto_fermo_numero: null, rendiconto_fermo_giorni: null, ...x,
});
const contratto = { nome: "Accordo", valido_al: null as string | null };

describe("cosa fare adesso col committente", () => {
  const tipi = (n: NumeriCommittente | null, c: typeof contratto | null = contratto, oggi = "2026-11-09") => azioniCommittente(n, c, oggi, true).map((a) => a.tipo);

  it("niente da fare, niente riga", () => expect(tipi(numeri())).toEqual([]));

  it("prima lo scaduto, poi i rendiconti", () => {
    expect(tipi(numeri({ scaduto: 100, scaduto_giorni: 3, da_rendicontare: 50, rendiconto_fermo_numero: 2, rendiconto_fermo_giorni: 8 })))
      .toEqual(["sollecito", "da_rendicontare", "rendiconto_fermo"]);
  });

  it("un rendiconto mandato da poco non va richiamato", () => {
    expect(tipi(numeri({ rendiconto_fermo_numero: 2, rendiconto_fermo_giorni: 6 }))).toEqual([]);
  });

  it("senza contratto o vicino alla scadenza lo dice, se è lontano no", () => {
    expect(tipi(numeri(), null)).toEqual(["contratto"]);
    expect(tipi(numeri(), { nome: "A", valido_al: "2026-11-30" })).toEqual(["contratto"]);
    expect(tipi(numeri(), { nome: "A", valido_al: "2027-06-30" })).toEqual([]);
    const scaduto = azioniCommittente(numeri(), { nome: "A", valido_al: "2026-11-08" }, "2026-11-09", true)[0];
    expect(scaduto).toEqual({ tipo: "contratto", testo: "Il contratto «A» è scaduto da 1 giorno" });
  });

  it("un contratto spento non dice «scaduto da N giorni» per sempre", () => {
    const a = azioniCommittente(numeri(), { nome: "A", valido_al: "2025-01-01", attivo: false }, "2026-11-09", true);
    expect(a).toEqual([{ tipo: "contratto", testo: "Nessun contratto in corso: quelli che ci sono sono spenti" }]);
  });

  it("finché i contratti non sono letti non dice che mancano", () => {
    expect(azioniCommittente(numeri(), null, "2026-11-09", false)).toEqual([]);
  });

  it("senza numeri (permesso sugli importi) non sollecita", () => {
    expect(tipi(null)).toEqual([]);
  });
});

describe("la funzione dei numeri", () => {
  const sql = readFileSync("supabase/migrations/20290131130000_scheda_committente_numeri.sql", "utf8");
  it("legge coi permessi di chi guarda e chiude anon", () => {
    expect(sql).toMatch(/security invoker/);
    expect(sql).toMatch(/can_view_order_amounts/);
    expect(sql).toMatch(/revoke all on function public\.scheda_committente_numeri\(uuid, uuid\) from public, anon/);
  });
  it("una bozza non conta fra i rendiconti chiusi", () => {
    expect(sql).toMatch(/s\.stato <> ''bozza''/);
  });
});
