import { describe, expect, it } from "vitest";
import { applicaFontiProposteAiPos, ISTRUZIONE_VOCI_DA_CLASSIFICARE, preparaContestoAiPos, vociDaClassificarePerAi } from "../../../supabase/functions/_shared/posAiContesto";
import { normalizzaPos, posVuoto, vociMancanti } from "../../../supabase/functions/_shared/posModello";
import { applicaRiusoPos } from "../../../supabase/functions/_shared/posRiuso";
import { nuovaDaSchedaStandard, SCHEDE_STANDARD_POS, suggerisciSchedePos } from "../../../supabase/functions/_shared/posSchedeStandard";
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
  it("dice quali voci del computo restano fuori dal perimetro, con il loro nome", () => {
    expect(fonti().avvisi).toContain("Una voce del computo non è abbinata alle fasi scelte: «DM-10.01 Quadro elettrico generale». La proposta non ne ricava schede, al massimo ti chiede se la esegue la tua impresa. Per includerla, aggiungi la sua fase al perimetro o scegli i capitoli del computo.");
    const serramenti: ComputoPerPos = { id: "cm-2", titolo: "Computo condominio", stato: "contrattuale", voci: [
      { id: "s1", codice: "SR.01", capitolo: "Serramenti", titolo: "Rimozione di serramento esistente in legno" },
      { id: "s2", codice: "SR.03", capitolo: "Movimentazioni", titolo: "Movimentazione dei materiali al piano con mezzi idonei o a mano" },
      { id: "s3", codice: "SR.02", capitolo: "Serramenti", titolo: "Fornitura e posa di serramento in PVC" },
    ] };
    const contesto = preparaContestoAiPos({ fasi: [{ id: "f2", name: "Rimozione serramenti esistenti" }, { id: "f3", name: "Movimentazione materiali al piano" }],
      ambito: "", descrizione: "", limitaAlPerimetro: true, computo: serramenti, psc: null });
    expect(contesto.computo?.voci.map(v => v.id)).toEqual(["s1", "s3"]);
    expect(contesto.avvisi.join(" ")).toContain("«SR.03 Movimentazione dei materiali al piano con mezzi idonei o a mano»");
    const molte: ComputoPerPos = { ...serramenti, voci: [serramenti.voci[0], ...Array.from({ length: 7 }, (_, i) => ({ id: `q${i}`, codice: `EL.${i}`, capitolo: "Elettrico", titolo: `Quadro ${i}` }))] };
    const avviso = preparaContestoAiPos({ fasi: [{ id: "f2", name: "Rimozione serramenti esistenti" }], ambito: "", descrizione: "",
      limitaAlPerimetro: true, computo: molte, psc: null }).avvisi.find(a => a.includes("non sono abbinate"));
    expect(avviso).toMatch(/^7 voci del computo .*«EL\.4 Quadro 4» e altre 2\. La proposta non ne ricava schede/);
  });

  it("passa all’AI le voci fuori perimetro da classificare, senza riferimento C, e tiene il quesito che le nomina", () => {
    const serramenti: ComputoPerPos = { id: "cm-3", titolo: "Computo condominio", stato: "contrattuale", voci: [
      { id: "s1", codice: "SR.01", capitolo: "Serramenti", titolo: "Rimozione di serramento esistente in legno", quantita: 48, unita: "cad" },
      { id: "s2", codice: "SR.03", capitolo: "Movimentazioni", titolo: "Movimentazione dei materiali al piano con mezzi idonei o a mano", quantita: 1, unita: "corpo" },
    ] };
    const contesto = preparaContestoAiPos({ fasi: [{ id: "f2", name: "Rimozione serramenti esistenti" }], ambito: "", descrizione: "",
      limitaAlPerimetro: true, computo: serramenti, psc: null });
    expect(contesto.daClassificare.map(v => v.id)).toEqual(["s2"]);
    expect(vociDaClassificarePerAi(contesto)).toEqual([{ codice: "SR.03", titolo: "Movimentazione dei materiali al piano con mezzi idonei o a mano",
      capitolo: "Movimentazioni", quantita: 1, unita: "corpo" }]);
    expect(JSON.stringify(vociDaClassificarePerAi(contesto))).not.toContain("\"ref\"");
    expect(ISTRUZIONE_VOCI_DA_CLASSIFICARE).toContain("non indicarle in riferimenti_computo");
    const domanda = "La voce SR.03 «Movimentazione dei materiali al piano» è eseguita dalla tua impresa, e con quali mezzi?";
    const [scheda] = applicaFontiProposteAiPos([{ fase_id: "f2", titolo: "Rimozione serramenti esistenti", riferimenti_computo: ["C1", "C2"], quesiti: [domanda] }],
      "t", contesto, { perimetroEsplicito: true, inSubappalto: false, subappaltatori: [] });
    expect(scheda.fonti_scheda?.computo?.voci.map(v => v.codice)).toEqual(["SR.01"]);
    expect(scheda.fonti_scheda?.quesiti?.map(q => q.domanda)).toContain(domanda);
    const nessunaAbbinata = preparaContestoAiPos({ fasi: [{ id: "f9", name: "Tinteggiatura vano scale" }], ambito: "", descrizione: "",
      limitaAlPerimetro: true, computo: serramenti, psc: null });
    expect(nessunaAbbinata.computo).toBeNull();
    expect(nessunaAbbinata.daClassificare.map(v => v.id)).toEqual(["s1", "s2"]);
    expect(nessunaAbbinata.avvisi).toContain("Nessuna voce del computo abbinata al perimetro indicato.");
    expect(nessunaAbbinata.avvisi.some(a => a.includes("non è abbinata") || a.includes("non sono abbinate"))).toBe(false);
    const senzaPerimetro = preparaContestoAiPos({ fasi: [], ambito: "", descrizione: "serramenti", limitaAlPerimetro: false, computo: serramenti, psc: null });
    expect(senzaPerimetro.daClassificare).toEqual([]);
    expect(vociDaClassificarePerAi(senzaPerimetro)).toBeUndefined();
    const tante: ComputoPerPos = { ...serramenti, voci: [serramenti.voci[0], ...Array.from({ length: 45 }, (_, i) => ({ id: `e${i}`, codice: `EL.${i}`, capitolo: "Elettrico", titolo: `Quadro ${i}` }))] };
    expect(preparaContestoAiPos({ fasi: [{ id: "f2", name: "Rimozione serramenti esistenti" }], ambito: "", descrizione: "",
      limitaAlPerimetro: true, computo: tante, psc: null }).daClassificare).toHaveLength(40);
  });

  it("non segnala voci escluse quando non c’è un perimetro o i capitoli li ha scelti l’utente", () => {
    const senzaPerimetro = preparaContestoAiPos({ fasi: [{ id: "P04", name: "Serramenti e vetrazioni" }], ambito: "", descrizione: "",
      limitaAlPerimetro: false, computo, psc: null });
    expect(senzaPerimetro.computo?.voci.map(v => v.id)).toEqual(["v1", "v2"]);
    expect(senzaPerimetro.avvisi.some(a => a.includes("non è abbinata"))).toBe(false);
    const capitoli = preparaContestoAiPos({ fasi: [], ambito: "", descrizione: "", limitaAlPerimetro: true, computo, psc: null, capitoli: ["Serramenti"] });
    expect(capitoli.computo?.voci.map(v => v.id)).toEqual(["v1"]);
    expect(capitoli.avvisi.some(a => a.includes("non è abbinata"))).toBe(false);
  });

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

  it("offre schede univoche e lascia alla persona la scelta dei dettagli del cantiere", () => {
    expect(new Set(SCHEDE_STANDARD_POS.map(s => s.id)).size).toBe(SCHEDE_STANDARD_POS.length);
    expect(suggerisciSchedePos("posa impianto fotovoltaico").map(s => s.id)).toEqual(["fotovoltaico"]);
    expect(suggerisciSchedePos("movimentazione con autogrù").map(s => s.id)).toEqual(["sollevamento"]);
    expect(suggerisciSchedePos("lavori stradali in presenza di traffico veicolare").map(s => s.id)).toEqual(["traffico"]);
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

describe("Voci delle due bozze di computo ricevute", () => {
  it("riconosce tramezzo e varco e non propone la posa per la sola fornitura", () => {
    expect(suggerisciSchedePos("Nuovo tramezzo").map(s => s.id)).toEqual(["tramezzi"]);
    const [varco] = suggerisciSchedePos("Realizzazione varco su muratura");
    expect(varco.id).toBe("varco");
    const l = nuovaDaSchedaStandard(varco, "varco");
    expect(l.fonti_scheda?.quesiti?.every(q => q.risposta === "")).toBe(true);
    expect(l.programma_demolizioni).toMatchObject({ applicabilita: "da_valutare", sequenza: "" });
    expect(l).toMatchObject({ verificata: false, dpi: "" });
    expect(suggerisciSchedePos("Sola fornitura di serramenti")).toEqual([]);
    expect(suggerisciSchedePos("Fornitura senza posa con scarico in cantiere").map(s => s.id)).toEqual(["allestimento"]);
    expect(suggerisciSchedePos("Fornitura e posa di serramenti").map(s => s.id)).toEqual(["serramenti"]);
  });

  it.each([[7.4, false], [7.55, true]] as const)("conserva la superficie %s della fonte selezionata e omette il riepilogo", async (quantita, includeVarco) => {
    const { leggiComputoPerPos } = await import("../../../supabase/functions/_shared/posComputo");
    const data = [
      { id: "l1", descrizione_breve: "Nuovo tramezzo", unita_misura: "m²", quantita, prezzo_unitario: null as number | null },
      ...(includeVarco ? [{ id: "l2", descrizione_breve: "Realizzazione varco", unita_misura: "cad", quantita: 1 }] : []),
      { id: "tot", descrizione_breve: "Riepilogo economico" },
    ];
    const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: { id: includeVarco ? "c2" : "c1", titolo: "Computo parti comuni", stato: "verificato" } }),
      range: async () => ({ data }) };
    const { fonte } = await leggiComputoPerPos({ from: () => q }, "azienda", "commessa", true);
    expect(fonte?.voci.map(v => v.titolo)).toEqual(["Nuovo tramezzo", ...(includeVarco ? ["Realizzazione varco"] : [])]);
    const [voce] = fonte!.voci;
    const l = nuovaDaSchedaStandard(suggerisciSchedePos(voce.titolo)[0], "l1");
    l.fonti_scheda!.computo = { ...fonte!, voci: [voce] };
    const html = costruisciHtmlPos({ contenuto: { ...posVuoto(), lavorazioni: [l] }, stato: "bozza", revisione: 0, revisioni: [] });
    expect(html).toContain(`${String(quantita).replace(".", ",")} m²`);
    expect(html).not.toContain(includeVarco ? "7,4 m²" : "7,55 m²");
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
