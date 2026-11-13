import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {carattereControlloCF} from '@/lib/italianFiscalValidation';
import {DbMinimo,denoFinto,type Riga} from '../helpers/edgeFinto';
import {calcolaRiga,calcolaTotaliDocumento} from '@/lib/fatturazione/calcoli';
const m=vi.hoisted(()=>({db:null as unknown as DbMinimo,upload:vi.fn(),fetch:vi.fn(),permesso:true}));
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
 return {...t,id:'d1',company_id:'c1',tipo,stato:'emessa',numero:tipo==='nota_credito'?'NC 1/26':'FT 1/26',data_emissione:'2026-11-13',cliente_snapshot:cliente,righe:[r],note_documento:'Rendicontazione bando decreto 59702',cup:'B12H20000070001',cig:'ZA12345678',scadenze_pagamento:[{data_scadenza:'2026-12-13',importo:t.totale_da_pagare,metodo_pagamento:'MP05'}],...(tipo==='nota_credito'?{documento_correlato_id:'originale'}:{})};
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
