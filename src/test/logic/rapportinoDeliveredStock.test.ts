import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRapportinoDeliveredStock } from '@/lib/campo/loadRapportinoDeliveredStock';
import { buildRapportinoMaterials, restoreRapportinoMaterials } from '@/lib/campo/rapportinoMaterials';
const api=vi.hoisted(()=>({from:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:api.from}}));
beforeEach(()=>vi.clearAllMocks());
const setup=(moves:Record<string,unknown>[],stocks:Record<string,unknown>[],error:Error|null=null)=>{
  const calls:Record<string,ReturnType<typeof vi.fn>>={};
  api.from.mockImplementation((table:string)=>{
    const result={data:table==='warehouse_movements'?moves:stocks,error:table==='warehouse_movements'?error:null};
    const q={select:vi.fn(),eq:vi.fn(),lt:vi.fn(),in:vi.fn(),order:vi.fn(),range:vi.fn().mockResolvedValue(result),then:Promise.resolve(result).then.bind(Promise.resolve(result))};
    for(const method of ['select','eq','lt','in','order']as const)q[method].mockReturnValue(q);
    calls[table]=q as unknown as ReturnType<typeof vi.fn>;return q;
  });
  return calls as unknown as Record<string,{select:ReturnType<typeof vi.fn>;eq:ReturnType<typeof vi.fn>;lt:ReturnType<typeof vi.fn>;in:ReturnType<typeof vi.fn>;range:ReturnType<typeof vi.fn>}>;
};
describe('report choices from explicit visible deliveries',()=>{
  it('scopes both queries, reads no prices and respects Italian day end',async()=>{
    const calls=setup([{id:'m',stock_item_id:'s',order_item_id:'parent'}],[{id:'s',name:'Malta'}]);
    const choices=await loadRapportinoDeliveredStock('job','tenant','2026-10-25');
    expect(choices).toEqual([{id:'libero_stock_s',name:'Malta',categoria:'Materiali',stock_item_id:'s',order_item_id:'parent'}]);
    expect(calls.warehouse_movements.eq).toHaveBeenCalledWith('company_id','tenant');
    expect(calls.warehouse_movements.eq).toHaveBeenCalledWith('order_id','job');
    expect(calls.warehouse_movements.lt).toHaveBeenCalledWith('created_at','2026-10-25T23:00:00.000Z');
    expect(calls.warehouse_stock.in).toHaveBeenCalledWith('id',['s']);
    expect(calls.warehouse_stock.eq).toHaveBeenCalledWith('company_id','tenant');
    for(const q of Object.values(calls))expect(q.select.mock.calls[0][0]).not.toMatch(/price|cost|\*/);
  });
  it.each([['p','other'],['p',null]])('does not guess a parent for shared or unlinked stock %s / %s',async(a,b)=>{
    setup([{id:'m1',stock_item_id:'s',order_item_id:a},{id:'m2',stock_item_id:'s',order_item_id:b}],[{id:'s',name:'Malta'}]);
    expect((await loadRapportinoDeliveredStock('job','tenant','2026-10-10'))[0].order_item_id).toBeNull();
  });
  it('does not query a warehouse-wide catalog when no visible deliveries exist',async()=>{
    setup([],[]);expect(await loadRapportinoDeliveredStock('job','tenant','2026-10-10')).toEqual([]);
    expect(api.from).toHaveBeenCalledTimes(1);
  });
  it('reads deliveries beyond the first 500 without losing stock identities',async()=>{
    const first=Array.from({length:500},(_,i)=>({id:`m-${i}`,stock_item_id:'s1',order_item_id:'p1'}));
    const last=[{id:'m-500',stock_item_id:'s2',order_item_id:'p2'}];
    const calls=setup([], [{id:'s1',name:'Malta'},{id:'s2',name:'Cemento'}]);
    const original=api.from.getMockImplementation()!;
    const range=vi.fn((offset:number)=>Promise.resolve({data:offset===0?first:last,error:null}));
    api.from.mockImplementation((table:string)=>{
      const query=original(table);
      if(table==='warehouse_movements')query.range=range;
      return query;
    });
    const choices=await loadRapportinoDeliveredStock('job','tenant','2026-10-10');
    expect(choices.map(c=>c.stock_item_id)).toEqual(['s2','s1']);
    expect(calls.warehouse_movements.range.mock.calls).toEqual([[0,499],[500,999]]);
    expect(calls.warehouse_stock.in).toHaveBeenCalledWith('id',['s1','s2']);
  });
  it('does not expose an identity whose stock row is hidden by existing access rules',async()=>{
    setup([{id:'m',stock_item_id:'hidden',order_item_id:'p'}],[]);
    expect(await loadRapportinoDeliveredStock('job','tenant','2026-10-10')).toEqual([]);
  });
  it('does not hide access/network errors or guess identities from names',async()=>{
    setup([],[],new Error('Accesso/rete'));await expect(loadRapportinoDeliveredStock('job','tenant','2026-10-10')).rejects.toThrow('Accesso/rete');
  });
  it('validates the date and scope before reading',async()=>{
    await expect(loadRapportinoDeliveredStock('job','tenant','2026-02-31')).rejects.toThrow(/Data/);
    await expect(loadRapportinoDeliveredStock('job','','2026-10-10')).rejects.toThrow(/azienda/);
    expect(api.from).not.toHaveBeenCalled();
  });
  it('reopening a stock-only choice retains its stable key and does not invent an order item',()=>{
    const row={nome:'Malta',quantita:2,unita:'sacchi',stock_item_id:'s'};
    const restored=restoreRapportinoMaterials([row]);expect(restored.libero_stock_s).toBeDefined();
    expect(buildRapportinoMaterials(restored)).toEqual([{...row,da_furgone:false}]);
  });
});
