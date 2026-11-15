/** Controlli sui dati fiscali prima del claim/invio, condivisi con l'editor.
 * Codifiche: Allegato A AdE v1.9.1, schema ordinario 1.2.3. Non decide il regime fiscale al posto dell'operatore.
 */
import { cigValido, codice, codiceUfficioValido, cupValido, ETICHETTA_TIPO_RIFERIMENTO, numeriLineaDi, riferimentiPaDelDocumento, riferimentoVuoto } from "./riferimentiPaFattura.ts";
type Dati = Record<string, any>;
/** error = blocca l'invio allo SDI (la bozza si salva sempre); warning = da controllare; info = da sapere. */
export interface ProblemaFiscale { field: string; message: string; severity: 'error'|'warning'|'info' }
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
export function controlliFatturaSdi(doc:Dati,azienda:Dati={},contesto:ContestoControlliPa={}): ProblemaFiscale[] {
  const p:ProblemaFiscale[]=[];const errore=(field:string,message:string)=>p.push({field,message,severity:'error'});
  const avviso=(field:string,message:string)=>p.push({field,message,severity:'warning'});
  const righe:Dati[]=Array.isArray(doc.righe)?doc.righe:[],riepilogo:Dati[]=Array.isArray(doc.riepilogo_iva)?doc.riepilogo_iva:[];
  for(const [i,r]of righe.entries()) {
    if(String(r.descrizione??'').trim().replace(/\s+/g,' ').length>1000)errore(`righe[${i}].descrizione`,`Riga ${i+1}: l’XML ammette 1000 caratteri di descrizione. Sposta il testo aggiuntivo nelle note pubbliche, senza perderlo.`);
    if(r.aliquota_iva!=null&&r.aliquota_iva!==''&&(!Number.isFinite(n(r.aliquota_iva))||n(r.aliquota_iva)<0||n(r.aliquota_iva)>100))errore(`righe[${i}].aliquota_iva`,`Riga ${i+1}: aliquota IVA non valida.`);
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
  if(doc.rivalsa_inps&&(!(n(doc.rivalsa_importo)>0)||n(doc.rivalsa_aliquota)!==4||String(doc.rivalsa_tipo||'TC22')!=='TC22'))errore('rivalsa_inps','La rivalsa INPS Gestione Separata richiede TipoCassa TC22, aliquota 4% e un importo positivo. Per altre casse usa il contributo cassa.');
  if(doc.rivalsa_inps&&!ivaRivalsa(righe))errore('rivalsa_inps','Rivalsa INPS con trattamenti IVA diversi: inserisci la rivalsa come riga dedicata con il trattamento fiscale corretto.');
  const testo=[doc.note_documento,...(Array.isArray(doc.causale)?doc.causale:[])].join(' ');
  if(/\bbando\b|rendicontaz|contributo pubblico/i.test(testo)&&!doc.cup)avviso('cup','Documento riferito a un bando: verifica nella concessione la dicitura richiesta, il CUP e gli eventuali altri riferimenti. Il gestionale non può ricavarli dal solo nome del bando.');
  // Colonne vecchie: valgono solo per i documenti senza riferimenti_pa (quelli nuovi le tengono allineate da sé).
  if(!riferimentiPaDelDocumento(doc).length){
    if(doc.cup&&!/^[A-Za-z0-9]{15}$/.test(String(doc.cup)))errore('cup','CUP non valido: sono richiesti 15 caratteri alfanumerici.');
    if(doc.cig&&!cigValido(doc.cig))errore('cig',`CIG «${doc.cig}» non valido: il CIG ha 10 caratteri, lettere e numeri (anche lo SmartCIG). Correggilo in «Riferimenti PA» prima dell'invio.`);
  }
  p.push(...controlliRiferimentiPa(doc,contesto));
  for(const sc of Array.isArray(doc.scadenze_pagamento)?doc.scadenze_pagamento:[])if(!Number.isFinite(n(sc.importo))||n(sc.importo)<0)errore('scadenze_pagamento','Una scadenza contiene un importo non valido.');
  const ordinaria=['fattura','fattura_pa','fattura_riepilogativa','fattura_accompagnatoria','parcella','acconto_fattura','acconto_parcella','nota_credito','nota_debito'].includes(doc.tipo);
  if(ordinaria&&azienda.regime_fiscale==='RF19') {
    if(righe.some(r=>n(r.aliquota_iva)>0))errore('regime_fiscale','Regime forfettario: le operazioni ordinarie non devono esporre IVA. Verifica aliquote e Nature.');
    if(doc.ritenuta_acconto)errore('ritenuta_acconto','Regime forfettario: ricavi e compensi non sono assoggettati a ritenuta d’acconto (L. 190/2014, art. 1, comma 67).');
  }
  return p;
}

// ─── Riferimenti PA, ufficio, commessa (lotto 5, 15/11/2026) ────────────────
//
// I messaggi dicono cosa manca, dove si inserisce e cosa non si può fare finché manca. Il
// formato giusto non dice che il codice sia quello dell'appalto: lo si scrive.

/** Ciò che i controlli non trovano sul documento: lo caricano editor e invia-sdi. */
export interface ContestoControlliPa {
  /** Commesse collegate alla fattura (ordine_id più quelle di fattura_ordine). */
  commesseCollegate?: string[];
  /** Commessa della fattura con l'anagrafica del suo cliente, per la coerenza cliente/commessa. */
  commessa?: { id: string; codice?: string | null; anagrafica_id?: string | null; cliente?: string | null } | null;
  /** Ufficio scelto, come sta nel database (ente di appartenenza, codice, attivo). */
  ufficio?: { id: string; anagrafica_id: string; codice_univoco_ufficio: string; descrizione?: string | null; attivo?: boolean } | null;
}

const TIPI_ORDINARI_PA=['fattura','fattura_pa','acconto_fattura','acconto_parcella','parcella','fattura_riepilogativa','fattura_accompagnatoria','fattura_differita_b','nota_debito'];

export function controlliRiferimentiPa(doc:Dati,contesto:ContestoControlliPa={}): ProblemaFiscale[] {
  const p:ProblemaFiscale[]=[];
  const errore=(field:string,message:string)=>p.push({field,message,severity:'error'});
  const avviso=(field:string,message:string)=>p.push({field,message,severity:'warning'});
  const info=(field:string,message:string)=>p.push({field,message,severity:'info'});
  const snap:Dati=doc.cliente_snapshot||{};
  const pa=snap.tipo_cliente==='PA';
  const righe:Dati[]=Array.isArray(doc.righe)?doc.righe:[];
  const rif=riferimentiPaDelDocumento(doc).filter((r)=>!riferimentoVuoto(r)||r.cig_non_dovuto||r.cup_non_dovuto);

  // Codice Univoco Ufficio: è il CodiceDestinatario della fattura PA.
  if(pa){
    const cod=codice(snap.codice_sdi);
    if(!cod)errore('codice_sdi','Manca il Codice Univoco Ufficio dell\'ente: sceglilo in «Cliente» → Ufficio destinatario, o aggiungilo nella scheda dell\'ente (uffici PA). Senza, la fattura non si può inviare allo SDI; la bozza si salva e l\'XML si scarica.');
    else if(!codiceUfficioValido(cod))errore('codice_sdi',`Il Codice Univoco Ufficio «${cod}» non è valido: per la PA sono 6 caratteri (quello di 7 è il codice destinatario delle aziende). Correggilo in «Cliente» → Ufficio destinatario; finché è sbagliato la fattura non si può inviare.`);
  }
  const uff=snap.ufficio_pa as Dati|undefined;
  if(uff&&pa){
    const codUff=codice(uff.codice);
    if(codUff&&codice(snap.codice_sdi)&&codUff!==codice(snap.codice_sdi))avviso('codice_sdi',`Il codice destinatario (${codice(snap.codice_sdi)}) non è quello dell'ufficio scelto «${uff.descrizione||codUff}» (${codUff}): la fattura arriverà all'ufficio ${codice(snap.codice_sdi)}. Scegli di nuovo l'ufficio in «Cliente» se non è voluto.`);
    if(uff.anagrafica_id&&doc.anagrafica_id&&uff.anagrafica_id!==doc.anagrafica_id)errore('codice_sdi',`L'ufficio «${uff.descrizione||codUff}» è di un altro ente, non di ${snap.ragione_sociale||'questo cliente'}: scegli un ufficio del cliente in «Cliente» → Ufficio destinatario. Così la fattura andrebbe all'ente sbagliato e non si può inviare.`);
  }
  const u=contesto.ufficio;
  if(u&&pa){
    if(doc.anagrafica_id&&u.anagrafica_id!==doc.anagrafica_id)errore('codice_sdi',`L'ufficio «${u.descrizione||u.codice_univoco_ufficio}» non è di ${snap.ragione_sociale||'questo cliente'}: scegli un ufficio del cliente in «Cliente» → Ufficio destinatario prima dell'invio.`);
    else if(u.attivo===false)avviso('codice_sdi',`L'ufficio «${u.descrizione||u.codice_univoco_ufficio}» è disattivato nella scheda dell'ente: controlla con l'ente che il codice ${u.codice_univoco_ufficio} sia ancora valido.`);
  }

  // Riferimenti: formati, righe, numero.
  const nRighe=righe.length;
  for(const [i,r]of rif.entries()){
    const nome=`${ETICHETTA_TIPO_RIFERIMENTO[r.tipo]}${r.numero?` n. ${r.numero}`:''}`;
    if(r.cig&&!cigValido(r.cig))errore(`riferimenti_pa[${i}].cig`,`${nome}: il CIG «${r.cig}» non è valido. Il CIG ha 10 caratteri, lettere e numeri (anche lo SmartCIG). Correggilo in «Riferimenti PA»; con il CIG sbagliato l'ente non può pagare e la fattura non si invia.`);
    if(r.cup&&!cupValido(r.cup))errore(`riferimenti_pa[${i}].cup`,`${nome}: il CUP «${r.cup}» non è valido. Il CUP ha 15 caratteri e comincia con una lettera. Correggilo in «Riferimenti PA» prima dell'invio.`);
    if(r.numero&&r.numero.length>20)errore(`riferimenti_pa[${i}].numero`,`${ETICHETTA_TIPO_RIFERIMENTO[r.tipo]}: il numero «${r.numero}» ha ${r.numero.length} caratteri, l'XML ne ammette 20 e lo taglierebbe. Scrivi in «Riferimenti PA» il numero corto (per esempio «1234/2026»); il resto può andare nelle note.`);
    if(r.num_item&&r.num_item.length>20)errore(`riferimenti_pa[${i}].num_item`,`${nome}: il lotto «${r.num_item}» ha più di 20 caratteri, l'XML ne ammette 20. Accorcialo in «Riferimenti PA».`);
    if(!r.numero&&(r.cig||r.cup||r.codice_commessa_convenzione))avviso(`riferimenti_pa[${i}].numero`,`${nome}: manca il numero del documento. Nell'XML uscirà «0» (lo SDI lo accetta, l'ente potrebbe chiederlo): scrivilo in «Riferimenti PA» se ce l'hai.`);
    const fuori=r.numeri_linea.filter((n)=>n<1||n>nRighe);
    if(!r.righe_id.length&&fuori.length)errore(`riferimenti_pa[${i}].numeri_linea`,`${nome}: è riferito alle righe ${fuori.join(', ')}, che nella fattura non ci sono. Scegli di nuovo le righe in «Riferimenti PA».`);
    if(r.righe_id.length&&!numeriLineaDi(r,righe).length)avviso(`riferimenti_pa[${i}].numeri_linea`,`${nome}: le righe a cui era riferito sono state tolte, ora vale per tutta la fattura. Controlla in «Riferimenti PA».`);
  }
  const commesse=[...new Set(rif.map((r)=>r.order_id).filter(Boolean))];
  if(commesse.length>1&&rif.some((r)=>r.order_id&&!r.righe_id.length&&!r.numeri_linea.length))avviso('riferimenti_pa',`La fattura ha riferimenti di ${commesse.length} commesse: indica in «Riferimenti PA» a quali righe si applica ciascuno, altrimenti l'ente li legge tutti riferiti a tutta la fattura.`);
  const collegate=contesto.commesseCollegate??[doc.ordine_id].filter(Boolean);
  if(contesto.commesseCollegate||doc.ordine_id){
    for(const r of rif)if(r.order_id&&r.origine!=='manuale'&&!collegate.includes(r.order_id))avviso('riferimenti_pa',`${ETICHETTA_TIPO_RIFERIMENTO[r.tipo]}${r.numero?` n. ${r.numero}`:''} viene dalla commessa ${r.order_code||''} che non è più collegata a questa fattura: toglilo in «Riferimenti PA» o ricollega la commessa.`.replace('  ',' '));
  }
  const c=contesto.commessa;
  if(c&&c.anagrafica_id&&doc.anagrafica_id&&c.anagrafica_id!==doc.anagrafica_id)avviso('cliente',`La commessa ${c.codice||''} è intestata a ${c.cliente||'un altro cliente'}, la fattura a ${snap.ragione_sociale||'un altro'}: se non è voluto, cambia il cliente o la commessa prima dell'invio.`.replace('  ',' '));

  // CIG per la PA: obbligatorio, salvo «non dovuto» dichiarato (art. 25 DL 66/2014, L. 136/2010).
  if(pa){
    const cigPresenti=rif.filter((r)=>r.cig).map((r)=>r.cig as string);
    const legacy=!rif.length&&doc.cig?[String(doc.cig)]:[];
    const nonDovuto=rif.some((r)=>r.cig_non_dovuto);
    const ordinaria=TIPI_ORDINARI_PA.includes(doc.tipo);
    if(!cigPresenti.length&&!legacy.length&&!nonDovuto){
      const msg='Manca il CIG: per una Pubblica Amministrazione la fattura senza CIG non può essere pagata e l\'ente la rifiuta. Scrivilo in «Riferimenti PA» (o nella commessa, poi «Aggiorna dalla commessa»); se per questo affidamento non è dovuto, spunta «CIG non dovuto» e scrivi il motivo.';
      if(ordinaria)errore('cig',msg);else avviso('cig',msg);
    }
    for(const cig of [...cigPresenti,...legacy].filter((v,i,a)=>a.indexOf(v)===i&&cigValido(v)))info('cig',`CIG ${codice(cig)}: il formato è giusto, ma il gestionale non può sapere se è quello di questo appalto. Controllalo sul contratto o sull'ordine dell'ente.`);
    for(const r of rif.filter((x)=>x.cig_non_dovuto))info('cig',`${ETICHETTA_TIPO_RIFERIMENTO[r.tipo]}${r.numero?` n. ${r.numero}`:''}: CIG non dovuto${r.cig_motivo_esclusione?` (${r.cig_motivo_esclusione})`:''}. Nell'XML non va nessun CIG.`);
  }
  return p;
}
