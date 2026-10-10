import { beforeEach, describe, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({company:'demo' as string|null,tables:{} as Record<string,Record<string,unknown>[]>,requests:[] as {table:string;filters:[string,string,unknown][];from:number;to:number}[],errorTable:''}));
vi.mock('@tanstack/react-query',()=>({useQuery:(options:unknown)=>options}));
vi.mock('@/hooks/useEffectiveCompanyId',()=>({useEffectiveCompanyId:()=>state.company}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{
  const request={table,filters:[] as [string,string,unknown][],from:0,to:0};
  const builder={select:()=>builder,order:()=>builder,
    eq:(column:string,value:unknown)=>{request.filters.push(['eq',column,value]);return builder;},
    is:(column:string,value:unknown)=>{request.filters.push(['eq',column,value]);return builder;},
    in:(column:string,value:unknown)=>{request.filters.push(['in',column,value]);return builder;},
    or:(filter:string)=>{request.filters.push(['or','',filter]);return builder;},
    gte:(column:string,value:unknown)=>{request.filters.push(['gte',column,value]);return builder;},
    lte:(column:string,value:unknown)=>{request.filters.push(['lte',column,value]);return builder;},
    range:async(from:number,to:number)=>{
      Object.assign(request,{from,to});state.requests.push(request);
      const rows=(state.tables[table]??[]).filter(row=>request.filters.every(([mode,key,v])=>mode==='or'?true:mode==='eq'?row[key]===v:mode==='in'?(v as unknown[]).includes(row[key]):mode==='gte'?Number(row[key])>=Number(v):String(row[key])<=String(v)));
      return {data:rows.slice(from,to+1),error:state.errorTable===table?new Error('Read failed'):null};
    }};return builder;
}}}));
import { useOrderMaterialUsage } from '@/hooks/useOrderMaterialUsage';
import { useCashFlow } from '@/hooks/controlloGestione/useCashFlow';
type Options<T>={queryKey:unknown[];enabled:boolean;queryFn:()=>Promise<T>};
beforeEach(()=>{state.company='demo';state.requests=[];state.errorTable='';state.tables={bank_accounts:[{id:'bank',company_id:'demo',is_active:true,currency:'EUR',current_balance:1000,balance_updated_at:'2026-10-10T00:00:00Z'}],scadenze:[],company_costs:[],prima_nota_entries:[],order_installments:[],cg_cash_flow_manuali:[],warehouse_movements:[],campo_rapportini:[],warehouse_stock:[]};});
describe('operations tenant-scoped read models',()=>{
  it('reads material pages beyond the server cap, while excluding other companies',async()=>{
    state.tables.warehouse_movements=Array.from({length:1001},(_,i)=>({id:String(i),company_id:'demo',order_id:'job',stock_item_id:'cement',quantity:1,movement_type:'scarico',unit_cost:10}));
    state.tables.warehouse_movements.push({id:'other',company_id:'other',order_id:'job',stock_item_id:'cement',quantity:999,movement_type:'scarico',unit_cost:10});
    state.tables.warehouse_stock=[{id:'cement',company_id:'demo',name:'Cemento'}];
    const config=useOrderMaterialUsage('demo','job') as unknown as Options<{rows:{delivered:number}[]}>;
    expect((await config.queryFn()).rows[0].delivered).toBe(1001);
    expect(state.requests.filter(r=>r.table==='warehouse_movements').map(r=>r.from)).toEqual([0,500,1000]);
    expect(state.requests.every(r=>r.filters.some(f=>f[1]==='company_id'&&f[2]==='demo'))).toBe(true);
  });
  it('keeps material cache tenant-specific and disables without tenant',()=>{
    expect((useOrderMaterialUsage('demo','job') as unknown as Options<unknown>).queryKey).toEqual(['order-material-usage','job','demo']);
    expect((useOrderMaterialUsage(null,'job') as unknown as Options<unknown>).enabled).toBe(false);
  });
  it('uses the selected company on every forecast table, including joined installments',async()=>{
    const config=useCashFlow(new Date().getFullYear()) as unknown as Options<{meta:{company_id:string;saldo_apertura:number}}>;
    expect((await config.queryFn()).meta).toMatchObject({company_id:'demo',saldo_apertura:1000});
    expect(state.requests).toHaveLength(6);
    expect(state.requests.every(r=>r.filters.some(f=>['company_id','orders.company_id'].includes(f[1])&&f[2]==='demo'))).toBe(true);
    expect(config.queryKey.at(-1)).toBe('demo');
  });
  it('does not turn missing bank balances or database failures into a zero cash forecast',async()=>{
    const config=useCashFlow(new Date().getFullYear()) as unknown as Options<unknown>;
    state.tables.bank_accounts[0].current_balance=null;
    await expect(config.queryFn()).rejects.toThrow(/saldo/);
    state.errorTable='scadenze';await expect(config.queryFn()).rejects.toThrow('Read failed');
  });
  it('does not request a forecast for a historical year or without company context',()=>{
    expect((useCashFlow(new Date().getFullYear()-1) as unknown as Options<unknown>).enabled).toBe(false);
    state.company=null;expect((useCashFlow(new Date().getFullYear()) as unknown as Options<unknown>).enabled).toBe(false);
  });
});
