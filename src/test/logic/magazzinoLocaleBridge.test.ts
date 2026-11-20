import { beforeEach, describe, expect, it, vi } from 'vitest';
const fetchMock=vi.fn();
beforeEach(()=>{
  vi.resetModules();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/azienda/ordini");
  vi.stubGlobal('fetch',fetchMock);
  fetchMock.mockReset();
});
async function bridge(warehouse = false) {
  if (warehouse) window.history.replaceState({}, "", "/azienda/magazzino?warehouseLocal=1");
  return (await import('../../../dev/magazzino-local/bridge-client')).warehouseLocalFetch;
}
describe('Isolamento del collaudo Magazzino dentro il gestionale',()=>{
  it('non intercetta il gestionale normale',async()=>{
    sessionStorage.setItem('eic-magazzino-local-preview','1');
    const warehouseLocalFetch = await bridge();
    expect(await warehouseLocalFetch('https://example.invalid/rest/v1/warehouse_stock')).toBeNull();
    expect(sessionStorage.getItem('eic-magazzino-local-preview')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rifiuta una scrittura non supportata e non la invia online',async()=>{
    const warehouseLocalFetch = await bridge(true);
    // Prima del reload, un effetto rimasto in coda conserva il confine locale.
    window.history.replaceState({}, "", "/azienda/ordini");
    const res=await warehouseLocalFetch('https://example.invalid/rest/v1/rpc/register_warehouse_uscita',{method:'POST',body:'{}'});
    expect(res?.status).toBe(409);expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['warehouse_stock','documenti_fiscali','documenti_fiscali_elenco','documenti_fiscali_elenco_operativo'])('legge %s solo dal laboratorio e non inoltra JWT o chiave API',async(resource)=>{
    const warehouseLocalFetch = await bridge(true);
    fetchMock.mockImplementation(async(url:string)=>new Response(JSON.stringify(url.endsWith('/session')?{token:'local-token'}:{data:[{id:'local-item'}],count:1}),{status:200}));
    const res=await warehouseLocalFetch(`https://example.invalid/rest/v1/${resource}?company_id=eq.online-company`,{headers:{Authorization:'Bearer should-not-forward',apikey:'should-not-forward'}});
    expect(await res?.json()).toEqual([{id:'local-item'}]);
    const [url,options]=fetchMock.mock.calls.at(-1)!;
    expect(url).toBe('/__magazzino_local/bridge');
    expect(options.credentials).toBe('omit');
    expect(options.headers).not.toHaveProperty('Authorization');expect(options.headers).not.toHaveProperty('apikey');
    expect(res?.headers.get('Content-Range')).toBe('0-0/1');
  });
  it('un errore locale non fa ripiegare sulla rete online',async()=>{
    const warehouseLocalFetch = await bridge(true);
    fetchMock.mockRejectedValue(new TypeError('local service offline'));
    const res=await warehouseLocalFetch('https://example.invalid/rest/v1/warehouse_stock');
    expect(res?.status).toBe(503);
    await expect(res?.json()).resolves.toMatchObject({code:'08006'});
  });
  it('rifiuta una pagina HTML restituita da un altro server sulla porta del laboratorio',async()=>{
    const warehouseLocalFetch = await bridge(true);
    fetchMock.mockResolvedValue(new Response('<!doctype html>',{status:200,headers:{'Content-Type':'text/html'}}));
    const res=await warehouseLocalFetch('https://example.invalid/rest/v1/warehouse_stock');
    expect(res?.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('se la sessione locale scade mostra un errore e la rinnova al prossimo tentativo',async()=>{
    const warehouseLocalFetch = await bridge(true);
    const stock = 'https://example.invalid/rest/v1/warehouse_stock';
    fetchMock
      .mockResolvedValueOnce(new Response('{"token":"vecchio"}'))
      .mockResolvedValueOnce(new Response('{}',{status:403}))
      .mockResolvedValueOnce(new Response('{"token":"nuovo"}'))
      .mockResolvedValueOnce(new Response('{"data":[]}'));
    expect((await warehouseLocalFetch(stock))?.status).toBe(403);
    expect(await (await warehouseLocalFetch(stock))?.json()).toEqual([]);
    expect(fetchMock.mock.calls.at(-1)?.[1].headers['X-Local-Fixture']).toBe('nuovo');
  });
});
