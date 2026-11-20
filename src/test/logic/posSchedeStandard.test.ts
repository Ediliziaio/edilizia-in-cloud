import { describe, expect, it } from "vitest";
import { applicaFontiProposteAiPos, preparaContestoAiPos } from "../../../supabase/functions/_shared/posAiContesto";
import { normalizzaPos, posVuoto, vociMancanti } from "../../../supabase/functions/_shared/posModello";
import { applicaRiusoPos } from "../../../supabase/functions/_shared/posRiuso";
import { nuovaDaSchedaStandard, SCHEDE_STANDARD_POS } from "../../../supabase/functions/_shared/posSchedeStandard";
import { costruisciHtmlPos } from "../../../supabase/functions/_shared/posHtml";
import type { RiferimentoPsc } from "../../../supabase/functions/_shared/posPsc";
import type { ComputoPerPos } from "../../../supabase/functions/_shared/posAiFonti";

const psc: RiferimentoPsc = {
  archivio: "sicurezza_documenti", id: "meridiane-psc", company_id: "az-1", order_id: "meridiane-1",
  titolo: "PSC Meridiane", file_name: "psc.pdf", file_path: "az-1/psc.pdf", data_documento: "2026-12-18",
  revisione: "02", sha256: "a".repeat(64),
};
const testoPsc = "Separare i fronti ed escludere la contemporaneità lungo la stessa verticale.";
const computo: ComputoPerPos = { id: "cm-1", titolo: "Computo Meridiane", stato: "contrattuale", voci: [
  { id: "v1", titolo: "Finestra PVC cucina, 1200 × 1400 mm", codice: "DM-07.03", capitolo: "Serramenti", quantita: 12, unita: "cad" },
  { id: "v2", titolo: "Quadro elettrico generale", codice: "DM-10.01", capitolo: "Elettrico" },
] };
const fonti = () => preparaContestoAiPos({ fasi: [{ id: "P04", name: "Serramenti e vetrazioni" }], ambito: "",
  descrizione: "", limitaAlPerimetro: true, computo, psc: { riferimento: psc, pagine: [{ pagina: 4, testo: testoPsc }] } });
const usa: Parameters<typeof applicaFontiProposteAiPos>[3] = { inSubappalto: true, perimetroEsplicito: true, subappaltatori: [] };
const genera = () => applicaFontiProposteAiPos([
  { fase_id: "P99", titolo: "Fase di un’altra impresa" },
  {
    fase_id: "P04", titolo: "Posa serramenti", svolgimento: "subappalto", svolgimento_con: "Altra impresa",
    id: "falso", verificata: true, standard_id: "serramenti", riferimenti_computo: ["C1", "C2", "C99"],
    riferimenti_psc: [{ pagina: 4, testo: testoPsc }, { pagina: 7, testo: testoPsc }, { pagina: 4, testo: testoPsc + " Frase aggiunta." }],
    rischi_misure: [{ rischio: "Taglio", misure: "Verificare appoggi e presa del vetro", dpi: "" }],
  },
], "test", fonti(), usa);

describe("fonti delle schede POS", () => {
  it("propone il solo perimetro e associa soltanto voci ed estratti presenti nelle fonti", () => {
    expect(fonti().computo?.voci.map(v => v.id)).toEqual(["v1"]);
    const [lavorazione] = genera();
    expect(genera()).toHaveLength(1);
    expect(lavorazione).toMatchObject({
      fase_id: "P04", verificata: false, origine: "ai", svolgimento: "diretto",
      fonti_scheda: { standard: { id: "serramenti", versione: 1 }, computo: { voci: [computo.voci[0]] },
        psc: { revisione: "02", estratti: [{ pagina: 4, testo: testoPsc }] } },
    });
    expect(lavorazione.valutazione?.righe[0]).toMatchObject({ rischio: "Taglio", misure: "Verificare appoggi e presa del vetro" });
    expect(lavorazione.id).not.toBe("falso");
  });

  it("conserva fonti e risposte nella stessa bozza e lascia fuori le fonti di cantiere dal modello riusato", () => {
    const pos = posVuoto();
    pos.procedure_psc = { psc_presente: true, richieste: true, documento: psc, voci: [
      { procedura: testoPsc, indicazioni: "Fronte concordato", fonte_estratto: psc, lavorazione_id: "test-1-1" },
    ] };
    const [l] = genera();
    l.fonti_scheda!.quesiti![0].risposta = "Carrello dedicato";
    l.fonti_scheda!.quesiti!.push({ domanda: "Chi presidia il varco delle Meridiane?", risposta: "Addetto A" });
    pos.lavorazioni = [l];
    const salvato = normalizzaPos(JSON.parse(JSON.stringify(pos)));
    expect(salvato.lavorazioni[0].fonti_scheda).toEqual(l.fonti_scheda);
    expect(salvato.procedure_psc.voci[0].fonte_estratto?.sha256).toBe(psc.sha256);
    const copiato = applicaRiusoPos(posVuoto(), salvato).lavorazioni[0];
    expect(copiato.fonti_scheda?.psc).toBeUndefined();
    expect(copiato.fonti_scheda?.computo).toBeUndefined();
    expect(copiato.fonti_scheda?.quesiti?.every(q => !q.risposta)).toBe(true);
    expect(copiato.fonti_scheda?.quesiti).toHaveLength(2);
    expect(copiato.valutazione?.righe).toEqual(l.valutazione?.righe);
    salvato.procedure_psc.documento = { ...psc, revisione: "03", sha256: "b".repeat(64) };
    const errori = vociMancanti(salvato);
    expect(errori.some(e => e.lavorazione_id === l.id && /riesamina gli estratti/.test(e.testo))).toBe(true);
    expect(errori.some(e => e.sezione === "psc" && /aggiorna la citazione/.test(e.testo))).toBe(true);
    const html = costruisciHtmlPos({ contenuto: salvato, stato: "bozza", revisione: 0, revisioni: [] });
    for (const testo of ["DM-07.03", "Rev. 02 · pagine 4", "Carrello dedicato"]) expect(html).toContain(testo);
  });

  it("offre sedici schede univoche e lascia alla persona la scelta dei dettagli del cantiere", () => {
    expect(new Set(SCHEDE_STANDARD_POS.map(s => s.id)).size).toBe(16);
    const scheda = SCHEDE_STANDARD_POS.find(s => s.id === "serramenti")!;
    const l = nuovaDaSchedaStandard(scheda, "ser");
    const pos = { ...posVuoto(), lavorazioni: [l] };
    expect(l).toMatchObject({ origine: "modello", verificata: false, dpi: "", fonti_scheda: { standard: { id: "serramenti" } } });
    expect(vociMancanti(pos).some(e => e.lavorazione_id === "ser" && /2 da chiarire/.test(e.testo))).toBe(true);
  });
});

describe("accesso alle fonti della commessa", () => {
  it("preferisce il computo contrattuale e filtra azienda e commessa prima di leggere le voci", async () => {
    const { computoPerAiPos } = await import("../../../supabase/functions/_shared/posAiFonti");
    const filtri: Array<[string, string, string]> = [];
    const db = {
      rpc: async () => ({ data: true }),
      from(tabella: string) {
        const query = {
          select: () => query,
          eq: (k: string, v: string) => { filtri.push([tabella, k, v]); return query; },
          in: () => query,
          order: () => query,
          limit: () => query,
          maybeSingle: async () => ({ data: { id: "cm-1", titolo: "Meridiane", stato: "contrattuale" } }),
          then: (resolve: (v: unknown) => unknown) => resolve({ data: [{
            id: "v1", codice_tariffa: "DM-07.03", descrizione_estesa: computo.voci[0].titolo,
            super_categoria: "Serramenti", quantita: 12, unita_misura: "cad", costo: 50,
          }] }),
        };
        return query;
      },
    };
    const { fonte } = await computoPerAiPos(db, "az-1", "ord-1", "op-1");
    expect(filtri).toEqual([
      ["computo_uploads", "company_id", "az-1"], ["computo_uploads", "order_id", "ord-1"], ["computo_uploads", "stato", "contrattuale"],
      ["computo_voci_estratte", "company_id", "az-1"], ["computo_voci_estratte", "computo_upload_id", "cm-1"],
    ]);
    expect(fonte?.voci[0]).toEqual(computo.voci[0]);
    const negato = await computoPerAiPos({ rpc: async () => ({ data: false }) }, "az-1", "ord-1", "op-1");
    expect(negato.fonte).toBeNull();
  });

  it("confronta il PSC in avvio, la fonte archiviata e l’impronta prima di leggere il file", async () => {
    const { pscPerAiPos } = await import("../../../supabase/functions/_shared/posAiFonti");
    const { improntaPsc } = await import("../../../supabase/functions/_shared/posPsc");
    const originale = new Blob(["contenuto PSC di prova"]);
    const ref = { ...psc, sha256: await improntaPsc(originale) };
    let scaricato = originale;
    let download = 0, letture = 0;
    const db = {
      from(tabella: string) {
        const query = {
          select: () => query, eq: () => query, is: () => query,
          maybeSingle: async () => ({ data: tabella === "sicurezza_avvio_commessa" ? { stato: "previsto", psc: ref } : ref }),
        };
        return query;
      },
      storage: { from: () => ({ download: async () => { download++; return { data: scaricato }; } }) },
    };
    const leggi: typeof import("../../../supabase/functions/_shared/pdfExtraction").estraiPagineTestoPdf = async () => {
      letture++;
      return { pagine: [{ pagina: 4, testo: testoPsc }], illeggibili: [], ispezionate: 6, totale: 6 };
    };
    const vecchio = await pscPerAiPos(db, ref.company_id, ref.order_id, { ...ref, revisione: "01" }, leggi);
    expect(vecchio.fonte).toBeNull();
    expect(download).toBe(0);
    const valido = await pscPerAiPos(db, ref.company_id, ref.order_id, ref, leggi);
    expect(valido.fonte?.pagine).toEqual([{ pagina: 4, testo: testoPsc }]);
    scaricato = new Blob(["PSC cambiato"]);
    expect((await pscPerAiPos(db, ref.company_id, ref.order_id, ref, leggi)).fonte).toBeNull();
    expect(letture).toBe(1);
  });
});

describe("programma delle demolizioni", () => {
  it("chiede l’applicabilità e stampa sequenza e preposto solo per il caso compilato", () => {
    const schema = SCHEDE_STANDARD_POS.find(s => s.id === "demolizioni")!;
    const l = nuovaDaSchedaStandard(schema, "dem-1");
    const pos = { ...posVuoto(), lavorazioni: [l] };
    const errori = () => vociMancanti(pos).filter(v => v.riferimento.startsWith("art. 151"));
    expect(errori()).toHaveLength(1);
    l.programma_demolizioni = { applicabilita: "si", preposto: "Persona assente", sequenza: "Da verificare", motivo: "" };
    expect(errori()).toHaveLength(2);
    pos.preposti.push({ nominativo: "Preposto demo", mansioni_sicurezza: "Sorveglianza", ruolo: "capocantiere", ruolo_altro: "" });
    l.programma_demolizioni.preposto = "Preposto demo";
    l.programma_demolizioni.sequenza = "Sequenza specifica riportata per il lotto C.";
    expect(errori()).toEqual([]);
    const dati = normalizzaPos(pos);
    expect(dati.lavorazioni[0].programma_demolizioni).toEqual(l.programma_demolizioni);
    const html = costruisciHtmlPos({ contenuto: dati, stato: "bozza", revisione: 0, revisioni: [] });
    expect(html).toContain("Programma delle demolizioni (art. 151)");
    expect(html).toContain("Sequenza specifica riportata per il lotto C.");
    expect(applicaRiusoPos(posVuoto(), dati).lavorazioni[0].programma_demolizioni).toMatchObject({
      applicabilita: "da_valutare", sequenza: "", preposto: "",
    });
  });

  it("non considera l’esito del rumore presente quando contiene soltanto un segnaposto", () => {
    const pos = posVuoto();
    pos.rumore.esito = "Esposizione da valutare";
    pos.rumore.righe = [{ mansione: "Addetto", lavorazione: "", livello_sorgenti: "", esposizione: "Da misurare", note: "" }];
    expect(vociMancanti(pos).some(v => v.sezione === "rumore")).toBe(true);
    pos.rumore.esito = "Esito del rapporto R-01, revisione 02. Valore giornaliero riportato nella tabella.";
    expect(vociMancanti(pos).some(v => v.sezione === "rumore")).toBe(false);
  });
});
