import { describe, expect, it } from "vitest";
import { leggiJson, messaggioVoci, pulisciScomposizioni, scomposizioniComplete } from "../../../supabase/functions/_shared/distintaAI";
import { contractAnalysisHint } from "@/lib/orders/contractPreparation";
import { REGOLA_VOCI, RILEGGI_VOCI } from "@/lib/orders/avvisiContratto";
import { fondiProposte } from "@/lib/distinta/faseProposta";

describe("qualità delle proposte materiali", () => {
  it("una risposta JSON valida che omette una voce non è una distinta completa", () => {
    const p = pulisciScomposizioni(leggiJson('{"scomposizioni":[{"voce_id":"a","stato":"senza_materiali","componenti":[]}]}'), ["a", "b"]);
    expect(scomposizioniComplete(p, ["a", "b"])).toBe(false);
  });
  it("componenti invalidi non diventano «non servono materiali»", () => {
    const [p] = pulisciScomposizioni({ scomposizioni: [{ voce_id: "a", componenti: [{ descrizione: "Malta", quantita_per_unita: 20, unita_misura: "banana" }] }] }, ["a"]);
    expect(p.stato).toBe("dati_mancanti"); expect(p.componenti).toEqual([]); expect(p.dati_mancanti.length).toBeGreaterThan(0);
  });
  it("distingue una resa stimata, una voce senza materiali e una voce che richiede uno spessore", () => {
    const pp = pulisciScomposizioni({ scomposizioni: [
      { voce_id: "a", stato: "proposta", tipo_quantita: "stima_tecnica", componenti: [{ descrizione: "Malta", quantita_per_unita: 20, unita_misura: "kg" }] },
      { voce_id: "b", stato: "senza_materiali", componenti: [] },
      { voce_id: "c", stato: "dati_mancanti", componenti: [], dati_mancanti: ["Spessore del rinforzo"] },
    ] }, ["a", "b", "c"]);
    expect(pp.map(p => p.stato)).toEqual(["proposta", "senza_materiali", "dati_mancanti"]);
    expect(pp[0].tipo_quantita).toBe("stima_tecnica"); expect(pp[2].dati_mancanti).toContain("Spessore del rinforzo");
  });
  it("unità mancante resta mancante nel messaggio inviato al modello", () => {
    expect(messaggioVoci([{ id: "a", descrizione_breve: "Rinforzo strutturale" }])).toContain("unità: MANCANTE");
  });
  it("una nota lunga non elimina la regola delle voci o quella della rilettura", () => {
    for (const regola of [REGOLA_VOCI, RILEGGI_VOCI]) {
      for (const azienda of ["Azienda di prova", "Demo Azienda 2 S.r.l.", "Impresa ".repeat(20)]) {
        const hint = contractAnalysisHint(azienda, "Nota ".repeat(200), regola);
        expect(hint.length).toBeLessThanOrEqual(600); expect(hint).toContain(regola);
      }
    }
  });
  it("una proposta di fase con bassa confidenza non cambia la selezione dell'utente", () => {
    const base = { Generico: "senza" };
    expect(fondiProposte(base, [{ capitolo: "Generico", phase_id: "id-casuale", nuova_fase: null, motivo: "Incerto", confidenza: 0.2 }], new Set(), {})).toEqual(base);
  });
});
