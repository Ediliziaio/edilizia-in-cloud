import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {mkdirSync,writeFileSync} from 'node:fs';
import {carattereControlloCF} from '@/lib/italianFiscalValidation';
import {DbMinimo,denoFinto,type Riga} from '../helpers/edgeFinto';
import {calcolaRiga,calcolaTotaliDocumento} from '@/lib/fatturazione/calcoli';

// Ogni XML generato in questo file passa dallo schema XSD ufficiale FatturaPA 1.2.2.
vi.mock("../../../supabase/functions/_shared/generateXML", async (originale) =>
  (await import("../helpers/xsdSuOgniXml")).conRegistro(await originale()));
import { ogniXmlNelloSchema } from "../helpers/xsdSuOgniXml";
ogniXmlNelloSchema();
const m=vi.hoisted(()=>({db:null as unknown as DbMinimo,upload:vi.fn(),fetch:vi.fn(),permesso:true,fatturaPerNota:{} as Record<string,unknown>}));
// Il client del browser serve solo a creaNotaCredito (scenari delle note di credito): legge la fattura da stornare.
vi.mock('@/integrations/supabase/client',()=>{const c:Record<string,unknown>={eq:()=>c,not:()=>c,is:()=>c,single:async()=>({data:m.fatturaPerNota,error:null as unknown}),then:(ok:(v:unknown)=>void)=>ok({data:[],error:null as unknown})};return {supabase:{from:()=>({select:()=>c})}};});
vi.mock('https://esm.sh/@supabase/supabase-js@2',()=>({createClient:()=>m.db}));
vi.mock('../../../supabase/functions/_shared/companyAuth.ts',()=>({verifyCompanyAccess:async()=>{}}));
vi.mock('../../../supabase/functions/_shared/getPlatformSetting.ts',()=>({leggiImpostazionePiattaforma:async()=> 'TOKEN-DI-PROVA'}));
vi.mock('../../../supabase/functions/_shared/requirePaymentMethod.ts',()=>({checkPaymentMethod:async()=>({allowed:true}),PAYMENT_METHOD_REQUIRED_MESSAGE:'carta'}));
let handler:(r:Request)=>Promise<Response>|Response;
const azienda={company_id:'c1',ragione_sociale:'Fornitore Prova Srl',partita_iva:'01941970939',codice_fiscale:'01941970939',regime_fiscale:'RF01',indirizzo_via:'Via Roma 1',indirizzo_comune:'Roma',indirizzo_cap:'00100',indirizzo_provincia:'RM',sdi_provider:'openapi',forma_giuridica:'SRL',codice_rea:'123',rea_ufficio:'RM',capitale_sociale:10000,stato_liquidazione:'LN',socio_unico:false};
const indirizzo={indirizzo_via:'Via Cliente 2',indirizzo_comune:'Roma',indirizzo_cap:'00100',indirizzo_provincia:'RM',indirizzo_nazione:'IT'};
const clienti={privato:{...indirizzo,tipo_cliente:'B2C',nome:'Mario',cognome:'Rossi',codice_fiscale:'RSSMRA80A01H501U'},azienda:{...indirizzo,tipo_cliente:'B2B',ragione_sociale:'Cliente Srl',partita_iva:'01234567897',codice_sdi:'ABC1234'},PA:{...indirizzo,tipo_cliente:'PA',ragione_sociale:'Comune Prova',codice_fiscale:'01234567897',codice_sdi:'ABC123'}};
function documento(cliente:Riga,tipo='fattura'):Riga {
 const r=calcolaRiga({id:'r1',numero_linea:1,descrizione:'Prestazione città e qualità',quantita:1,prezzo_unitario:100,aliquota_iva:'22'} as never);const t=calcolaTotaliDocumento([r],{splitPayment:cliente.tipo_cliente==='PA'});
 return {...t,id:'d1',company_id:'c1',tipo,stato:'emessa',numero:tipo==='nota_credito'?'NC 1/26':'FT 1/26',data_emissione:'2026-11-13',cliente_snapshot:cliente,righe:[r],note_documento:'Rendicontazione bando decreto 59702',cup:'B12H20000070001',cig:'ZA12345678',esigibilita_iva:cliente.tipo_cliente==='PA'?'S':'I',scadenze_pagamento:[{data_scadenza:'2026-12-13',importo:t.totale_da_pagare,metodo_pagamento:'MP05'}],...(tipo==='nota_credito'?{documento_correlato_id:'originale'}:{})};
}
beforeEach(async()=>{
 m.db=new DbMinimo();m.permesso=true;m.upload.mockReset().mockResolvedValue({data:{},error:null});m.fetch.mockReset().mockResolvedValue(new Response(JSON.stringify({success:true,data:{id:'ID-TRACCIABILE'}}),{status:200}));
 Object.assign(m.db,{auth:{getUser:async():Promise<{data:{user:{id:string}};error:null}>=>({data:{user:{id:'u1'}},error:null})},storage:{from:()=>({upload:m.upload})}});
 m.db.tabelle.anagrafica_azienda=[{...azienda}];m.db.tabelle.documenti_fiscali=[documento(clienti.azienda),{id:'originale',numero:'FT 79/26',data_emissione:'2026-11-01'}];
 m.db.rpcs.puo_gestire_documento_fiscale=()=>m.permesso;
 m.db.rpcs.claim_documento_per_invio=()=>{const d=m.db.tabelle.documenti_fiscali[0],prev=d.stato;if(!['emessa','rifiutata'].includes(String(prev)))return [{claimed:false,current_stato:prev}];d.stato='in_invio';return [{claimed:true,previous_stato:prev,current_stato:'in_invio'}];};
 m.db.rpcs.incrementa_progressivo_sdi=()=> 'QA00001';
 const d=denoFinto({SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'fake',SUPABASE_ANON_KEY:'anon'});vi.stubGlobal('Deno',d.finto);vi.stubGlobal('fetch',m.fetch);
 if(!handler){const module='../../../supabase/functions/invia-sdi/index.ts';await import(/* @vite-ignore */module);handler=d.gestore()!;}
});
afterEach(()=>vi.unstubAllGlobals());
const invia=()=>handler(new Request('https://example.test/invia-sdi',{method:'POST',headers:{Authorization:'Bearer fake','Content-Type':'application/json'},body:JSON.stringify({documento_id:'d1'})}));
const xmlInviato=()=>String(m.fetch.mock.calls.find((c:unknown[])=>String(c[0]).endsWith('/IT-invoices'))?.[1].body??'');
describe('gestore reale di invio: fatture e note di credito',()=>{
 for(const [nome,cliente]of Object.entries(clienti))for(const tipo of ['fattura','nota_credito'])it(`${nome}: ${tipo}, XML archiviato identico al trasmesso e nessun secondo invio`,async()=>{
  m.db.tabelle.documenti_fiscali[0]=documento(cliente,tipo);expect((await invia()).status).toBe(200);
  const xml=xmlInviato();if(process.env.FISCAL_XML_FIXTURES_DIR){mkdirSync(process.env.FISCAL_XML_FIXTURES_DIR,{recursive:true});writeFileSync(`${process.env.FISCAL_XML_FIXTURES_DIR}/${nome}-${tipo}.xml`,xml);}
  const d=new DOMParser().parseFromString(xml,'application/xml');expect(d.getElementsByTagName('parsererror')).toHaveLength(0);
  expect(d.documentElement.getAttribute('versione')).toBe(nome==='PA'?'FPA12':'FPR12');expect(d.getElementsByTagName('TipoDocumento')[0].textContent).toBe(tipo==='nota_credito'?'TD04':'TD01');expect(xml).toContain('59702');expect(xml).toContain('B12H20000070001');
  // CIG nel suo tag (dopo il CUP), esigibilità e codice destinatario come dice la fattura.
  expect(d.getElementsByTagName('CodiceCIG')[0]?.textContent).toBe('ZA12345678');
  const esig=Array.from(d.getElementsByTagName('EsigibilitaIVA')).map((e)=>e.textContent);
  if(nome==='PA'){
   expect(d.getElementsByTagName('CodiceDestinatario')[0].textContent).toBe('ABC123');
   expect(esig).toEqual(['S']);expect(d.getElementsByTagName('ImportoPagamento')[0].textContent).toBe('100.00');
   expect(xml).toMatch(/17-ter/);
  } else {
   expect(d.getElementsByTagName('CodiceDestinatario')[0].textContent).toBe(nome==='azienda'?'ABC1234':'0000000');
   expect(esig).toEqual(['I']);expect(xml).not.toMatch(/17-ter/);
  }
  if(nome==='privato'){expect(xml).toContain('<Nome>Mario</Nome><Cognome>Rossi</Cognome>');expect(xml).not.toContain('<IdCodice>RSSMRA');}
  if(tipo==='nota_credito')expect(xml).toContain('<DatiFattureCollegate>');
  const blob=m.upload.mock.calls[0][1] as Blob;expect(await blob.text()).toBe(xml);
  expect(m.db.tabelle.documenti_fiscali[0]).toMatchObject({stato:'inviata_sdi',sdi_stato:'AT',sdi_id_trasmissione:'ID-TRACCIABILE'});
  expect((await invia()).status).toBe(422);expect(m.fetch).toHaveBeenCalledTimes(1);
 });
 it('non trasmette quando il CF è formalmente corretto ma il checksum è errato',async()=>{
  m.db.tabelle.documenti_fiscali[0]=documento({...clienti.privato,codice_fiscale:'RSSMRA80A01H501Z'});expect((await invia()).status).toBe(422);expect(m.fetch).not.toHaveBeenCalled();
 });
 it('archiviazione fallita: rilascia il claim e non contatta il provider',async()=>{
  m.upload.mockResolvedValue({data:null,error:{message:'storage non disponibile'}});expect((await invia()).status).toBe(500);expect(m.fetch).not.toHaveBeenCalled();expect(m.db.tabelle.documenti_fiscali[0].stato).toBe('emessa');
 });
 it('provider rifiuta: nessun falso invio riuscito e il documento rimane reinviabile',async()=>{
  m.fetch.mockResolvedValue(new Response(JSON.stringify({success:false,message:'errore schema'}),{status:422}));expect((await invia()).status).toBe(422);expect(m.db.tabelle.documenti_fiscali[0].stato).toBe('emessa');expect(m.db.tabelle.documenti_fiscali[0].sdi_id_trasmissione).toBeUndefined();
 });
 it('senza permesso non genera né invia il documento',async()=>{m.permesso=false;expect((await invia()).status).toBe(403);expect(m.upload).not.toHaveBeenCalled();expect(m.fetch).not.toHaveBeenCalled();});
 it('una bozza non viene trasmessa e non prende un identificativo SDI',async()=>{m.db.tabelle.documenti_fiscali[0].stato='bozza';expect((await invia()).status).toBe(422);expect(m.fetch).not.toHaveBeenCalled();});
 it('PA Aruba: invia il p7m firmato, non il contenuto XML non firmato',async()=>{
  m.db.tabelle.documenti_fiscali[0]=documento(clienti.PA);Object.assign(m.db.tabelle.anagrafica_azienda[0],{sdi_provider:'aruba',sdi_api_key:'fake',sdi_firma_provider:'aruba_sign',sdi_firma_api_key:'firma'});
  const p7m=btoa('CONTENUTO FIRMATO');m.fetch.mockImplementation(async(url:string)=>new Response(JSON.stringify(url.includes('ArubaSignService')?{signedDocument:p7m}:{idSdi:'ARUBA-ID'}),{status:200}));
  expect((await invia()).status).toBe(200);const chiamata=m.fetch.mock.calls.find((c:unknown[])=>String(c[0]).includes('/uploadSigned'))!;expect(JSON.parse(chiamata[1].body).dataFile).toBe(p7m);expect(m.upload).toHaveBeenCalledTimes(2);
 });
});

it('accetta un codice fiscale omocodico con il carattere di controllo corretto',async()=>{
 const primi15='RSSMRA80A01H50M';m.db.tabelle.documenti_fiscali[0]=documento({...clienti.privato,codice_fiscale:primi15+carattereControlloCF(primi15)});expect((await invia()).status).toBe(200);
});
it('una risposta 200 senza ID tracciabile non viene chiamata invio riuscito',async()=>{
 m.fetch.mockResolvedValue(new Response(JSON.stringify({success:true,data:{}}),{status:200}));expect((await invia()).status).toBe(422);expect(m.db.tabelle.documenti_fiscali[0].stato).toBe('emessa');
});
it('due richieste concorrenti inviano una sola volta grazie al claim',async()=>{
 const risposte=await Promise.all([invia(),invia()]);expect(risposte.map(r=>r.status).sort()).toEqual([200,409]);expect(m.fetch).toHaveBeenCalledTimes(1);
});
it('codice ufficio PA errato: il documento non parte',async()=>{
 m.db.tabelle.documenti_fiscali[0]=documento({...clienti.PA,codice_sdi:'ABC1234'});expect((await invia()).status).toBe(422);expect(m.fetch).not.toHaveBeenCalled();
});

// ─── Scenari del piano PA (lotti 4-5, 15/11/2026) ───────────────────────────────────────────
// Ogni fattura nasce dalla stessa regola di «Crea fattura» dalla commessa (datiPaFattura +
// snapshotConUfficio), passa dal gestore vero di invia-sdi con il provider finto (openapi, nessun
// invio reale), e si confrontano: XML archiviato = XML trasmesso = payload del provider; schema
// XSD (registro in testa al file); conti dello SDI 00422/00423.
import { datiPaFattura, snapshotConUfficio, type UfficioDisponibile } from '@/lib/fatturazione/fatturaPaDaCommessa';
import { allineaRighe, normalizzaRiferimenti, type RigaRiferimentoCommessa } from '../../../supabase/functions/_shared/riferimentiPaFattura';
import { creaNotaCredito } from '@/lib/fatturazione/noteCredito';
import { contiSdi } from '../helpers/contiSdi';

const ENTE={...indirizzo,tipo_cliente:'PA' as const,ragione_sociale:"PROVA Comune di Demolandia",codice_fiscale:'01234567897'};
const UFFICI:UfficioDisponibile[]=[
 {id:'uff-1',anagrafica_id:'ana-ente',codice_univoco_ufficio:'UFTST1',descrizione:'Ragioneria',predefinito:false,attivo:true},
 {id:'uff-2',anagrafica_id:'ana-ente',codice_univoco_ufficio:'UFTST2',descrizione:'Lavori pubblici',predefinito:true,attivo:true},
];
const RIGHE_COMMESSA:RigaRiferimentoCommessa[]=[
 {id:'rp-1',tipo:'contratto',numero:'Rep. 1234/2026',data:'2026-03-01',cig:'1234567ABC',cup:'J51B21000140006',lotto:'Lotto 1'},
 {id:'rp-2',tipo:'ordine_acquisto',numero:'OdA 77/2026',data:'2026-06-10',cig:'Z1A2B3C4D5',cup:null},
];
interface Scenario{cliente:Riga;anagraficaId:string;righeCommessa?:RigaRiferimentoCommessa[];ufficioScelto?:string|null;split?:boolean;ritenuta?:boolean;sconto?:boolean;righe?:Riga[];perRiga?:boolean}
function righeBase(sconto=false):Riga[]{
 return ([
  calcolaRiga({id:'a',numero_linea:1,descrizione:"Rifacimento dell’impianto «idraulico» – 1° piano",quantita:2,unita_misura:'m²',prezzo_unitario:450,aliquota_iva:'22',...(sconto?{sconto_percentuale:10}:{})} as never),
  calcolaRiga({id:'b',numero_linea:2,descrizione:"Materiali (lavori d'arte) & accessori",quantita:3,unita_misura:'pz',prezzo_unitario:333.33,aliquota_iva:'10',...(sconto?{sconto_valore:12}:{})} as never),
 ] as unknown as Riga[]);
}
function fatturaDaCommessa(sc:Scenario):Riga{
 const tipo=sc.cliente.tipo_cliente as 'PA'|'B2B'|'B2C';
 const dati=datiPaFattura({commessa:{id:'ord-13',codice:'DEMO2-0013'},anagrafica:{id:sc.anagraficaId},tipoCliente:tipo,righeCommessa:sc.righeCommessa??[],uffici:tipo==='PA'?UFFICI:[],ufficioScelto:sc.ufficioScelto});
 const righe=(sc.righe??righeBase(sc.sconto)) as never[];
 const split=!!sc.split;
 const t=calcolaTotaliDocumento(righe as never,{splitPayment:split,esigibilitaDefault:split?'S':'I',ritenutaAcconto:sc.ritenuta,ritenutaAliquota:sc.ritenuta?20:undefined,...(sc.sconto?{scontoGlobalePerc:5}:{})});
 const rif=sc.perRiga?dati.riferimenti_pa.map((r,i)=>({...r,righe_id:[i===0?'a':'b']})):dati.riferimenti_pa;
 return {...t,righe,id:'d1',company_id:'c1',tipo:tipo==='PA'?'fattura_pa':'fattura',stato:'emessa',numero:'FT 100/26',data_emissione:'2026-11-15',
  anagrafica_id:sc.anagraficaId,ordine_id:'ord-13',cliente_snapshot:snapshotConUfficio(sc.cliente as never,dati.ufficio),
  riferimenti_pa:allineaRighe(rif,righe as never),ufficio_pa_id:dati.ufficio_pa_id,...dati.compatibili,
  esigibilita_iva:split?'S':'I',...(split?{causale:["Scissione dei pagamenti ai sensi dell'art. 17-ter del DPR 633/72"]}:{}),
  ...(sc.sconto?{sconto_globale_percentuale:5,sconto_globale_valore:(t as unknown as Riga).scontoGlobaleValore}:{}),
  ...(sc.ritenuta?{ritenuta_acconto:true,ritenuta_aliquota:20,ritenuta_tipo:'RT02',ritenuta_causale:'A',ritenuta_importo:t.ritenuta_importo}:{}),
  metodo_pagamento_codice:'MP05',iban_pagamento:'IT60X0542811101000000123456',
  scadenze_pagamento:[{data_scadenza:'2026-12-15',importo:t.totale_da_pagare,metodo_pagamento:'MP05'}]};
}
function tabelleContesto(){
 Object.assign(m.db.tabelle,{orders:[{id:'ord-13',order_code:'DEMO2-0013',customer_id:'cli-1',company_id:'c1'}],
  anagrafiche_native:[{id:'ana-ente',company_id:'c1',cliente_id:'cli-1',ragione_sociale:'PROVA Comune di Demolandia'}],
  anagrafica_uffici_pa:UFFICI.map((u)=>({...u,company_id:'c1'})),fattura_ordine:[]});
}
async function inviaEControlla(doc:Riga){
 m.db.tabelle.documenti_fiscali[0]=doc;tabelleContesto();
 const res=await invia();const corpo=await res.clone().json().catch(()=>({}));
 expect(res.status,JSON.stringify(corpo)).toBe(200);
 const chiamata=m.fetch.mock.calls.find((c:unknown[])=>String(c[0]).endsWith('/IT-invoices'))!;
 const xml=String(chiamata[1].body);
 expect(chiamata[1].headers['Content-Type']).toBe('application/xml');
 expect(await (m.upload.mock.calls[0][1] as Blob).text()).toBe(xml);
 const d=new DOMParser().parseFromString(xml,'application/xml');
 expect(d.getElementsByTagName('parsererror')).toHaveLength(0);
 expect(contiSdi(d)).toEqual([]);
 return {xml,d};
}
const t=(d:Document|Element,tag:string)=>Array.from(d.getElementsByTagName(tag)).map((e)=>e.textContent??'');

describe('scenari PA: cliente → commessa → fattura → XML → provider finto',()=>{
 it('A — privato: FPR12, 0000000, nessun riferimento PA e nessun obbligo',async()=>{
  const {xml,d}=await inviaEControlla(fatturaDaCommessa({cliente:clienti.privato,anagraficaId:'ana-privato'}));
  expect(t(d,'FormatoTrasmissione')).toEqual(['FPR12']);expect(t(d,'CodiceDestinatario')).toEqual(['0000000']);
  expect(xml).not.toMatch(/DatiContratto|DatiOrdineAcquisto|CodiceCIG/);
 });
 it('B — azienda: FPR12 con il suo codice; il CUP del finanziamento in DatiContratto, nessun CIG richiesto',async()=>{
  const {d}=await inviaEControlla(fatturaDaCommessa({cliente:clienti.azienda,anagraficaId:'ana-azienda',righeCommessa:[{id:'rp-9',tipo:'contratto',numero:'Contratto 5/2026',data:'2026-02-01',cig:null,cup:'B12C34000560007'}]}));
  expect(t(d,'FormatoTrasmissione')).toEqual(['FPR12']);expect(t(d,'CodiceDestinatario')).toEqual(['ABC1234']);
  expect(t(d.getElementsByTagName('DatiContratto')[0],'CodiceCUP')).toEqual(['B12C34000560007']);
 });
 it('C — PA: ufficio della commessa, contratto e ordine con CIG/CUP, split: FPA12',async()=>{
  const {xml,d}=await inviaEControlla(fatturaDaCommessa({cliente:ENTE,anagraficaId:'ana-ente',righeCommessa:[{...RIGHE_COMMESSA[0],ufficio_id:'uff-2'},RIGHE_COMMESSA[1]],split:true}));
  expect(t(d,'FormatoTrasmissione')).toEqual(['FPA12']);expect(t(d,'CodiceDestinatario')).toEqual(['UFTST2']);
  const c=d.getElementsByTagName('DatiContratto')[0];
  expect([t(c,'IdDocumento'),t(c,'Data'),t(c,'NumItem'),t(c,'CodiceCUP'),t(c,'CodiceCIG')]).toEqual([['Rep. 1234/2026'],['2026-03-01'],['Lotto 1'],['J51B21000140006'],['1234567ABC']]);
  expect(t(d.getElementsByTagName('DatiOrdineAcquisto')[0],'CodiceCIG')).toEqual(['Z1A2B3C4D5']);
  expect(t(d,'EsigibilitaIVA')).toEqual(['S','S']);expect(xml).toMatch(/17-ter/);
  expect(t(d,'IdDocumento')).not.toContain('0');
 });
 it('D — PA con più uffici: scelto un ufficio diverso dal predefinito, CodiceDestinatario di quell\'ufficio',async()=>{
  const {d}=await inviaEControlla(fatturaDaCommessa({cliente:ENTE,anagraficaId:'ana-ente',righeCommessa:RIGHE_COMMESSA,ufficioScelto:'uff-1'}));
  expect(t(d,'CodiceDestinatario')).toEqual(['UFTST1']);
 });
 it('E — CIG e CUP non dovuti: nessun valore finto, la fattura parte',async()=>{
  const {xml}=await inviaEControlla(fatturaDaCommessa({cliente:ENTE,anagraficaId:'ana-ente',righeCommessa:[{id:'rp-5',tipo:'convenzione',numero:'Conv. 3/2026',data:null,cig:null,cig_non_dovuto:true,cig_motivo_esclusione:'affidamento in house',cup:null,cup_non_dovuto:true}]}));
  expect(xml).toContain('<DatiConvenzione><IdDocumento>Conv. 3/2026</IdDocumento></DatiConvenzione>');
  expect(xml).not.toMatch(/CodiceCIG|CodiceCUP/);
 });
 it('E bis — PA senza CIG e senza «non dovuto»: non parte, e il messaggio dice dove scriverlo',async()=>{
  m.db.tabelle.documenti_fiscali[0]=fatturaDaCommessa({cliente:ENTE,anagraficaId:'ana-ente',righeCommessa:[{id:'rp-6',tipo:'contratto',numero:'C-1',data:null,cig:null,cup:'J51B21000140006'}]});tabelleContesto();
  const res=await invia();expect(res.status).toBe(422);expect(JSON.stringify(await res.json())).toMatch(/Riferimenti PA/);expect(m.fetch).not.toHaveBeenCalled();
 });
 it('J — più riferimenti e righe diverse: RiferimentoNumeroLinea',async()=>{
  const {d}=await inviaEControlla(fatturaDaCommessa({cliente:ENTE,anagraficaId:'ana-ente',righeCommessa:RIGHE_COMMESSA,perRiga:true}));
  expect(t(d.getElementsByTagName('DatiOrdineAcquisto')[0],'RiferimentoNumeroLinea')).toEqual(['2']);
  expect(t(d.getElementsByTagName('DatiContratto')[0],'RiferimentoNumeroLinea')).toEqual(['1']);
 });
 it('L — un ufficio di un\'altra azienda: i controlli lo fermano prima dell\'invio',async()=>{
  const doc=fatturaDaCommessa({cliente:ENTE,anagraficaId:'ana-ente',righeCommessa:RIGHE_COMMESSA});
  m.db.tabelle.documenti_fiscali[0]={...doc,ufficio_pa_id:'uff-altra'};tabelleContesto();
  m.db.tabelle.anagrafica_uffici_pa.push({id:'uff-altra',company_id:'c1',anagrafica_id:'ente-altrui',codice_univoco_ufficio:'UFTST2',descrizione:'Altro ente',attivo:true});
  expect((await invia()).status).toBe(422);expect(m.fetch).not.toHaveBeenCalled();
 });
 it('Renova — azienda con P.IVA, openapi, apostrofi e caratteri speciali, sconti di riga e sul totale, ritenuta',async()=>{
  const {xml,d}=await inviaEControlla(fatturaDaCommessa({cliente:{...clienti.azienda,ragione_sociale:"L’Edile d'Amico & C. S.n.c. – «Renova»"},anagraficaId:'ana-azienda',sconto:true,ritenuta:true}));
  expect(t(d,'Denominazione')).toContain("L'Edile d'Amico &amp; C. S.n.c. - \"Renova\"".replace('&amp;','&'));
  expect(t(d,'UnitaMisura')).toEqual(['m2','pz']);
  expect(t(d,'TipoRitenuta')).toEqual(['RT02']);
  expect(t(d,'Descrizione').some((x)=>/Sconto sul totale/.test(x))).toBe(true);
  expect(xml).not.toMatch(/[’«»–²]/);
 });
});

describe('note di credito TD04 dalla fattura vera (A, B, C; split acceso e spento; ritenuta)',()=>{
 const casi:Array<[string,Scenario]>=[
  ['A privato',{cliente:clienti.privato,anagraficaId:'ana-privato'}],
  ['A privato con ritenuta',{cliente:clienti.privato,anagraficaId:'ana-privato',ritenuta:true}],
  ['B azienda',{cliente:clienti.azienda,anagraficaId:'ana-azienda'}],
  ['B azienda con ritenuta',{cliente:clienti.azienda,anagraficaId:'ana-azienda',ritenuta:true}],
  ['C PA split acceso',{cliente:ENTE,anagraficaId:'ana-ente',righeCommessa:RIGHE_COMMESSA,split:true,perRiga:true}],
  ['C PA split spento',{cliente:ENTE,anagraficaId:'ana-ente',righeCommessa:RIGHE_COMMESSA,split:false}],
  ['C PA split acceso con ritenuta',{cliente:ENTE,anagraficaId:'ana-ente',righeCommessa:RIGHE_COMMESSA,split:true,ritenuta:true}],
 ];
 for(const [nome,sc] of casi)it(nome,async()=>{
  const fattura=fatturaDaCommessa(sc);m.fatturaPerNota={...fattura,numero:'FT 100/26'};
  const nc=await creaNotaCredito('d1','totale');
  const doc={...nc,id:'d1',company_id:'c1',stato:'emessa',numero:'NC 7/26',data_emissione:'2026-11-15',documento_correlato_id:'originale',scadenze_pagamento:[{data_scadenza:'2026-12-15',importo:nc.totale_da_pagare,metodo_pagamento:'MP05'}]};
  const {xml,d}=await inviaEControlla(doc as Riga);
  expect(t(d,'TipoDocumento')).toEqual(['TD04']);
  expect(t(d,'FormatoTrasmissione')).toEqual([sc.cliente.tipo_cliente==='PA'?'FPA12':'FPR12']);
  expect(xml).toContain('<DatiFattureCollegate><IdDocumento>FT 79/26</IdDocumento>');
  expect(t(d,'ImportoTotaleDocumento')).toEqual([Number(fattura.totale_documento).toFixed(2)]);
  expect(Number(t(d,'ImportoPagamento')[0])).toBeCloseTo(Number(fattura.totale_da_pagare),2);
  expect(t(d,'EsigibilitaIVA').every((e)=>e===(sc.split?'S':'I'))).toBe(true);
  if(sc.cliente.tipo_cliente==='PA'){
   expect(t(d,'CodiceDestinatario')).toEqual(['UFTST2']);
   expect(t(d,'CodiceCIG')).toEqual(['Z1A2B3C4D5','1234567ABC']);
   if(sc.perRiga)expect(t(d.getElementsByTagName('DatiContratto')[0],'RiferimentoNumeroLinea')).toEqual(['1']);
  }
  if(sc.ritenuta)expect(t(d,'TipoRitenuta')).toEqual(['RT02']);else expect(xml).not.toContain('DatiRitenuta');
 });
});
