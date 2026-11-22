import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { beforeEach, expect, it, vi } from 'vitest';
import { jsonDalModello } from '../../../supabase/functions/email-ai-estrai-allegato/jsonDalModello';
import { calcolaTentativoEstrazione } from '../../../supabase/functions/email-ai-estrai-allegato/tentativi';
import { bytesToBase64 } from '../../../supabase/functions/_shared/base64';
import * as validation from '../../../supabase/functions/_shared/doc-validation';
import { allegatoDentroAzienda } from '../../../supabase/functions/email-ai-estrai-allegato/percorso';

const raw=readFileSync('supabase/functions/email-ai-estrai-allegato/index.ts','utf8');
const tree=ts.createSourceFile('endpoint.ts',raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const withoutImports=ts.createPrinter().printList(ts.ListFormat.MultiLine,ts.factory.createNodeArray(tree.statements.filter(x=>!ts.isImportDeclaration(x))),tree);
const code=ts.transpileModule(withoutImports,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
class CreditoAiInsufficiente extends Error {constructor(public messaggio:string){super(messaggio);}}
let visible:boolean,allowed:boolean,presa:Record<string,unknown>,claimError:unknown,saveError:unknown,path:string;
const provider=vi.fn(),download=vi.fn(),rpc=vi.fn();
const draft={id:'draft',email_id:'email',stato:'da_confermare'};
let handler:(r:Request)=>Promise<Response>;
function from(table:string){
  const chain={select:()=>chain,eq:()=>chain,limit:()=>chain,ilike:()=>chain,
    maybeSingle:async()=>({data:table==='email_inbox'?(visible?{id:'email',company_id:'company',user_id:'user',attachments:[{filename:'fattura.pdf',mime:'application/pdf',storage_path:path}]}:null):table==='email_documento_estratto'?draft:null,error:null as Error|null}),
    upsert:async()=>({data:null as unknown,error:null as Error|null})};
  return chain;
}
beforeEach(()=>{
  visible=true;allowed=true;presa={presa:true};claimError=null;saveError=null;path='company/pdf';
  provider.mockReset().mockResolvedValue({content:'{"tipo":"fattura","campi":{},"dati_incerti":[]}',finish_reason:'stop'});
  download.mockReset().mockResolvedValue({data:new Blob(['%PDF-fixture']),error:null});
  rpc.mockReset().mockImplementation(async(name:string)=>({data:name==='email_ai_prendi_lavoro'?presa:name==='email_ai_salva_bozza'?draft:true,error:name==='email_ai_prendi_lavoro'?claimError:name==='email_ai_salva_bozza'?saveError:null}));
  const db={from,rpc,auth:{getUser:async()=>({data:{user:{id:'user'}}})},storage:{from:()=>({download})}};
  vm.runInNewContext(code,{Deno:{env:{get:(key:string)=>key==='PROACTIVE_CRON_SECRET'?'fixture-secret':'fixture'}},
    serveConMetricheRapida:(_name:string,fn:typeof handler)=>{handler=fn;},createClient:()=>db,
    checkPaymentMethod:async()=>({allowed,message:'Carta mancante'}),PAYMENT_METHOD_REQUIRED_MESSAGE:'Carta mancante',
    getCorsHeaders:()=>({}),callOpenRouterAddebitato:provider,CreditoAiInsufficiente,
    jsonDalModello,calcolaTentativoEstrazione,bytesToBase64,allegatoDentroAzienda,...validation,
    Response,Request,Blob,crypto:webcrypto,console:{error(){},warn(){},log(){}},
  });
});
const call=(cron=false)=>handler(new Request('https://fixture.invalid/email-ai-estrai-allegato',{method:'POST',headers:cron?{'x-cron-secret':'fixture-secret'}:{Authorization:'Bearer fixture'},body:JSON.stringify({email_id:'email',attachment_index:0})}));
it('nega un’email non accessibile prima di claim, download e provider',async()=>{
  visible=false;expect((await call()).status).toBe(404);expect(rpc).not.toHaveBeenCalled();expect(provider).not.toHaveBeenCalled();
});
it.each(['altra-azienda/pdf','company/../altra/pdf','company/%2e%2e/altra/pdf','company\\altra.pdf'])('rifiuta il percorso %s prima di spendere o scaricare',async p=>{
  path=p;expect((await call()).status).toBe(403);expect(download).not.toHaveBeenCalled();expect(provider).not.toHaveBeenCalled();
});
it('mantiene compatibile il percorso storico del proprietario dell’email',async()=>{
  path='user/storico.pdf';expect((await call()).status).toBe(200);expect(provider).toHaveBeenCalledTimes(1);
});
it('una richiesta senza identità è rifiutata',async()=>{
  expect((await handler(new Request('https://fixture.invalid',{method:'POST',body:'{}'}))).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
it('carta mancante: 402 per la UI, attesa prevista per cron, nessun download o AI',async()=>{
  allowed=false;expect((await call()).status).toBe(402);
  const cron=await call(true);expect(cron.status).toBe(200);expect((await cron.json()).skipped).toBe('in_attesa');
  expect(provider).not.toHaveBeenCalled();expect(download).not.toHaveBeenCalled();
});
it('se un altro worker ha il documento risponde 202 e non lo rilegge',async()=>{
  presa={presa:false,motivo:'in_corso'};expect((await call()).status).toBe(202);
  expect(provider).not.toHaveBeenCalled();expect(download).not.toHaveBeenCalled();
});
it('una bozza già pronta viene riutilizzata senza un’altra chiamata a pagamento',async()=>{
  presa={presa:false,motivo:'gia_pronto',bozza_id:'draft'};
  expect(await (await call()).json()).toMatchObject({ok:true,riutilizzato:true,draft});expect(provider).not.toHaveBeenCalled();
});
it('un errore del claim chiude il percorso prima di sostenere costi',async()=>{
  claimError={message:'temporaneo'};expect((await call()).status).toBe(503);expect(provider).not.toHaveBeenCalled();
});
it('il download fallito usa i tentativi tecnici e rilascia soltanto il proprio token',async()=>{
  download.mockResolvedValue({data:null,error:new Error('fixture')});expect((await call()).status).toBe(502);
  expect(provider).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith('email_ai_registra_fallimento',expect.objectContaining({p_esito:'vision_error'}));
  expect(rpc).toHaveBeenCalledWith('email_ai_rilascia_lavoro',expect.objectContaining({p_email:'email',p_token:expect.any(String)}));
});
it('salva attraverso la RPC atomica, mantenendo il documento da confermare',async()=>{
  expect(await (await call()).json()).toMatchObject({ok:true,draft});
  expect(rpc).toHaveBeenCalledWith('email_ai_salva_bozza',expect.objectContaining({p_dati:expect.objectContaining({stato:'da_confermare'})}));
  expect(provider).toHaveBeenCalledTimes(1);
});
it('un worker scaduto non trasforma il conflitto in un nuovo tentativo tecnico',async()=>{
  saveError={code:'40001'};expect((await call()).status).toBe(409);
  expect(rpc.mock.calls.some(([name])=>name==='email_ai_registra_fallimento')).toBe(false);
});
it('il blocco credito sopravvenuto non consuma tentativi tecnici',async()=>{
  provider.mockRejectedValue(new CreditoAiInsufficiente('Credito esaurito'));
  expect((await call()).status).toBe(402);
  expect(rpc).toHaveBeenCalledWith('email_ai_registra_fallimento',expect.objectContaining({p_esito:'credito'}));
});
