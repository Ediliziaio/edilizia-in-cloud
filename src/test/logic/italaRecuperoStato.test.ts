import {beforeEach,describe,it,expect,vi} from 'vitest';
import {importItala} from '../../../supabase/functions/_shared/importItala';
const {invoicePage}=vi.hoisted(()=>({invoicePage:vi.fn()}));
vi.mock('../../../supabase/functions/_shared/italaSecrets.ts',()=>({italaClientFromStored:async()=>({invoicePage})}));
const integration={id:'int-A',company_id:'company-A',api_key:'platform:itala',provider_vat_number:'02010390439'};
function backend(initial:Record<string,unknown>|null=null,locked=false){
 let state=initial;
 let lease:string|null=null;
 const from=(table:string)=>{
  let patch:Record<string,unknown>|null=null;
  const result=(): {data:null;error:null}=>{
   if(table==='billing_integrations' && patch){
    if('import_stato' in patch) state=patch.import_stato as Record<string,unknown>;
    if('import_in_corso_da' in patch) lease=patch.import_in_corso_da as string|null;
   }
   return {data:null,error:null};
  };
  const builder={
   update:(p:Record<string,unknown>)=>{patch=p;return builder;},
   eq:()=>builder,or:()=>builder,select:()=>builder,insert:()=>builder,
   maybeSingle:async(): Promise<{data:Record<string,string>|null;error:null}>=>{
    if(table==='anagrafica_azienda') return {data:{partita_iva:'02010390439'},error:null as null};
    if(table==='companies') return {data:{vat_number:'02010390439'},error:null};
    if(locked) return {data:null as null,error:null as null};
    result();return {data:{id:integration.id},error:null};
   },
   single:async()=>({data:{import_stato:state},error:null as null}),
   then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result()).then(resolve),
  };
  return builder;
 };
 return {client:{from},state:()=>state,lease:()=>lease};
}
const running=(extra:Record<string,unknown>={})=>({provider:'itala',in_corso:true,pagina:8,avviato_il:'2026-10-27T09:00:00Z',da:'2026-10-25',aggiornato_fino_a:'2026-10-26T09:00:00Z',elaborati:70,importati:70,aggiornati:0,falliti:0,errori:[] as string[],errori_consecutivi:0,...extra});
beforeEach(()=>{invoicePage.mockReset();invoicePage.mockResolvedValue([]);});
describe('Recupero ITALA persistente',()=>{
 it('un giro già preso in carico non avvia chiamate duplicate',async()=>{
  const b=backend(null,true);
  expect(await importItala(b.client as never,integration)).toMatchObject({gia_in_corso:true});
  expect(invoicePage).not.toHaveBeenCalled();
 });
 it('riprende dal cursore salvato anche a pagina chiusa e libera il controllo',async()=>{
  const b=backend(running());
  const r=await importItala(b.client as never,integration,true);
  expect(invoicePage).toHaveBeenCalledWith('02010390439',8,10,{date_from:'2026-10-25'});
  expect(r).toMatchObject({in_corso:false,next_page:null});
  expect(b.state()).toMatchObject({pagina:9,aggiornato_fino_a:'2026-10-27T09:00:00Z'});
  expect(b.lease()).toBeNull();
 });
 it('un nuovo giro conserva un giorno di margine per gli aggiornamenti tardivi',async()=>{
  const b=backend(running({in_corso:false,aggiornato_fino_a:'2026-10-26T09:00:00Z'}));
  await importItala(b.client as never,integration);
  expect(invoicePage).toHaveBeenCalledWith('02010390439',1,10,{date_from:'2026-10-25'});
 });
 it('un errore ripetuto non avanza e imposta una pausa con errore visibile',async()=>{
  invoicePage.mockRejectedValue(new Error('Provider temporaneamente indisponibile'));
  const b=backend(running({errori_consecutivi:2}));
  await expect(importItala(b.client as never,integration,true)).rejects.toThrow('indisponibile');
  expect(b.state()).toMatchObject({pagina:8,in_corso:true,errori_consecutivi:3,errori:['Provider temporaneamente indisponibile']});
  expect(Date.parse(String(b.state()?.sospeso_fino_a))).toBeGreaterThan(Date.now());
  expect(b.lease()).toBeNull();
 });
 it('il cron rispetta la pausa ed evita di ricominciare giri terminati',async()=>{
  for(const state of [running({sospeso_fino_a:new Date(Date.now()+3_600_000).toISOString()}),running({in_corso:false})]){
   const b=backend(state);expect(await importItala(b.client as never,integration,true)).toMatchObject({nulla_da_fare:true});
   expect(b.lease()).toBeNull();
  }
  expect(invoicePage).not.toHaveBeenCalled();
 });
});
