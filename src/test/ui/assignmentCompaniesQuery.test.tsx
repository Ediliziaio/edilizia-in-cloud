import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssignmentCompanies } from '@/hooks/useAssignmentCompanies';
import type { AssignmentSubcontractor, AssignmentTeam } from '@/lib/orders/assignmentCompanies';
const m=vi.hoisted(()=>({configs:[] as {queryKey:unknown[];enabled:boolean;queryFn:()=>Promise<unknown>}[],calls:[] as {table:string;company?:unknown;from?:number}[],teams:[] as AssignmentTeam[],subs:[] as AssignmentSubcontractor[],errorTable:''}));
vi.mock('@tanstack/react-query',()=>({useQuery:(config:typeof m.configs[number])=>{m.configs.push(config);return {data:undefined as undefined};}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{
  const call:{table:string;company?:unknown;from?:number}={table};m.calls.push(call);
  const q={select:()=>q,eq:(field:string,value:unknown)=>{if(field==='company_id')call.company=value;return q;},order:()=>q,range:async(from:number,to:number)=>{call.from=from;return {data:(table==='external_teams'?m.teams:m.subs).slice(from,to+1),error:m.errorTable===table?{message:'Lettura negata'}:null};}};return q;
}}}));
beforeEach(()=>{m.configs=[];m.calls=[];m.teams=[];m.subs=[];m.errorTable='';});afterEach(cleanup);
describe('lettura ditte assegnabili multi-azienda, senza creazioni all’apertura',()=>{
  it('carica entrambe le fonti e include i subappaltatori privi di squadra',async()=>{
    m.subs=[{id:'sub',company_id:'company',ragione_sociale:'Ditta sintetica',is_active:true}];
    renderHook(()=>useAssignmentCompanies('company',true));
    const result=await m.configs[0].queryFn();
    expect(result).toEqual([expect.objectContaining({id:'subappaltatore:sub',subappaltatoreId:'sub'})]);
    expect(m.calls.map(call=>call.table)).toEqual(['external_teams','subappaltatori']);expect(m.calls.every(call=>call.company==='company')).toBe(true);
  });
  it('pagina oltre il limite API e non tronca silenziosamente l’elenco',async()=>{
    m.subs=Array.from({length:1003},(_,i)=>({id:String(i),company_id:'company',ragione_sociale:`Ditta ${i}`,is_active:true}));
    renderHook(()=>useAssignmentCompanies('company',true));expect(await m.configs[0].queryFn()).toHaveLength(1003);
    expect(m.calls.filter(call=>call.table==='subappaltatori').map(call=>call.from)).toEqual([0,250,500,750,1000]);
  });
  it.each(['external_teams','subappaltatori'])('propaga un errore su %s invece di mostrare un vuoto',async table=>{
    m.errorTable=table;renderHook(()=>useAssignmentCompanies('company',true));await expect(m.configs[0].queryFn()).rejects.toThrow('Lettura negata');
  });
  it('non legge a finestra chiusa o senza azienda e separa la cache per tenant',()=>{
    const hook=renderHook(({company,enabled})=>useAssignmentCompanies(company,enabled),{initialProps:{company:'company',enabled:false}});
    expect(m.configs.at(-1)?.enabled).toBe(false);expect(m.calls).toHaveLength(0);
    hook.rerender({company:'other',enabled:true});expect(m.configs.at(-1)?.queryKey).toEqual(['assignment-companies','other']);
  });
});
