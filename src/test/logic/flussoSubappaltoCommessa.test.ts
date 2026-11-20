import { describe, expect, it } from "vitest";
import { computoCorrenteSubappalto, costiFlussoSubappalto, type ContrattoFlusso, type VarianteFlusso } from "@/lib/subappaltatori/flussoCommessa";
import type { SalPerRiepilogo } from "@/lib/subappaltatori/riconciliazioneContratto";

const contratto: ContrattoFlusso = {
  id: "c", subappaltatore_id: "sicurezza", numero_contratto: "ORD-12/S01", descrizione_lavori: "Intonaci",
  stato: "attivo", firmato_il: "2026-11-01", importo_contrattuale: 1200, oneri_sicurezza: 100, ritenuta_garanzia_pct: 5,
  data_inizio: null, data_fine_prevista: null,
  elenco_lavori: [{ fase: "Finiture", fase_id: "f", sottofase: "Intonaci", sottofase_id: "s", descrizione: "Intonaco civile", unita: "mq", quantita: 100, prezzo: 10, importo: 1000, voce_id: "v", affidamento_id: "a", comprende: "posa", prezzo_vendita: 99, margine: 8900 }],
};
const variante = (id: string, prima: number, dopo: number, oneriPrima = 100, oneriDopo = 100): VarianteFlusso => ({
  id, importo_prima: prima, importo_dopo: dopo, oneri_prima: oneriPrima, oneri_dopo: oneriDopo, motivo: "Variazione quantità", created_at: "2026-11-15T10:00:00Z",
});
const sal = (stato: string, lordo: number, extra: Partial<SalPerRiepilogo> = {}): SalPerRiepilogo => ({ stato, importo_lordo: lordo, importo_netto: lordo * 0.95, ritenuta_importo: lordo * 0.05, ...extra });

describe("flusso del subappalto nella commessa", () => {
  it("varianti positive e negative sono già nel costo attuale, inclusi gli oneri", () => {
    const righe = [variante("z", 1000, 1250, 50, 100), variante("a", 1250, 1200)];
    const r = costiFlussoSubappalto(contratto, righe, []);
    expect(r).toMatchObject({ attuale: 1300, iniziale: 1050, variazione: 250, inBozza: false });
    expect(costiFlussoSubappalto(contratto, [...righe].reverse(), [])).toEqual(r);
  });
  it("non confonde SAL da verificare, approvati, contestati e pagamenti parziali o zero esplicito", () => {
    const r = costiFlussoSubappalto(contratto, [], [sal("ricevuto", 100), sal("verificato", 200, { pagato_registrato: 50 }), sal("pagato", 300), sal("pagato", 100, { pagato_registrato: 0 }), sal("contestato", 999, { pagato_registrato: 999 })]);
    expect(r).toMatchObject({ approvato: 600, daVerificare: 100, pagato: 335, daPagareApprovato: 235 });
    expect(costiFlussoSubappalto({ ...contratto, stato: "bozza", firmato_il: null }, [], []).inBozza).toBe(true);
  });
  it("ricalcola ogni riga al centesimo prima di sommare", () => {
    const r = costiFlussoSubappalto(contratto, [], [sal("verificato", 0.335), sal("verificato", 0.335)]);
    expect(r.approvato).toBe(0.68);
  });
  it("il computo usa quantità e prezzi del quadro corrente senza cambiare l'originale o esporre vendita e margine", () => {
    const prima = JSON.stringify(contratto.elenco_lavori);
    const r = computoCorrenteSubappalto(contratto, { id: "q", revisione: 2, importo_lavori: 1200, voci: [{ id: "r", fase_id: "f", descrizione: "Intonaco civile", base: "misura", unita: "mq", quantita: 120, prezzo: 10, affidamento_id: "a", voce_commessa_id: "v" }] }, [], [], [], []);
    expect(r).toMatchObject({ totale: 1200, coerente: true, revisione: 2 });
    expect(r.righe[0]).toMatchObject({ fase: "Finiture", sottofase: "Intonaci", quantita: 120, importo: 1200, comprende: "posa" });
    expect(JSON.stringify(r.righe)).not.toMatch(/prezzo_vendita|margine/);
    expect(JSON.stringify(contratto.elenco_lavori)).toBe(prima);
  });
  it("le nuove voci di variante mantengono fase, sottofase e cosa comprende il prezzo della ditta", () => {
    const r = computoCorrenteSubappalto(contratto, { id: "q", revisione: 3, importo_lavori: 1200, voci: [{ id: "r", fase_id: "nuova", descrizione: "Nuovo lavoro", base: "corpo", unita: "quota", quantita: 1, prezzo: 1200, voce_commessa_id: "v2", affidamento_id: "a2" }] }, [{ id: "nuova", name: "Impianti" }], [{ id: "v2", phase_id: "nuova", subphase_id: "s2" }], [{ id: "s2", name: "Piano terra" }], [{ id: "a2", voce_id: "v2", subappaltatore_id: "d", quantita: 1, prezzo_unitario: 1200, origine_prezzo: "manuale", comprende: "fornitura_e_posa", stato: "a_contratto", contratto_id: "c" }]);
    expect(r.coerente).toBe(true);
    expect(r.righe[0]).toMatchObject({ fase: "Impianti", sottofase: "Piano terra", unita: "a corpo", quantita: 1, comprende: "fornitura_e_posa" });
  });
  it("un vecchio quadro o un elenco che non torna non si presenta come computo aggiornato", () => {
    expect(computoCorrenteSubappalto(contratto, null, [], [], [], []).coerente).toBe(false);
    expect(computoCorrenteSubappalto({ ...contratto, elenco_lavori: null }, null, [], [], [], []).coerente).toBe(false);
    expect(computoCorrenteSubappalto({ ...contratto, importo_contrattuale: 1000 }, null, [], [], [], []).coerente).toBe(true);
    expect(computoCorrenteSubappalto(contratto, { id: "q", revisione: 2, importo_lavori: 1000, voci: [{ id: "r", fase_id: null, descrizione: "Voce", base: "corpo", unita: "quota", quantita: 1, prezzo: 1200 }] }, [], [], [], []).coerente).toBe(false);
  });
});
