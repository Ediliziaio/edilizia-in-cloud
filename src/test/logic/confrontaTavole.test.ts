import { describe, expect, it } from "vitest";
import { candidatiDaTavola, raggruppaConteggiTavola, riscontriTavolaObsoleti, type ConteggioTavola } from "@/lib/distinta/confrontaTavole";
import { generaDistinta } from "@/lib/distinta/generaDistinta";
import { verificaDelMateriale } from "@/lib/distinta/verificaAcquisto";
const c = (patch: Partial<ConteggioTavola> = {}): ConteggioTavola => ({ id: "c1", documento_id: "d1", documento_nome: "Pianta.pdf", pagina: 1,
  simbolo: "S1", descrizione_legenda: "Serramento A", quantita: 6, unita: "pz", phase_id: "infissi", locale: "A", confermato: true, updated_at: "2026-11-20T10:00:00Z", ...patch });
describe("Tavole come riscontro del fabbisogno", () => {
  it("somma 6+7 locali della stessa tavola, contando un ID ripetuto una sola volta", () => {
    expect(raggruppaConteggiTavola([c(), c(), c({ id: "c2", locale: "B", quantita: 7 })])).toMatchObject([{ quantita: 13, unita: "pz" }]);
  });
  it("mantiene come alternative PDF e DWG, pagine e revisioni dello stesso nome", () => {
    const gruppi = raggruppaConteggiTavola([c(), c({ id: "c2", documento_id: "d2", documento_nome: "Pianta.dwg" }), c({ id: "c3", pagina: 2 }),
      c({ id: "c4", documento_id: null, dettaglio: { _file_sha256: "hash1" } }), c({ id: "c5", documento_id: null, dettaglio: { _file_sha256: "hash2" } })]);
    expect(gruppi).toHaveLength(5); expect(gruppi.every(g => g.quantita === 6)).toBe(true);
  });
  it("esclude bozze, blocchi anonimi e quantità impossibili", () => {
    expect(raggruppaConteggiTavola([c({ confermato: false }), c({ descrizione_legenda: null, simbolo: "A$C123ABC" }), c({ quantita: NaN }), c({ quantita: -1 })])).toEqual([]);
    expect(generaDistinta({ voci: [], scomposizioni: [], conteggi: [{ ...c({ simbolo: "A$C123ABC", descrizione_legenda: null }) }] }).righe).toEqual([]);
  });
  it("propone corrispondenze per nome lasciando fuori altre fasi e le superfici", () => {
    const g = raggruppaConteggiTavola([c()])[0];
    const result = candidatiDaTavola(g, [{ id: "giusto", name: "Serramento A", unita_misura: "cad", phase_id: "infissi" },
      { id: "superficie", name: "Serramento A", unita_misura: "mq", phase_id: "infissi" }, { id: "altro", name: "Serramento A", unita_misura: "pz", phase_id: "altra" }]);
    expect(result).toMatchObject([{ materiale: { id: "giusto" }, esatto: true }]);
  });
  it("rileva fonte modificata, eliminata o non confermata senza invalidare lo storico", () => {
    const origine = { tipo: "planimetria", ruolo: "riscontro_quantita", conteggio_id: "c1", conteggio_versione: c().updated_at };
    expect(riscontriTavolaObsoleti([origine], [c()])).toBe(false);
    expect(riscontriTavolaObsoleti([origine], [])).toBe(true);
    expect(riscontriTavolaObsoleti([origine], [c({ confermato: false })])).toBe(true);
    expect(riscontriTavolaObsoleti([origine], [c({ updated_at: "2026-11-20T11:00:00Z" })])).toBe(true);
    expect(riscontriTavolaObsoleti([{ ...origine, ruolo: "riscontro_precedente" }], [])).toBe(false);
  });
  it("la conferma della quantità in tavola non approva le rese generiche già da verificare", () => {
    const materiale: Parameters<typeof verificaDelMateriale>[0] = { name: "Malta premiscelata", origini: [
      { tipo: "computo" as const, voce_id: "v1", codice: null, descrizione: "Intonaco", quantita_voce: 100, unita_voce: "mq", quantita: 20, fonte: "libreria_standard" as const },
      { tipo: "planimetria" as const, ruolo: "riscontro_quantita" as const, conteggio_id: "c1", documento_id: "d1", documento: "Pianta.pdf", locale: null, simbolo: "M", quantita_simbolo: 25, quantita: 25,
        verifica_acquisto: { stato: "confermata" as const, motivi: ["Quantità verificata"], campi_mancanti: [] } },
    ] };
    expect(verificaDelMateriale(materiale)?.stato).toBe("da_verificare");
  });
});
