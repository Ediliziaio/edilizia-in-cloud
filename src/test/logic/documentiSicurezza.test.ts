import type { EvidenzaFascicolo } from "@/lib/sicurezza/fascicolo";
import { describe, expect, it } from "vitest";
import { documentoDaEvidenza, daSistemare, listaControlloCommessa, statoScadenza, tipoDaSubappaltatore, tipoPerSubappaltatore, type DocumentoSicurezza } from "@/lib/sicurezza/documentiSicurezza";
import { corpoDuvriHtml } from "@/lib/sicurezza/duvriHtml";

const OGGI = "2026-10-21";
const doc = (p: Partial<DocumentoSicurezza>): DocumentoSicurezza => ({
  id: Math.random().toString(36).slice(2), order_id: "o1", subappaltatore_id: null, tipo: "altro", titolo: "doc",
  file_path: "x", file_name: "x.pdf", data_documento: null, data_scadenza: null, note: null, created_at: "2026-10-01T00:00:00Z", stato_verifica:"verificato", ...p,
});
const base = { oggi: OGGI, documenti: [] as DocumentoSicurezza[], pos: [] as Array<{ status: string | null }>, subappaltatori: [] as Array<{ id: string; ragione_sociale: string | null; durc_scadenza: string | null }>, ponteggiMontati: false };

describe("scadenze", () => {
  it("scaduto, in scadenza entro 30 giorni, valido", () => {
    expect(statoScadenza("2026-10-20", OGGI)).toBe("scaduto");
    expect(statoScadenza("2026-11-10", OGGI)).toBe("in_scadenza");
    expect(statoScadenza("2027-01-01", OGGI)).toBe("ok");
    expect(statoScadenza(null, OGGI)).toBe("ok");
  });
});

describe("lista di controllo della commessa", () => {
  it("una sola impresa: POS, patente a crediti e DURC; niente PSC né notifica", () => {
    const voci = listaControlloCommessa(base);
    expect(voci.map((v) => v.chiave)).toEqual(["pos", "patente", "durc"]);
    expect(voci.filter(v=>v.chiave!=="patente").every((v) => v.stato === "manca")).toBe(true);expect(voci.find(v=>v.chiave==="patente")?.stato).toBe("in_corso");
  });

  it("con un subappaltatore servono PSC, coordinatori, notifica e i documenti dell'impresa", () => {
    const voci = listaControlloCommessa({ ...base, subappaltatori: [{ id: "s1", ragione_sociale: "Edil Rossi", durc_scadenza: "2026-10-01" }] });
    const chiavi = voci.map((v) => v.chiave);
    expect(chiavi).toEqual(expect.arrayContaining(["psc", "nomina", "notifica", "pos-s1", "durc-s1", "itp-s1"]));
    // Il DURC dalla scheda del subappaltatore è scaduto.
    expect(voci.find((v) => v.chiave === "durc-s1")).toMatchObject({ stato: "scaduto" });
  });

  it("POS approvato = a posto; in bozza = da completare; documenti validi = a posto", () => {
    const voci = listaControlloCommessa({
      ...base,
      pos: [{ status: "approvato" }],
      documenti: [doc({ tipo: "patente_crediti", order_id: null, data_scadenza: "2027-06-01" }), doc({ tipo: "durc", order_id: null, data_scadenza: "2026-11-01" })],
    });
    expect(voci.find((v) => v.chiave === "pos")?.stato).toBe("ok");
    expect(voci.find((v) => v.chiave === "patente")?.stato).toBe("ok");
    expect(voci.find((v) => v.chiave === "durc")?.stato).toBe("in_scadenza");
    expect(daSistemare(voci)).toBe(1);
    expect(listaControlloCommessa({ ...base, pos: [{ status: "bozza" }] })[0].stato).toBe("in_corso");
  });

  it("ponteggi montati: serve il PiMUS; gli altri documenti scaduti compaiono da soli", () => {
    const voci = listaControlloCommessa({ ...base, ponteggiMontati: true, documenti: [doc({ tipo: "formazione", titolo: "Corso preposti", data_scadenza: "2026-09-01" })] });
    expect(voci.find((v) => v.chiave === "pimus")?.stato).toBe("manca");
    expect(voci.find((v) => v.titolo === "Corso preposti")?.stato).toBe("scaduto");
  });

  it("idoneità tecnico-professionale: visura e DVR, anche se arrivano dalla scheda del subappaltatore", () => {
    const sub = [{ id: "s1", ragione_sociale: "Edil Rossi", durc_scadenza: null as string | null }];
    const soloVisura = listaControlloCommessa({ ...base, subappaltatori: sub, documenti: [doc({ tipo: "idoneita_tecnica", subappaltatore_id: "s1", fonte: "fascicolo" })] });
    expect(soloVisura.find((v) => v.chiave === "itp-s1")).toMatchObject({ stato: "in_corso", dettaglio: "Da raccogliere / confermare secondo applicabilità: DVR" });
    const complete = listaControlloCommessa({ ...base, subappaltatori: sub, documenti: [
      doc({ tipo: "idoneita_tecnica", subappaltatore_id: "s1", fonte: "fascicolo" }),
      doc({ tipo: "dvr", subappaltatore_id: "s1", fonte: "subappaltatore" }),
      doc({ tipo: "pos_impresa", subappaltatore_id: "s1", fonte: "subappaltatore" }),
    ] });
    expect(complete.find((v) => v.chiave === "itp-s1")?.stato).toBe("in_corso");
    expect(complete.find((v) => v.chiave === "pos-s1")?.stato).toBe("ok");
  });

  it("i tipi dei subappaltatori si leggono come quelli della sicurezza e viceversa", () => {
    expect(tipoDaSubappaltatore("visura")).toBe("idoneita_tecnica");
    expect(tipoDaSubappaltatore("visura_camerale")).toBe("idoneita_tecnica");
    expect(tipoDaSubappaltatore("pos")).toBe("pos_impresa");
    expect(tipoPerSubappaltatore("pos_impresa")).toBe("pos");
    expect(tipoPerSubappaltatore("idoneita_tecnica")).toBe("visura_camerale");
    expect(tipoPerSubappaltatore("psc")).toBe("altro");
  });

  it("il DURC di un subappaltatore non vale come DURC della tua impresa", () => {
    const voci = listaControlloCommessa({ ...base, documenti: [doc({ tipo: "durc", subappaltatore_id: "s1", data_scadenza: "2027-01-01" })] });
    expect(voci.find((v) => v.chiave === "durc")?.stato).toBe("manca");
  });
});

describe("DUVRI stampabile", () => {
  it("il JSON generato diventa tabelle, non graffe", () => {
    const html = corpoDuvriHtml(JSON.stringify({ committente: "Mario Rossi", interferenze: [{ rischio: "Caduta materiali", misura_prevenzione: "Delimitare l'area" }], costi_sicurezza_stimati: 1200 }));
    expect(html).toContain("Mario Rossi");
    expect(html).toContain("Caduta materiali");
    expect(html).toContain("<table");
    expect(html).not.toContain("{");
  });
  it("un contenuto vecchio, solo testo, resta testo", () => {
    expect(corpoDuvriHtml("Documento libero")).toContain("Documento libero");
  });
});


describe('Evidenze native e archivio precedente nella stessa lista',()=>{
  const evidenza=(p:Partial<EvidenzaFascicolo>):EvidenzaFascicolo=>({id:'e1',company_id:'az',subappaltatore_id:'s1',operaio_id:null,order_id:null,tipo:'durc',titolo:'Evidenza',origine_requisito:'da_verificare',riferimento_requisito:null,stato:'ricevuto',file_path:'az/e1/prova.pdf',file_name:'prova.pdf',data_rilascio:null,data_scadenza:null,competenza:null,revisione:null,termine:null,referente:null,verificato_da:null,verificato_il:null,note:null,updated_at:'2026-10-26T12:00:00Z',...p});
  const sub=[{id:'s1',ragione_sociale:'Impresa',durc_scadenza:null as null}];
  it('un upload non diventa verifica, ma resta visibile come attività da completare',()=>{
    const d=documentoDaEvidenza(evidenza({}));expect(d?.bucket).toBe('fascicoli-cantiere');
    expect(listaControlloCommessa({...base,subappaltatori:sub,documenti:[d!]}).find(v=>v.chiave==='durc-s1')?.stato).toBe('in_corso');
    const verificato=documentoDaEvidenza(evidenza({stato:'verificato'}));
    expect(listaControlloCommessa({...base,subappaltatori:sub,documenti:[verificato!]}).find(v=>v.chiave==='durc-s1')?.stato).toBe('ok');
  });
  it('un POS precedente senza ambito documentato non chiude il controllo del cantiere',()=>{
    expect(listaControlloCommessa({...base,subappaltatori:sub,documenti:[doc({tipo:'pos_impresa',subappaltatore_id:'s1',ambito_da_verificare:true})]}).find(v=>v.chiave==='pos-s1')?.stato).toBe('in_corso');
  });
  it('visura e DVR ricevuti richiedono ancora la verifica e una qualificazione generica non vale come visura',()=>{
    const docs=[documentoDaEvidenza(evidenza({tipo:'visura'}))!,documentoDaEvidenza(evidenza({tipo:'dvr'}))!];
    expect(listaControlloCommessa({...base,subappaltatori:sub,documenti:docs}).find(v=>v.chiave==='itp-s1')?.stato).toBe('in_corso');
    expect(documentoDaEvidenza(evidenza({tipo:'qualificazione'}))?.tipo).toBe('altro');
  });
  it('superato e non applicabile non sono documenti verificati sostitutivi',()=>{
    expect(documentoDaEvidenza(evidenza({stato:'superato'}))).toBeNull();
    expect(documentoDaEvidenza(evidenza({stato:'non_applicabile'}))).toBeNull();
  });
});


describe('Presenza dei file distinta dalla verifica',()=>{
 it('il file precedente senza esito non diventa verificato',()=>{const v=listaControlloCommessa({...base,documenti:[doc({tipo:'durc',stato_verifica:undefined})]});expect(v.find(x=>x.chiave==='durc')).toMatchObject({stato:'in_corso',dettaglio:expect.stringMatching(/verifica non è documentata/)});});
 it('la sola data della scheda non dimostra che il DURC sia stato acquisito e verificato',()=>{const v=listaControlloCommessa({...base,subappaltatori:[{id:'s',ragione_sociale:'Impresa',durc_scadenza:'2027-01-01'}]});expect(v.find(x=>x.chiave==='durc-s')?.stato).toBe('in_corso');});
 it('un record verificato privo di file non chiude il controllo',()=>{expect(listaControlloCommessa({...base,documenti:[doc({tipo:'durc',file_path:''})]}).find(x=>x.chiave==='durc')?.stato).toBe('in_corso');});
});

describe('Promemoria documenti specifici del cantiere',()=>{
 it('non considera un PSC generico, di altro cantiere o della sola ditta come PSC di questa commessa',()=>{
  const voci=listaControlloCommessa({...base,orderId:'o1',subappaltatori:[{id:'s1',ragione_sociale:'Impresa',durc_scadenza:null}],documenti:[doc({tipo:'psc',order_id:null}),doc({tipo:'psc',order_id:'altro'}),doc({tipo:'psc',order_id:'o1',subappaltatore_id:'s1'})]});
  expect(voci.find(v=>v.chiave==='psc')?.stato).toBe('manca');
 });
});
