import assert from "node:assert/strict";
import { unzipSync, strFromU8, strToU8 } from "fflate";
import { esempioPdfPos } from "../../../src/test/fixtures/posEsempioPdf.ts";
import { generaPdfPos } from "./posPdf.ts";
import { preparaPacchettoPos, jsonCanonico, type FontiDocumentiMezziEmissione, type FontiMezziEmissione, type FontiTecnicheEmissione, type FontiProdottiPos } from "./posPacchetto.ts";
import { conservaEmissionePos, scaricaEmissionePos } from "./posEmissione.ts";
import { sha256Hex } from "./improntaDocumento.ts";

const companyId="11111111-1111-4111-8111-111111111111",posId="22222222-2222-4222-8222-222222222222",id="33333333-3333-4333-8333-333333333333",token="44444444-4444-4444-8444-444444444444";
const identita={id,tentativoId:token,companyId,posId,emessoIl:"2026-10-26T12:00:00Z",origine:"approvazione_corrente" as const};
const e={id,token,company_id:companyId,pos_id:posId,revisione:0,emesso_il:identita.emessoIl,stato:"preparazione",origine:identita.origine,snapshot_id:null};
function dati() {
 const d=esempioPdfPos();
 d.contenuto.allegati=d.contenuto.allegati.map((a,i)=>({...a,file_path:`${companyId}/pos/${posId}/${i}.pdf`}));
 return d;
}
const blob=(b:Uint8Array)=>new Blob([new Uint8Array(b).buffer]);
const byteAllegato=strToU8("BYTE ORIGINALI SINTETICI — NESSUNA FIRMA REALE\u0000\u0001\u00ff");

Deno.test("PDF: modello completo, 11 sezioni e font Unicode incorporati",async()=>{
 const pdf=await generaPdfPos(dati(),identita.emessoIl);
 assert.equal(new TextDecoder().decode(pdf.bytes.slice(0,5)),"%PDF-");
 assert.equal(pdf.sezioni.length,11);assert.equal(pdf.fonts.length,2);
 assert.match(pdf.html,/Ștefan Țurcan/);assert.match(pdf.html,/consegna ai singoli lavoratori richiede/);
});
Deno.test("PDF: una bozza non viene presentata come contenuto approvato",async()=>{
 await assert.rejects(()=>generaPdfPos({...dati(),stato:"bozza"},identita.emessoIl),/contenuto POS approvato/);
});
Deno.test("PDF: caratteri privi di glifo fermano la generazione senza perderli silenziosamente",async()=>{
 const d=dati();d.contenuto.impresa.datore_lavoro="测试";
 await assert.rejects(()=>generaPdfPos(d,identita.emessoIl),/font aggiuntivo.*U\+/);
});
Deno.test("ZIP: ogni allegato conserva esattamente i byte originali e l’impronta",async()=>{
 const d=dati();d.contenuto.allegati[1].nome=d.contenuto.allegati[0].nome;
 const p=await preparaPacchettoPos(identita,d,async()=>byteAllegato,{riferimento:"TEST"});
 const zip=p.oggetti.find(f=>f.path===p.zipPath)!;
 const file=unzipSync(zip.bytes);const manifest=JSON.parse(strFromU8(file['manifest.json']));
 assert.equal(p.manifest.file.filter(f=>f.ruolo==='allegato').length,2);
 for(const f of p.manifest.file){assert.equal(await sha256Hex(file[f.nome]),f.sha256);if(f.ruolo==='allegato')assert.deepEqual(file[f.nome],byteAllegato);}
 assert.equal(await sha256Hex(file['manifest.json']),p.manifestSha256);
 assert.equal(await sha256Hex(zip.bytes),p.zipSha256);assert.equal(manifest.revisione,0);
 assert.notEqual(p.manifest.file[0].nome,p.manifest.file[1].nome);
});
Deno.test("ZIP: un allegato mancante interrompe il pacchetto",async()=>{
 await assert.rejects(()=>preparaPacchettoPos(identita,dati(),async()=>{throw new Error('Assente');},{}),/Allegato 1.*non disponibile/);
});
Deno.test("ZIP: non legge allegati di un altro POS o di un’altra azienda",async()=>{
 const d=dati();d.contenuto.allegati[0].file_path=`${companyId}/pos/altro/file.pdf`;let chiamate=0;
 await assert.rejects(()=>preparaPacchettoPos(identita,d,async()=>{chiamate++;return byteAllegato;},{}),/non appartiene/);
 assert.equal(chiamate,0);
});
Deno.test("ZIP: %2e%2e, query o frammento in un percorso non escono dalla cartella del POS e non si scarica nulla",async()=>{
 // supabase-js attacca il percorso all'URL senza codificarlo: con %2e%2e la richiesta usciva dallo storage verso /rest/v1/ con la chiave di servizio.
 const base=`${companyId}/pos/${posId}/`;
 for(const brutto of [`${base}%2e%2e/%2e%2e/rest/v1/profiles?select=*`,`${base}x?y=1`,`${base}a#b`,`${base}..%2f..%2fx.pdf`,`${base}%2E%2E`,`${base}a/b.pdf`,`${base}con spazio.pdf`,`${base}a\u202efdp.exe`,`${base}.nascosto`,`${base}`]){
  const d=dati();d.contenuto.allegati[0].file_path=brutto;let chiamate=0;
  await assert.rejects(()=>preparaPacchettoPos(identita,d,async()=>{chiamate++;return byteAllegato;},{}),/non appartiene/,brutto);
  assert.equal(chiamate,0,brutto);
 }
});
Deno.test("ZIP: anche i percorsi risolti da altre fonti rifiutano %, ? e # prima di scaricare",async()=>{
 const evidenza="55555555-5555-4555-8555-555555555555";
 for(const brutto of [`${companyId}/${evidenza}/%2e%2e/%2e%2e/rest/v1/profiles?select=*`,`${companyId}/${evidenza}/x?y=1`,`${companyId}/${evidenza}/a#b`]){
  let chiamate=0;
  await assert.rejects(()=>preparaPacchettoPos(identita,{...dati(),contenuto:{...dati().contenuto,allegati:[],versione_prodotti:1}},async()=>{chiamate++;return byteAllegato;},{riferimento:"TEST"},
   {versione:1,prodotti:[],allegati:[{evidenza_id:evidenza,bucket:"fascicoli-cantiere",path:brutto,nome:"sds.pdf",impronta:"a".repeat(64)}]}),/non valido/,brutto);
  assert.equal(chiamate,0,brutto);
 }
});
Deno.test("JSON canonico: ordinamento stabile e valori non serializzabili respinti",()=>{
 assert.equal(jsonCanonico({b:2,a:{z:1,c:0}}),jsonCanonico({a:{c:0,z:1},b:2}));
 assert.throws(()=>jsonCanonico({a:undefined}),/non serializzabile/);
 assert.throws(()=>jsonCanonico({a:new Date()}),/non serializzabile/);
});

function memoria(opzioni:{corrompi?:boolean;completaErrore?:boolean;giaCompleta?:boolean;prodotti?:FontiProdottiPos;tecniche?:FontiTecnicheEmissione;mezzi?:FontiMezziEmissione;documentiMezzi?:FontiDocumentiMezziEmissione;requisiti?:FontiRequisitiAddettiEmissione}={}) {
 const store=new Map<string,Uint8Array>();let completamenti=0;let erroreRegistrato=false;const scritture:Array<[string,unknown]>=[];
 const db={
  rpc:async(nome:string)=>{
   if(nome==='pos_requisiti_addetti_fonti_emissione')return opzioni.requisiti?{data:opzioni.requisiti,error:null}:{data:null,error:{code:'40001',message:'Riesame nominativo cambiato'}};
   if(nome==='pos_documenti_mezzi_fonti_emissione')return opzioni.documentiMezzi?{data:opzioni.documentiMezzi,error:null}:{data:null,error:{code:'40001',message:'Documento macchina cambiato'}};
   if(nome==='pos_mezzi_fonti_emissione')return opzioni.mezzi?{data:opzioni.mezzi,error:null}:{data:null,error:{code:'40001',message:'Fonte attrezzatura cambiata'}};
   if(nome==='pos_fonti_tecniche_emissione')return opzioni.tecniche?{data:opzioni.tecniche,error:null}:{data:null,error:{code:'40001',message:'Fonte tecnica cambiata'}};
   if(nome==='pos_prodotti_fonti_emissione')return opzioni.prodotti?{data:opzioni.prodotti,error:null}:{data:null,error:{code:'40001',message:'Fonte prodotto cambiata'}};
   if(nome==='pos_prenota_emissione')return {data:{...e,stato:opzioni.giaCompleta?'completa':'preparazione'},error:null};
   completamenti++;
   if(opzioni.completaErrore)return {data:null,error:{code:'40001',message:'Il POS è cambiato durante la preparazione'}};
   assert.ok(store.size>=7);return {data:{...e,stato:'completa'},error:null};
  },
  from:()=>({update:(r:{stato:string})=>{erroreRegistrato=r.stato==='errore';const chain={eq:(k:string,v:unknown)=>{scritture.push([k,v]);return chain;},select:()=>chain,maybeSingle:async()=>({data:{id},error:null})};return chain;}}),
  storage:{from:(bucket:string)=>({
   remove:async(paths:string[])=>{for(const path of paths)store.delete(path);return {error:null};},
   upload:async(path:string,b:Uint8Array,opt:{upsert:boolean})=>{assert.equal(opt.upsert,false);assert.equal(bucket,'pos-emissioni');assert.ok(!store.has(path));store.set(path,new Uint8Array(b));return {error:null};},
   download:async(path:string)=>({data:blob((bucket==='sicurezza-documenti'||bucket==='fascicoli-cantiere'||bucket==='mezzi-documenti'||bucket==='hr-documenti')?byteAllegato:opzioni.corrompi&&path.endsWith('POS.pdf')?strToU8('ALTERATO'):store.get(path)!),error:null}),
  })},
 };
 return {db,store,completamenti:()=>completamenti,errore:()=>erroreRegistrato,scritture};
}
const sorgente=()=>({posId,companyId,attesoUpdatedAt:null,dati:dati(),nomeAutore:'TEST',fonti:async()=>({prova:'TEST'})});
Deno.test("Conservazione: completa soltanto dopo upload e rilettura di tutti i byte",async()=>{
 const m=memoria();const r=await conservaEmissionePos(m.db,'utente-test',sorgente());assert.equal(r.stato,'completa');assert.equal(m.completamenti(),1);assert.equal(m.errore(),false);
});
Deno.test("Conservazione: una rilettura alterata non approva né completa il documento",async()=>{
 const m=memoria({corrompi:true});await assert.rejects(()=>conservaEmissionePos(m.db,'utente-test',sorgente()),/rilettura.*non corrisponde/);assert.equal(m.completamenti(),0);assert.equal(m.errore(),true);assert.equal(m.store.size,0);assert.ok(m.scritture.some(([k,v])=>k==='token'&&v===token));assert.ok(m.scritture.some(([k,v])=>k==='stato'&&v==='preparazione'));
});
Deno.test("Conservazione: un salvataggio concorrente resta un errore 409 senza completamento",async()=>{
 const m=memoria({completaErrore:true});await assert.rejects(()=>conservaEmissionePos(m.db,'utente-test',sorgente()),(e:unknown)=>e instanceof Error&&'status'in e&&e.status===409);assert.equal(m.errore(),true);
});
Deno.test("Conservazione: il replay di un’emissione completa non rigenera i documenti",async()=>{
 const m=memoria({giaCompleta:true});let letture=0;await conservaEmissionePos(m.db,'utente-test',{...sorgente(),fonti:async()=>{letture++;throw new Error('Non rileggere fonti vive');}});assert.equal(m.store.size,0);assert.equal(m.completamenti(),0);assert.equal(letture,0);
});
Deno.test("Download: non firma un URL se il contenuto conservato non ha l’impronta attesa",async()=>{
 let link=0;const path=`${companyId}/${id}/${token}/POS.pdf`;
 const row={...e,stato:'completa',manifest:{file:[{ruolo:'pdf',path,sha256:await sha256Hex(byteAllegato)}]}};
 const q={eq:()=>q,select:()=>q,maybeSingle:async()=>({data:row,error:null})};
 const db={from:()=>q,storage:{from:()=>({download:async()=>({data:blob(strToU8('ALTERATO')),error:null}),createSignedUrl:async()=>{link++;return {data:{signedUrl:'non-usare'}};}})}};
 await assert.rejects(()=>scaricaEmissionePos(db,companyId,id,'pdf'),/impronta.*download bloccato/);assert.equal(link,0);
});
Deno.test("Download: restituisce solo il file congelato, senza rileggere la commessa viva",async()=>{
 const path=`${companyId}/${id}/${token}/POS.pdf`;const filtri:Array<[string,string]>=[];let link=0;
 const row={...e,stato:'completa',manifest:{file:[{ruolo:'pdf',path,sha256:await sha256Hex(byteAllegato)}]}};
 const q={select:()=>q,eq:(k:string,v:string)=>{filtri.push([k,v]);return q;},maybeSingle:async()=>({data:row,error:null})};
 const db={from:(table:string)=>{assert.equal(table,'pos_emissioni');return q;},storage:{from:(bucket:string)=>{assert.equal(bucket,'pos-emissioni');return {download:async(p:string)=>{assert.equal(p,path);return {data:blob(byteAllegato),error:null};},createSignedUrl:async(p:string,secondi:number)=>{assert.equal(p,path);assert.equal(secondi,300);link++;return {data:{signedUrl:'https://storage.example.invalid/file-congelato'},error:null};}};}}};
 const r=await scaricaEmissionePos(db,companyId,id,'pdf');assert.equal(r.url,'https://storage.example.invalid/file-congelato');assert.equal(link,1);assert.ok(filtri.some(([k,v])=>k==='company_id'&&v===companyId));assert.ok(filtri.some(([k,v])=>k==='stato'&&v==='completa'));
});
Deno.test("Anteprima: consente il controllo della bozza con filigrana, senza cambiarne lo stato",async()=>{
 const d={...dati(),stato:'bozza'};const r=await generaPdfPos(d,identita.emessoIl,{anteprima:true});
 assert.equal(new TextDecoder().decode(r.bytes.slice(0,5)),"%PDF-");assert.match(r.html,/BOZZA/);assert.equal(d.stato,'bozza');
});
Deno.test("Riproducibilità: stessi dati e data producono gli stessi byte PDF",async()=>{
 const a=await generaPdfPos(dati(),identita.emessoIl);const b=await generaPdfPos(dati(),identita.emessoIl);
 assert.equal(await sha256Hex(a.bytes),await sha256Hex(b.bytes));
});

const docSdsId="55555555-5555-4555-8555-555555555555";
const provaSds=():FontiProdottiPos=>({versione:1,prodotti:[],allegati:[{evidenza_id:docSdsId,bucket:"fascicoli-cantiere",path:`${companyId}/${docSdsId}/originale.pdf`,nome:"SDS originale.pdf",impronta:"a".repeat(64)}]});
Deno.test("SDS: conserva i byte del fascicolo e distingue impronta file e metadati",async()=>{
 const d=dati();d.contenuto.versione_prodotti=1;const letture:string[]=[];
 const p=await preparaPacchettoPos(identita,d,async(bucket,path)=>{letture.push(bucket+":"+path);return byteAllegato;},{test:"fonti"},provaSds());
 const a=p.manifest.file.find(f=>f.evidenza_id===docSdsId)!;
 assert.equal(a.fonte?.bucket,"fascicoli-cantiere");assert.equal(a.impronta_metadati,"a".repeat(64));assert.equal(a.sha256,await sha256Hex(byteAllegato));assert.deepEqual(p.manifest.prodotti_sds,{versione:1,prodotti:[]});
 const z=unzipSync(p.oggetti.find(o=>o.path===p.zipPath)!.bytes);assert.deepEqual(z[a.nome],byteAllegato);assert.ok(letture.includes(`fascicoli-cantiere:${companyId}/${docSdsId}/originale.pdf`));
});
Deno.test("SDS: metadati non verificati, file mancante o path estraneo fermano il pacchetto",async()=>{
 const d=dati();d.contenuto.versione_prodotti=1;
 await assert.rejects(()=>preparaPacchettoPos(identita,d,async()=>byteAllegato,{}),/Fonti prodotto/);
 await assert.rejects(()=>preparaPacchettoPos(identita,d,async(bucket)=>{if(bucket==='fascicoli-cantiere')throw new Error('Assente');return byteAllegato;},{},provaSds()),/SDS.*non disponibile/);
 const v=provaSds();v.allegati[0].path=`${companyId}/${docSdsId}/../segreto`;
 const chiamate:string[]=[];await assert.rejects(()=>preparaPacchettoPos(identita,d,async(bucket)=>{chiamate.push(bucket);return byteAllegato;},{},v),/Riferimento SDS/);assert.ok(!chiamate.includes('fascicoli-cantiere'));
});

Deno.test("SDS: il servizio risolve le fonti e conserva i file prima di finalizzare",async()=>{
 const m=memoria({prodotti:provaSds()});const src=sorgente();src.dati.contenuto.versione_prodotti=1;
 const r=await conservaEmissionePos(m.db,'utente-test',src);assert.equal(r.stato,'completa');assert.equal(m.completamenti(),1);
 const manifest=JSON.parse(new TextDecoder().decode([...m.store.entries()].find(([k])=>k.endsWith('manifest.json'))![1]));assert.equal(manifest.prodotti_sds.versione,1);assert.ok(manifest.file.some((f:{evidenza_id?:string})=>f.evidenza_id===docSdsId));
});
Deno.test("SDS: una fonte obsoleta non carica file né finalizza il documento",async()=>{
 const m=memoria();const src=sorgente();src.dati.contenuto.versione_prodotti=1;
 await assert.rejects(()=>conservaEmissionePos(m.db,'utente-test',src),/Fonte prodotto cambiata/);assert.equal(m.store.size,0);assert.equal(m.completamenti(),0);assert.equal(m.errore(),true);
});
Deno.test("SDS: una revisione già emessa riusa il pacchetto senza rileggere fonti vive",async()=>{
 const m=memoria({giaCompleta:true});const src=sorgente();src.dati.contenuto.versione_prodotti=1;src.fonti=async()=>{throw new Error('Non ricostruire fonti vive');};
 const r=await conservaEmissionePos(m.db,'utente-test',{...src,snapshotId:'archivio-sintetico'});assert.equal(r.stato,'completa');assert.equal(m.store.size,0);assert.equal(m.completamenti(),0);
});
Deno.test("SDS: senza originale storico non ricostruisce le SDS correnti come se fossero quelle emesse",async()=>{
 const m=memoria();const src=sorgente();src.dati.contenuto.versione_prodotti=1;
 await assert.rejects(()=>conservaEmissionePos(m.db,'utente-test',{...src,snapshotId:'archivio-sintetico'}),/richiede il fascicolo originale/);assert.equal(m.store.size,0);assert.equal(m.completamenti(),0);
});

Deno.test("PDF: schede tecniche, sottotitoli e testi lunghi attraversano il renderer senza omissioni", async()=>{
 const {normalizzaTecnicaPos,CAMPI_CONTESTO_TECNICO,CAMPI_RISCHIO_TECNICO,CAMPI_ATTREZZATURA_TECNICA}=await import('./posTecnica.ts');
 const compila=(c:Record<string,string>)=>Object.fromEntries(Object.keys(c).map(k=>[k,`TEST ${k}`]));
 const d=dati();d.stato='bozza';d.contenuto.versione_tecnica=1;
 d.contenuto.lavorazioni[0].tecnica=normalizzaTecnicaPos({...compila(CAMPI_CONTESTO_TECNICO),riesaminata:false,attrezzature_previste:'si',rischi:[{id:'r1',...compila(CAMPI_RISCHIO_TECNICO),misure_organizzative:'TEST RIGA LUNGA '.repeat(500)}],attrezzature:[{id:'a1',...compila(CAMPI_ATTREZZATURA_TECNICA)}]});
 const pdf=await generaPdfPos(d,identita.emessoIl,{anteprima:true});
 assert.equal(new TextDecoder().decode(pdf.bytes.slice(0,5)),'%PDF-');assert.equal(pdf.sezioni.length,11);
 assert.match(pdf.html,/<h4>Rischio 1/);assert.match(pdf.html,/<h4>Attrezzatura 1/);assert.match(pdf.html,/valutazione_residua/);
 assert.equal((pdf.html.match(/TEST RIGA LUNGA/g)||[]).length,500);
});


function fontiTecnicheProva():FontiTecnicheEmissione {
 return {versione:1,collegamenti:[],allegati:[{evidenza_id:'88888888-8888-4888-8888-888888888888',bucket:'fascicoli-cantiere',path:`${companyId}/88888888-8888-4888-8888-888888888888/originale.pdf`,nome:'Manuale originale.pdf',impronta:'a'.repeat(64)}]};
}
Deno.test("Fonti tecniche: nessun pacchetto senza prova del servizio",async()=>{
 const d=dati();d.contenuto.versione_fonti_tecniche=1;let letture=0;
 await assert.rejects(()=>preparaPacchettoPos(identita,d,async()=>{letture++;return byteAllegato;},{}),/Fonti tecniche non verificate/);assert.equal(letture,0);
});
Deno.test("Fonti tecniche: originale e impronta byte distinti dall’impronta metadati nel fascicolo",async()=>{
 const d=dati();d.contenuto.versione_fonti_tecniche=1;const fonti=fontiTecnicheProva();
 const p=await preparaPacchettoPos(identita,d,async()=>byteAllegato,{fonti_tecniche:fonti},undefined,fonti);
 const a=p.manifest.file.find(f=>f.tipo==='evidenza_tecnica')!;assert.ok(a);assert.equal(a.evidenza_id,fonti.allegati[0].evidenza_id);assert.equal(a.impronta_metadati,'a'.repeat(64));assert.equal(a.sha256,await sha256Hex(byteAllegato));assert.notEqual(a.sha256,a.impronta_metadati);
 const zip=unzipSync(p.oggetti.find(o=>o.path===p.zipPath)!.bytes);assert.deepEqual(zip[a.nome],byteAllegato);assert.deepEqual(p.manifest.fonti_tecniche,{versione:1,collegamenti:[]});
});
Deno.test("Fonti tecniche: path estranei, fonti duplicate e file mancanti sono bloccanti",async()=>{
 const d=dati();d.contenuto.versione_fonti_tecniche=1;d.contenuto.allegati=[];
 const f=fontiTecnicheProva();let letture=0;
 await assert.rejects(()=>preparaPacchettoPos(identita,d,async()=>{letture++;return byteAllegato;},{},undefined,{...f,allegati:[{...f.allegati[0],path:'altra/privato.pdf'}]}),/Riferimento tecnico/);assert.equal(letture,0);
 await assert.rejects(()=>preparaPacchettoPos(identita,d,async()=>byteAllegato,{},undefined,{...f,allegati:[f.allegati[0],f.allegati[0]]}),/Riferimento tecnico/);
 await assert.rejects(()=>preparaPacchettoPos(identita,d,async()=>{throw Error('Assente');},{},undefined,f),/Documento tecnico.*non disponibile/);
 await assert.rejects(()=>preparaPacchettoPos(identita,d,async()=>new Uint8Array(),{},undefined,f),/documento tecnico.*vuoto/);
});
Deno.test("Fonti tecniche: fonte obsoleta non carica file e il servizio conserva il caso valido",async()=>{
 const d=dati();d.contenuto.versione_fonti_tecniche=1;const origine={...sorgente(),dati:d};
 const ko=memoria();await assert.rejects(()=>conservaEmissionePos(ko.db,'utente-test',origine),/Fonte tecnica cambiata/);assert.equal(ko.store.size,0);assert.equal(ko.completamenti(),0);
 const ok=memoria({tecniche:fontiTecnicheProva()});await conservaEmissionePos(ok.db,'utente-test',origine);assert.equal(ok.completamenti(),1);assert.ok(ok.store.size>=7);
});
Deno.test("Fonti tecniche: senza originale non ricostruisce allegati storici da fonti correnti",async()=>{
 const d=dati();d.contenuto.versione_fonti_tecniche=1;const m=memoria({tecniche:fontiTecnicheProva()});
 await assert.rejects(()=>conservaEmissionePos(m.db,'utente-test',{...sorgente(),dati:d,snapshotId:'snapshot-test'}),/fascicolo originale.*documenti tecnici/);assert.equal(m.store.size,0);
});

Deno.test("Attrezzature: il pacchetto richiede fonti verificate e le conserva nel manifest",async()=>{
 const d=dati();d.contenuto.versione_mezzi=1;let letture=0;
 await assert.rejects(()=>preparaPacchettoPos(identita,d,async()=>{letture++;return byteAllegato;},{}),/Fonti attrezzatura non verificate/);assert.equal(letture,0);
 const fonti:FontiMezziEmissione={versione:1,collegamenti:[]};
 const p=await preparaPacchettoPos(identita,d,async()=>byteAllegato,{mezzi_pos:fonti},undefined,undefined,fonti);
 assert.deepEqual(p.manifest.mezzi_pos,fonti);
 const zip=unzipSync(p.oggetti.find(o=>o.path===p.zipPath)!.bytes);assert.deepEqual(JSON.parse(strFromU8(zip['fonti.json'])).mezzi_pos,fonti);
});
Deno.test("Attrezzature: una fonte cambiata ferma l’emissione prima dell’upload",async()=>{
 const d=dati();d.contenuto.versione_mezzi=1;const m=memoria();
 await assert.rejects(()=>conservaEmissionePos(m.db,'utente-test',{...sorgente(),dati:d}),/Fonte attrezzatura cambiata/);assert.equal(m.store.size,0);assert.equal(m.completamenti(),0);
 const ok=memoria({mezzi:{versione:1,collegamenti:[]}});await conservaEmissionePos(ok.db,'utente-test',{...sorgente(),dati:d});assert.equal(ok.completamenti(),1);
});
Deno.test("Attrezzature: una revisione archiviata non recupera assegnazioni correnti",async()=>{
 const d=dati();d.contenuto.versione_mezzi=1;const m=memoria({mezzi:{versione:1,collegamenti:[]}});
 await assert.rejects(()=>conservaEmissionePos(m.db,'utente-test',{...sorgente(),dati:d,snapshotId:'storico-test'}),/fascicolo originale.*assegnazioni/);assert.equal(m.store.size,0);
});
Deno.test("PDF: identità, assegnazione e periodo dichiarato sono distinti dai controlli tecnici",async()=>{
 const {normalizzaTecnicaPos}=await import('./posTecnica.ts');const {normalizzaSceltaMezzo}=await import('./posMezzi.ts');
 const d=dati();d.stato='bozza';d.contenuto.versione_tecnica=1;d.contenuto.versione_mezzi=1;
 d.contenuto.lavorazioni[0].tecnica=normalizzaTecnicaPos({attrezzature_previste:'si',attrezzature:[{id:'a1',nome:'TEST Trapano',anagrafica:normalizzaSceltaMezzo({modalita:'inventario',utilizzo_dal:'2026-11-02',utilizzo_al:'2026-11-20',quantita_usata:1,confermata:false,fonte:{mezzo_id:companyId,fonte_id:posId,order_id:id,fonte_tipo:'corrente',nome:'TEST <Trapano>',stato:'in_servizio',quantita:'1',impronta:'a'.repeat(64)}})}]});
 const p=await generaPdfPos(d,identita.emessoIl,{anteprima:true});assert.match(p.html,/Identificativo inventario/);assert.match(p.html,/senza prova dello storico/);assert.match(p.html,/non attesta manutenzione/);assert.match(p.html,/TEST &lt;Trapano&gt;/);assert.match(p.html,/da confermare/);assert.equal(new TextDecoder().decode(p.bytes.slice(0,5)),'%PDF-');
});

function documentiMezziProva():FontiDocumentiMezziEmissione {return {versione:1,collegamenti:[],allegati:[{evidenza_id:'88888888-8888-4888-8888-888888888888',mezzo_id:'99999999-9999-4999-8999-999999999999',bucket:'mezzi-documenti',path:`${companyId}/99999999-9999-4999-8999-999999999999/originale.pdf`,nome:'TEST Manuale originale.pdf',impronta:'a'.repeat(64)}]};}
Deno.test("Documenti macchina: solo fonti del servizio, bytes e impronte conservati",async()=>{
 const d=dati();d.contenuto.versione_documenti_mezzi=1;let letture=0;
 await assert.rejects(()=>preparaPacchettoPos(identita,d,async()=>{letture++;return byteAllegato;},{}),/Documenti attrezzatura non verificati/);assert.equal(letture,0);
 const f=documentiMezziProva();const p=await preparaPacchettoPos(identita,d,async()=>byteAllegato,{documenti_mezzi:f},undefined,undefined,undefined,f);
 const a=p.manifest.file.find(x=>x.tipo==='documento_attrezzatura')!;assert.ok(a);assert.equal(a.mezzo_id,f.allegati[0].mezzo_id);assert.equal(a.sha256,await sha256Hex(byteAllegato));assert.notEqual(a.sha256,a.impronta_metadati);
 const zip=unzipSync(p.oggetti.find(x=>x.path===p.zipPath)!.bytes);assert.deepEqual(zip[a.nome],byteAllegato);assert.deepEqual(p.manifest.documenti_mezzi,{versione:1,collegamenti:[]});
});
Deno.test("Documenti macchina: path di altra macchina, duplicati e originali assenti bloccano il pacchetto",async()=>{
 const d=dati();d.contenuto.versione_documenti_mezzi=1;d.contenuto.allegati=[];const f=documentiMezziProva();let letture=0;
 await assert.rejects(()=>preparaPacchettoPos(identita,d,async()=>{letture++;return byteAllegato;},{},undefined,undefined,undefined,{...f,allegati:[{...f.allegati[0],mezzo_id:companyId}]}),/Riferimento originale/);assert.equal(letture,0);
 await assert.rejects(()=>preparaPacchettoPos(identita,d,async()=>byteAllegato,{},undefined,undefined,undefined,{...f,allegati:[f.allegati[0],f.allegati[0]]}),/Riferimento originale/);
 await assert.rejects(()=>preparaPacchettoPos(identita,d,async()=>{throw Error('Assente');},{},undefined,undefined,undefined,f),/Originale attrezzatura.*non disponibile/);
});
Deno.test("Documenti macchina: fonti cambiate non producono file, il caso valido completa",async()=>{
 const d=dati();d.contenuto.versione_documenti_mezzi=1;
 const ko=memoria();await assert.rejects(()=>conservaEmissionePos(ko.db,'utente-test',{...sorgente(),dati:d}),/Documento macchina cambiato/);assert.equal(ko.store.size,0);assert.equal(ko.completamenti(),0);
 const ok=memoria({documentiMezzi:documentiMezziProva()});await conservaEmissionePos(ok.db,'utente-test',{...sorgente(),dati:d});assert.equal(ok.completamenti(),1);
});
Deno.test("Documenti macchina: lo storico richiede il pacchetto originale",async()=>{
 const d=dati();d.contenuto.versione_documenti_mezzi=1;const m=memoria({documentiMezzi:documentiMezziProva()});await assert.rejects(()=>conservaEmissionePos(m.db,'utente-test',{...sorgente(),dati:d,snapshotId:'storico-test'}),/fascicolo originale.*documenti della macchina/);assert.equal(m.store.size,0);
});
Deno.test("PDF: documenti macchina e riesame controlli senza costi, note o idoneità automatiche",async()=>{
 const {normalizzaTecnicaPos}=await import('./posTecnica.ts');const {normalizzaDocumentazioneMezzo}=await import('./posDocumentiMezzi.ts');
 const d=dati();d.stato='bozza';d.contenuto.versione_tecnica=1;d.contenuto.versione_documenti_mezzi=1;
 d.contenuto.lavorazioni[0].tecnica=normalizzaTecnicaPos({attrezzature_previste:'si',attrezzature:[{id:'a1',nome:'TEST Attrezzatura',documentazione:normalizzaDocumentazioneMezzo({modalita:'documenti',documenti:[{id:companyId,mezzo_id:posId,categoria:'manuale_ce',titolo:'TEST <Manuale>',file_name:'test.pdf',revisione_dichiarata:'TEST-1',confermata:false,importo:9999,note:'SEGRETO'}],controlli:{mezzo_id:posId,manutenzioni:[{id:'m',tipo:'verifica',data:'2026-10-01',prossima_data:'2026-12-01',costo:9999}],segnalazioni:[],impronta:'a'.repeat(64)},riesame_controlli:'TEST Nessuna attestazione reale',confermata:false})}]});
 const p=await generaPdfPos(d,identita.emessoIl,{anteprima:true});assert.match(p.html,/TEST &lt;Manuale&gt;/);assert.match(p.html,/TEST-1/);assert.match(p.html,/Non costituisce un esito di idoneità/);assert.doesNotMatch(p.html,/9999|SEGRETO/);assert.equal(new TextDecoder().decode(p.bytes.slice(0,5)),'%PDF-');
});

import { fontePropria } from "../../../src/test/fixtures/riesameProprioPos.ts";
import { normalizzaRequisitiAddettiPos, contestoLavorazioneAddetti } from "./posRequisitiAddetti.ts";
import type { FontiRequisitiAddettiEmissione } from "./posPacchetto.ts";
function nominativiTest() {
 const d=dati(),foto=fontePropria();foto.company_id=companyId;
 d.contenuto.versione_requisiti_addetti=1;
 const l=d.contenuto.lavorazioni[0];
 const v=normalizzaRequisitiAddettiPos({modalita:'riesami',dal:foto.dal,al:foto.al,motivazione:'',adattamento:'TEST attività e condizioni riesaminate',fonti:[{id:foto.id,impronta:foto.impronta,fotografia:foto}],confermata:true,contesto_lavorazione:contestoLavorazioneAddetti(l)});
 l.requisiti_addetti=v;
 const q=foto.riscontri[0].qualifica;
 const prova:FontiRequisitiAddettiEmissione={versione:1,collegamenti:[{lavorazione:1,lavorazione_id:l.id,requisiti:v}],allegati:[{evidenza_id:q.fonte_id,persona_id:q.persona_id,bucket:'hr-documenti',path:`${companyId}/${q.persona_id}/TEST-attestato.pdf`,nome:'TEST attestato.pdf',impronta:q.fonte_impronta}]};
 return {d,prova};
}
Deno.test("ZIP nominativo: conserva byte originali, persona, fonte e impronte distinte",async()=>{
 const {d,prova}=nominativiTest();const p=await preparaPacchettoPos(identita,d,async()=>byteAllegato,{},undefined,undefined,undefined,undefined,prova);
 const a=p.manifest.file.find(f=>f.tipo==='qualifica_addetto')!;assert.ok(a);
 const zip=unzipSync(p.oggetti.find(f=>f.path===p.zipPath)!.bytes);
 assert.deepEqual(zip[a.nome],byteAllegato);assert.equal(a.sha256,await sha256Hex(byteAllegato));assert.equal(a.impronta_metadati,prova.allegati[0].impronta);assert.equal(a.persona_id,prova.allegati[0].persona_id);
 assert.deepEqual(p.manifest.requisiti_addetti,{versione:1,collegamenti:prova.collegamenti});
 assert.match(strFromU8(zip['modello.html']),/TEST Omonimo/);assert.match(strFromU8(zip['modello.html']),/TEST pertinenza letta/);assert.match(strFromU8(zip['modello.html']),/TEST limite/);assert.match(strFromU8(zip['modello.html']),/Periodo assegnato: 2026-11-10 — 2026-11-11/);
});
Deno.test("ZIP nominativo: senza prova server interrompe prima di scaricare file",async()=>{
 const {d}=nominativiTest();let n=0;await assert.rejects(()=>preparaPacchettoPos(identita,d,async()=>{n++;return byteAllegato;},{}),/Riscontri nominativi non verificati/);assert.equal(n,0);
});
Deno.test("ZIP nominativo: non legge originali sanitari o di altro profilo tramite percorsi manipolati",async()=>{
 for(const change of ['altro-profilo','sanitario','traversal']as const){
  const {d,prova}=nominativiTest();d.contenuto.allegati=[];let n=0;
  if(change==='altro-profilo')prova.allegati[0].path=`${companyId}/${posId}/TEST.pdf`;
  if(change==='sanitario')prova.allegati[0].bucket='sicurezza-documenti' as 'hr-documenti';
  if(change==='traversal')prova.allegati[0].path=`${companyId}/${prova.allegati[0].persona_id}/../TEST.pdf`;
  await assert.rejects(()=>preparaPacchettoPos(identita,d,async()=>{n++;return byteAllegato;},{},undefined,undefined,undefined,undefined,prova),/Riferimento formativo non pertinente/);assert.equal(n,0);
 }
});
Deno.test("ZIP nominativo: originale mancante o vuoto non produce pacchetto",async()=>{
 for(const vuoto of [false,true]){
  const {d,prova}=nominativiTest();d.contenuto.allegati=[];
  await assert.rejects(()=>preparaPacchettoPos(identita,d,async()=>{if(vuoto)return new Uint8Array();throw new Error('TEST assente');},{},undefined,undefined,undefined,undefined,prova),vuoto?/originale formativo.*vuoto/:/Originale formativo.*non disponibile/);
 }
});
Deno.test("Emissione nominativa: fonte non più attuale blocca prima degli upload",async()=>{
 const {d}=nominativiTest();const m=memoria();await assert.rejects(()=>conservaEmissionePos(m.db,'utente-test',{...sorgente(),dati:d}),/Riesame nominativo cambiato/);assert.equal(m.completamenti(),0);assert.equal(m.store.size,0);
});
Deno.test("Emissione nominativa: conserva e rilegge gli originali prima di completare",async()=>{
 const {d,prova}=nominativiTest();const m=memoria({requisiti:prova});const r=await conservaEmissionePos(m.db,'utente-test',{...sorgente(),dati:d});assert.equal(r.stato,'completa');assert.equal(m.completamenti(),1);
});
Deno.test("Emissione nominativa: non ricostruisce originali storici da fonti vive",async()=>{
 const {d,prova}=nominativiTest();const m=memoria({requisiti:prova});await assert.rejects(()=>conservaEmissionePos(m.db,'utente-test',{...sorgente(),dati:d,snapshotId:posId}),/storici richiedono il pacchetto/);assert.equal(m.completamenti(),0);
});

Deno.test("PSC: conserva nello ZIP i byte dell’originale scelto e il riferimento nel manifest",async()=>{
 const d=dati();const bytes=strToU8("PSC SINTETICO DI COLLAUDO — NESSUNA VALIDAZIONE TECNICA");
 const r={archivio:"sicurezza_documenti" as const,id:"55555555-5555-4555-8555-555555555555",company_id:companyId,order_id:"66666666-6666-4666-8666-666666666666",titolo:"PSC DEMO",file_name:"psc-demo.pdf",file_path:`${companyId}/documenti/commessa/psc.pdf`,data_documento:"2026-10-27",revisione:"02",sha256:await sha256Hex(bytes)};
 d.contenuto.procedure_psc={psc_presente:true,richieste:false,voci:[],documento:r};
 const p=await preparaPacchettoPos(identita,d,async(_bucket,path)=>path===r.file_path?bytes:byteAllegato,{},undefined,undefined,undefined,undefined,undefined,r);
 assert.deepEqual(p.manifest.psc,r);const f=p.manifest.file.find(f=>f.tipo==="psc")!;assert.equal(f.sha256,r.sha256);assert.deepEqual(unzipSync(p.oggetti.find(o=>o.path===p.zipPath)!.bytes)[f.nome],bytes);
});
Deno.test("PSC: byte cambiati non producono un pacchetto",async()=>{
 const d=dati();const r={archivio:"sicurezza_documenti" as const,id:"55555555-5555-4555-8555-555555555555",company_id:companyId,order_id:"66666666-6666-4666-8666-666666666666",titolo:"PSC DEMO",file_name:"psc.pdf",file_path:`${companyId}/documenti/commessa/psc.pdf`,data_documento:"",revisione:"02",sha256:"a".repeat(64)};
 d.contenuto.procedure_psc={psc_presente:true,richieste:false,voci:[],documento:r};
 await assert.rejects(()=>preparaPacchettoPos(identita,d,async()=>byteAllegato,{},undefined,undefined,undefined,undefined,undefined,r),/byte del PSC/);
});
Deno.test("PSC: riferimento non verificato o ricostruzione storica non leggono le fonti vive",async()=>{
 const d=dati();const r={archivio:"sicurezza_documenti" as const,id:"55555555-5555-4555-8555-555555555555",company_id:companyId,order_id:"66666666-6666-4666-8666-666666666666",titolo:"PSC DEMO",file_name:"psc.pdf",file_path:`${companyId}/documenti/commessa/psc.pdf`,data_documento:"",revisione:"02",sha256:"a".repeat(64)};
 d.contenuto.procedure_psc={psc_presente:true,richieste:false,voci:[],documento:r};let letture=0;const scarica=async()=>{letture++;return byteAllegato;};
 await assert.rejects(()=>preparaPacchettoPos(identita,d,scarica,{}),/PSC non verificato/);
 await assert.rejects(()=>preparaPacchettoPos({...identita,origine:"ricostruzione_da_contenuto_archiviato"},d,scarica,{},undefined,undefined,undefined,undefined,undefined,r),/PSC non verificato/);assert.equal(letture,0);
});

Deno.test("PDF: frecce, spunte, avvisi, emoji e spazi stretti non fermano più anteprima ed emissione",async()=>{
 const d=dati();
 d.contenuto.lavorazioni[0].misure="Prima → durante → dopo\n✓ Elmetto\n⚠ Carichi sospesi 📞";
 d.contenuto.impresa.datore_lavoro="Mario Rossi";
 d.contenuto.opera.committente.telefono="☎ 02 1234567";
 const pdf=await generaPdfPos(d,identita.emessoIl);
 assert.equal(new TextDecoder().decode(pdf.bytes.slice(0,5)),"%PDF-");
 // L'HTML conservato resta il testo scritto dall'utente: la sostituzione riguarda solo il PDF.
 assert.match(pdf.html,/Prima → durante → dopo/);
});
Deno.test("PDF: un carattere senza glifo che non si sa sostituire ferma la generazione e dice dove sta",async()=>{
 const d=dati();d.contenuto.lavorazioni[0].descrizione="Posa del cappotto 测试 sulla facciata nord";
 await assert.rejects(()=>generaPdfPos(d,identita.emessoIl),/font aggiuntivo.*U\+6D4B.*Posa del cappotto/);
});
Deno.test("PDF: e-mail, impronte e nomi di file lunghi stanno nella pagina e il valore non sparisce",async()=>{
 const d=dati();
 d.contenuto.impresa.sede_legale={indirizzo:"Via dei Cantieri 1, Sesto San Giovanni",telefono:"02 1234567",email:"amministrazione.contabilita@costruzionirossi-edilizia.it"};
 d.contenuto.impresa.ragione_sociale="Costruzioni Rossi "+"s".repeat(70)+" S.r.l.";
 d.contenuto.procedure_psc={psc_presente:true,richieste:false,voci:[],documento:{archivio:"sicurezza_documenti",id:"33333333-3333-4333-8333-333333333333",company_id:companyId,order_id:"44444444-4444-4444-8444-444444444444",titolo:"PSC",file_name:"PSC-revisione-02-definitivo-firmato-digitalmente-coordinatore.pdf",file_path:`${companyId}/documenti/ordine/PSC.pdf`,data_documento:"2026-10-27",revisione:"02",sha256:"a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"}};
 const {layoutPdfPos}=await import("./posPdfLayout.ts");
 const layout=layoutPdfPos(d.contenuto?(await import("./posHtml.ts")).costruisciHtmlPos({...d,stato:"approvato"}):"",d.codiceCommessa||"X",0,identita.emessoIl);
 // I testi veri dei blocchi (non la loro concatenazione): nessuna parola più lunga di 28 caratteri senza un punto dove andare a capo
 const ZW=String.fromCharCode(0x200b);
 const testi:string[]=[];
 const raccogli=(x:unknown):void=>{if(Array.isArray(x))x.forEach(raccogli);else if(x&&typeof x==="object"){for(const [k,v] of Object.entries(x as Record<string,unknown>)){if(k==="text"&&typeof v==="string")testi.push(v);else raccogli(v);}}};
 raccogli(layout.definizione.content);
 assert.ok(testi.length>100);
 for(const t of testi)for(const parola of t.split(new RegExp("[\\s"+ZW+"]+")))assert.ok(parola.length<=28,`parola troppo lunga: ${parola}`);
 // e togliendo i separatori il valore c'è tutto
 const piatto=testi.join("\n").replaceAll(ZW,"");
 assert.ok(piatto.includes("amministrazione.contabilita@costruzionirossi-edilizia.it"));
 assert.ok(piatto.includes("a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"));
 const pdf=await generaPdfPos(d,identita.emessoIl);
 assert.equal(new TextDecoder().decode(pdf.bytes.slice(0,5)),"%PDF-");
});
Deno.test("PDF: sopra i 90 KB di HTML i sottotitoli non entrano nella regola di salto pagina (costo CPU), sotto sì",async()=>{
 const {layoutPdfPos}=await import("./posPdfLayout.ts");
 const {costruisciHtmlPos}=await import("./posHtml.ts");
 const livelli=(html:string)=>{
  const l=layoutPdfPos(html,"X",0,identita.emessoIl,true);
  const soloTesto=(l.definizione.content as Array<Record<string,unknown>>).filter(b=>typeof b.text==="string"&&b.headlineLevel!==undefined);
  return {h3:soloTesto.filter(b=>b.fontSize===11).map(b=>b.headlineLevel),sezioni:l.sezioni.length};
 };
 const piccolo=dati();piccolo.stato="bozza";
 const lp=livelli(costruisciHtmlPos(piccolo));
 assert.ok(lp.h3.length>0);assert.ok(lp.h3.every(x=>x===1),"documento piccolo: regola piena");
 const grande=dati();grande.stato="bozza";
 const l0=grande.contenuto.lavorazioni[0];
 grande.contenuto.lavorazioni=Array.from({length:40},(_,i)=>({...l0,id:`l${i}`,titolo:`Lavorazione ${i+1}`,descrizione:"Descrizione ".repeat(80)}));
 const html=costruisciHtmlPos(grande);assert.ok(html.length>90_000,`serve un HTML grande, è ${html.length}`);
 const lg=livelli(html);
 assert.ok(lg.h3.length>0);assert.ok(lg.h3.every(x=>x===2),"documento grande: i sottotitoli fuori dalla regola");assert.equal(lg.sezioni,11);
});
