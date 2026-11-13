/** Controlli sui dati fiscali prima del claim/invio, condivisi con l'editor.
 * Codifiche: Allegato A AdE v1.9.1, schema ordinario 1.2.3. Non decide il regime fiscale al posto dell'operatore.
 */
type Dati = Record<string, any>;
export interface ProblemaFiscale { field: string; message: string; severity: 'error'|'warning' }
const n=(v:unknown)=>Number(v??0);
const natura=(v:unknown)=>String(v??'').replace(/\./g,'_');
export const NATURE_SDI_CORRENTI=['N1','N2_1','N2_2','N3_1','N3_2','N3_3','N3_4','N3_5','N3_6','N4','N5','N6_1','N6_2','N6_3','N6_4','N6_5','N6_6','N6_7','N6_8','N6_9','N7'];
export const CAUSALI_RITENUTA_SDI=['A','B','C','D','E','G','H','I','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','L1','M1','M2','O1','V1','ZO'];
export function naturaCassa(raw:unknown, riepilogo: unknown): string|undefined {
  const esplicita=natura(raw);if(esplicita.startsWith('N'))return esplicita;
  const zero=(Array.isArray(riepilogo)?riepilogo:[]).filter((r:Dati)=>n(r.aliquota)===0&&r.natura).map((r:Dati)=>natura(r.natura));
  const uniche=[...new Set<string>(zero)];return uniche.length===1?uniche[0]:undefined;
}
export function ivaRivalsa(righe:unknown): {aliquota:number;natura?:string}|null {
  const uniche=new Map<string,{aliquota:number;natura?:string}>();
  for(const r of Array.isArray(righe)?righe:[]) {
    if(n(r.imponibile)===0)continue;
    const aliquota=parseFloat(r.aliquota_iva)||0;const nat=aliquota===0?natura(r.natura_iva):undefined;
    uniche.set(`${aliquota}|${nat??''}`,{aliquota,natura:nat||undefined});
  }
  return uniche.size===1?[...uniche.values()][0]:null;
}
export function controlliFatturaSdi(doc:Dati,azienda:Dati={}): ProblemaFiscale[] {
  const p:ProblemaFiscale[]=[];const errore=(field:string,message:string)=>p.push({field,message,severity:'error'});
  const avviso=(field:string,message:string)=>p.push({field,message,severity:'warning'});
  const righe:Dati[]=Array.isArray(doc.righe)?doc.righe:[],riepilogo:Dati[]=Array.isArray(doc.riepilogo_iva)?doc.riepilogo_iva:[];
  for(const [i,r]of righe.entries()) {
    if(String(r.descrizione??'').trim().replace(/\s+/g,' ').length>1000)errore(`righe[${i}].descrizione`,`Riga ${i+1}: l’XML ammette 1000 caratteri di descrizione. Sposta il testo aggiuntivo nelle note pubbliche, senza perderlo.`);
    if(r.natura_iva&&!NATURE_SDI_CORRENTI.includes(natura(r.natura_iva)))errore(`righe[${i}].natura_iva`,`Riga ${i+1}: Natura IVA non valida o non più utilizzabile.`);
    if(n(r.aliquota_iva)>0&&r.natura_iva)errore(`righe[${i}].natura_iva`,`Riga ${i+1}: la Natura IVA va indicata soltanto con aliquota zero.`);
    for(const k of ['quantita','prezzo_unitario','imponibile'])if(r[k]!=null&&!Number.isFinite(n(r[k])))errore(`righe[${i}].${k}`,`Riga ${i+1}: ${k} non è un numero valido.`);
  }
  for(const [flag,prefisso,def]of [['ritenuta_acconto','ritenuta','RT01'],['altra_ritenuta','altra_ritenuta','RT03']]as const) {
    if(!doc[flag])continue;
    if(!(n(doc[`${prefisso}_importo`])>0))errore(`${prefisso}_importo`,'Ritenuta attivata senza importo positivo: completa i dati prima dell’invio.');
    const al=n(doc[`${prefisso}_aliquota`]);if(!Number.isFinite(al)||al<0||al>100||(flag==='ritenuta_acconto'&&al===0))errore(`${prefisso}_aliquota`,'Aliquota della ritenuta mancante o non valida.');
    if(!/^RT0[1-6]$/.test(String(doc[`${prefisso}_tipo`]||def)))errore(`${prefisso}_tipo`,'Tipo di ritenuta non previsto dal tracciato SDI.');
    const causale=String(doc[`${prefisso}_causale`]||'A');if(!CAUSALI_RITENUTA_SDI.includes(causale))errore(`${prefisso}_causale`,'Causale pagamento ritenuta non valida: il vecchio codice Z non è utilizzabile dal 2021.');
    if(flag==='ritenuta_acconto'&&causale==='W'&&al!==4)errore(`${prefisso}_aliquota`,'Per la causale W (appalto in condominio) la ritenuta è del 4%.');
  }
  if(doc.cassa_previdenziale) {
    if(!(n(doc.cassa_importo)>0)||!(n(doc.cassa_aliquota)>0))errore('cassa_importo','Cassa attivata senza contributo o aliquota validi.');
    if(!/^TC(0[1-9]|1[0-9]|2[0-2])$/.test(String(doc.cassa_tipo||'TC22')))errore('cassa_tipo','Tipo di cassa non previsto dal tracciato SDI.');
    const raw=doc.cassa_aliquota_iva??'22',al=parseFloat(raw)||0;
    if(al===0&&!NATURE_SDI_CORRENTI.includes(naturaCassa(raw,riepilogo)??''))errore('cassa_aliquota_iva','Cassa senza IVA: seleziona una Natura IVA esplicita e valida per il contributo.');
  }
  if(doc.rivalsa_inps&&!ivaRivalsa(righe))errore('rivalsa_inps','Rivalsa INPS con trattamenti IVA diversi: inserisci la rivalsa come riga dedicata con il trattamento fiscale corretto.');
  const testo=[doc.note_documento,...(Array.isArray(doc.causale)?doc.causale:[])].join(' ');
  if(/\bbando\b|rendicontaz|contributo pubblico/i.test(testo)&&!doc.cup)avviso('cup','Documento riferito a un bando: verifica nella concessione la dicitura richiesta, il CUP e gli eventuali altri riferimenti. Il gestionale non può ricavarli dal solo nome del bando.');
  if(doc.cup&&!/^[A-Za-z0-9]{15}$/.test(String(doc.cup)))errore('cup','CUP non valido: sono richiesti 15 caratteri alfanumerici.');
  if(doc.cig&&!/^[A-Za-z0-9]{1,15}$/.test(String(doc.cig)))errore('cig','CIG non valido: verifica il codice senza spazi o caratteri speciali.');
  for(const sc of Array.isArray(doc.scadenze_pagamento)?doc.scadenze_pagamento:[])if(!Number.isFinite(n(sc.importo))||n(sc.importo)<0)errore('scadenze_pagamento','Una scadenza contiene un importo non valido.');
  const ordinaria=['fattura','fattura_riepilogativa','fattura_accompagnatoria','parcella','acconto_fattura','acconto_parcella','nota_credito','nota_debito'].includes(doc.tipo);
  if(ordinaria&&azienda.regime_fiscale==='RF19') {
    if(righe.some(r=>n(r.aliquota_iva)>0))errore('regime_fiscale','Regime forfettario: le operazioni ordinarie non devono esporre IVA. Verifica aliquote e Nature.');
    if(doc.ritenuta_acconto)errore('ritenuta_acconto','Regime forfettario: ricavi e compensi non sono assoggettati a ritenuta d’acconto (L. 190/2014, art. 1, comma 67).');
  }
  return p;
}
