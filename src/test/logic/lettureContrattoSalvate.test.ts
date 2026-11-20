import { describe, expect, it } from "vitest";
import { cercaLetturaContratto, contestoLetturaContratto, salvaLetturaContratto } from "@/lib/orders/lettureContrattoSalvate";
import { parseContractExtract, vociDaComprare } from "@/lib/orders/contractExtract";

const estratto = parseContractExtract({ cliente: { nome_completo: "Cliente prova" }, descrizione_lavori: "Posa pavimento", voci: [] });
const originale = { bucket: "documenti-smart", path: "azienda/ai-contratti/file.pdf", name: "file.pdf", mime: "application/pdf" };
const contesto = contestoLetturaContratto("cliente", "Impresa", "");
const saved = { versione: 1, contesto, salvata_il: "2026-11-19T12:00:00Z", estratto, originale };

function archivio(riga: Record<string, unknown> | null) {
  const calls: [string, unknown][] = [];
  let modifica = false;
  const chain = {
    select: (v: unknown) => { calls.push(["select", v]); return chain; },
    eq: (...v: unknown[]) => { calls.push(["eq", v]); return chain; },
    maybeSingle: async () => ({ data: modifica ? { id: "doc" } : riga, error: null as null }),
    update: (v: unknown) => { modifica = true; calls.push(["update", v]); return chain; },
    insert: async (v: unknown) => { calls.push(["insert", v]); return { error: null as null }; },
  };
  const db = { from: (name: string) => { calls.push(["from", name]); return chain; } } as unknown as Parameters<typeof cercaLetturaContratto>[4];
  return { db, calls };
}

describe("archivio delle letture del contratto", () => {
  it("separa destinazione, azienda importatrice e indicazioni", () => {
    expect(contestoLetturaContratto("cliente", "Impresa", " IVA 10 ")).toBe(contestoLetturaContratto("cliente", "Impresa", "IVA 10"));
    expect(contestoLetturaContratto("appaltatore", "Impresa", "")).not.toBe(contesto);
    expect(contestoLetturaContratto("cliente", "Altra impresa", "")).not.toBe(contesto);
    expect(contestoLetturaContratto("cliente", "Impresa", "IVA 10")).not.toBe(contesto);
  });
  it("carica la lettura per azienda e impronta senza dipendere dal nome del file", async () => {
    const { db, calls } = archivio({ company_id: "azienda", structured_fields: { _letture_commessa: [saved] } });
    expect((await cercaLetturaContratto("azienda", "hash", contesto, null, db))?.estratto.cliente.nome_completo).toBe("Cliente prova");
    expect(calls).toContainEqual(["eq", ["company_id", "azienda"]]);
    expect(calls).toContainEqual(["eq", ["sha256_hash", "hash"]]);
  });
  it("non riusa dati di un'altra azienda, altre note o un altro ordine", async () => {
    for (const row of [
      { company_id: "altra", structured_fields: { _letture_commessa: [saved] } },
      { company_id: "azienda", structured_fields: { _letture_commessa: [{ ...saved, contesto: "diverso" }] } },
      { company_id: "azienda", structured_fields: { _letture_commessa: [{ ...saved, originale: { ...originale, bucket: "order-attachments", path: "altro-ordine/ai-contratti/file.pdf" } }] } },
    ]) expect(await cercaLetturaContratto("azienda", "hash", contesto, "ordine", archivio(row).db)).toBeNull();
  });
  it("conserva gli altri campi dell'inbox e protegge gli aggiornamenti concorrenti", async () => {
    const { db, calls } = archivio({ id: "doc", company_id: "azienda", updated_at: "prima", structured_fields: { fattura: { numero: "A" }, _letture_commessa: [{ ...saved, contesto: "altro" }] } });
    await salvaLetturaContratto({ companyId: "azienda", hash: "a".repeat(64), contesto, estratto, originale, uploadedBy: null }, db);
    const update = calls.find(c => c[0] === "update")?.[1] as { structured_fields: Record<string, unknown> };
    expect(update.structured_fields.fattura).toEqual({ numero: "A" });
    expect(update.structured_fields._letture_commessa).toHaveLength(2);
    expect(calls).toContainEqual(["eq", ["updated_at", "prima"]]);
  });
  it("conserva codice e unità e non acquista le forniture del committente", () => {
    const e = parseContractExtract({ voci: [
      { codice: "PAV_1.1", descrizione: "Piastrelle del cliente", unita: "mq", quantita: 78, tipo: "fornitura", a_carico_committente: true },
      { codice: "PAV_1.24", descrizione: "Fornitura colla H40", unita: "mq", quantita: 78, tipo: "fornitura" },
    ] });
    expect(e.voci[0]).toMatchObject({ codice: "PAV_1.1", unita: "mq", a_carico_committente: true });
    expect(vociDaComprare(e.voci)).toEqual([e.voci[1]]);
  });
  it("i codici conservati nelle vecchie descrizioni AI non trasformano lavori e servizi in materiali", () => {
    const e = parseContractExtract({ voci: [
      { descrizione: "DEM_1.1 Demolizione tramezzi", quantita: 21 },
      { descrizione: "AL_1.4 Trasporto materiale al piano", quantita: 1 },
      { descrizione: "PAV_1.7 Posa in opera battiscopa", quantita: 90 },
      { descrizione: "PAV_1.24 Fornitura in opera colla H40", quantita: 78 },
    ] });
    expect(e.voci.map(v => v.natura)).toEqual(["lavorazione", "servizio", "lavorazione", "fornitura_e_posa"]);
    expect(vociDaComprare(e.voci)).toEqual([e.voci[3]]);
  });
});

// Lo stesso archivio attraversa creazione, ripresa e riapertura di una commessa.
import { AnalisiGiaCollegataError, collegaAnalisiAllaCommessa, elencaLettureContratto, verificaAnalisiPerNuovaCommessa } from '@/lib/orders/lettureContrattoSalvate';
import { commessaLocaleDb } from '../support/commessaLocaleDb';
function archivioLocale() {
  return commessaLocaleDb({orders:[{id:'ordine',company_id:'azienda'},{id:'secondo',company_id:'azienda'}],document_analysis_results:[{id:'doc',company_id:'azienda',sha256_hash:'a'.repeat(64),updated_at:'2026-11-19T12:00:00Z',structured_fields:{fattura:{numero:'A'},_letture_commessa:[saved]}}]});
}
type ArchivioDb = NonNullable<Parameters<typeof collegaAnalisiAllaCommessa>[3]>;
const sorgente = {...originale,sha256:'a'.repeat(64),analysisId:'doc'};
describe('analisi assegnata a una sola commessa',()=>{
  it('scompare da nuove e altre commesse, ma resta recuperabile dalla sua',async()=>{
    const s=archivioLocale(),db=s.db as unknown as ArchivioDb;
    expect(await elencaLettureContratto('azienda',contesto,null,db)).toHaveLength(1);
    await verificaAnalisiPerNuovaCommessa('azienda',sorgente,db);await collegaAnalisiAllaCommessa('azienda','ordine',sorgente,db);
    expect(await elencaLettureContratto('azienda',contesto,null,db)).toEqual([]);expect(await elencaLettureContratto('azienda',contesto,'secondo',db)).toEqual([]);expect(await elencaLettureContratto('azienda',contesto,'ordine',db)).toHaveLength(1);
    expect((await cercaLetturaContratto('azienda','a'.repeat(64),contesto,'ordine',db))?.estratto).toEqual(estratto);
    await expect(verificaAnalisiPerNuovaCommessa('azienda',sorgente,db)).rejects.toBeInstanceOf(AnalisiGiaCollegataError);
    await expect(cercaLetturaContratto('azienda','a'.repeat(64),contesto,null,db)).rejects.toBeInstanceOf(AnalisiGiaCollegataError);
    await expect(collegaAnalisiAllaCommessa('azienda','secondo',sorgente,db)).rejects.toBeInstanceOf(AnalisiGiaCollegataError);
  });
  it('un aggiornamento concorrente si rilegge e il collegamento ripetuto è idempotente',async()=>{
    const s=archivioLocale(),db=s.db as unknown as ArchivioDb;s.conflittoProssimoUpdate();await collegaAnalisiAllaCommessa('azienda','ordine',sorgente,db);
    const count=s.chiamate.filter(c=>c==='aggiorna:document_analysis_results').length;await collegaAnalisiAllaCommessa('azienda','ordine',sorgente,db);
    expect(s.chiamate.filter(c=>c==='aggiorna:document_analysis_results')).toHaveLength(count);expect(s.tabelle.document_analysis_results[0].structured_fields.fattura).toEqual({numero:'A'});
  });
  it('rileggere nella stessa commessa conserva il vincolo e gli altri dati dell’archivio',async()=>{
    const s=archivioLocale(),db=s.db as unknown as ArchivioDb;await collegaAnalisiAllaCommessa('azienda','ordine',sorgente,db);
    await salvaLetturaContratto({companyId:'azienda',orderId:'ordine',hash:'a'.repeat(64),contesto,estratto,originale,uploadedBy:null},db);
    expect(await elencaLettureContratto('azienda',contesto,null,db)).toEqual([]);expect(await elencaLettureContratto('azienda',contesto,'ordine',db)).toHaveLength(1);
    await expect(salvaLetturaContratto({companyId:'azienda',hash:'a'.repeat(64),contesto,estratto,originale,uploadedBy:null},db)).rejects.toBeInstanceOf(AnalisiGiaCollegataError);
  });
  it('verifica la commessa e l’azienda prima di assegnare il documento',async()=>{
    const s=archivioLocale(),db=s.db as unknown as ArchivioDb;await expect(collegaAnalisiAllaCommessa('altra','ordine',sorgente,db)).rejects.toThrow(/non disponibile/);expect(s.chiamate.filter(c=>c.startsWith('aggiorna'))).toEqual([]);
  });
  it('mostra tre letture recenti, tutte ancora da collegare e ordinate per aggiornamento',async()=>{
    const s=archivioLocale(),db=s.db as unknown as ArchivioDb;s.tabelle.document_analysis_results=Array.from({length:12},(_,i)=>({...structuredClone(s.tabelle.document_analysis_results[0]),id:'doc-'+i,updated_at:`2026-11-${String(i+1).padStart(2,'0')}T12:00:00Z`}));
    const r=await elencaLettureContratto('azienda',contesto,null,db);expect(r.map(r=>r.analysisId)).toEqual(['doc-11','doc-10','doc-9']);
  });
});
