import { beforeEach, describe, expect, it, vi } from 'vitest';
import { warehouseLocalFetch } from '../../../dev/magazzino-local/bridge-client';
const fetchMock=vi.fn();
beforeEach(()=>{sessionStorage.clear();vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();});
describe('Isolamento del collaudo Magazzino dentro il gestionale',()=>{
  it('non intercetta il gestionale normale',async()=>{
    expect(await warehouseLocalFetch('https://example.invalid/rest/v1/warehouse_stock')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rifiuta una scrittura non supportata e non la invia online',async()=>{
    sessionStorage.setItem('eic-magazzino-local-preview','1');
    const res=await warehouseLocalFetch('https://example.invalid/rest/v1/rpc/register_warehouse_uscita',{method:'POST',body:'{}'});
    expect(res?.status).toBe(409);expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['warehouse_stock','documenti_fiscali','documenti_fiscali_elenco','documenti_fiscali_elenco_operativo'])('legge %s solo dal laboratorio e non inoltra JWT o chiave API',async(resource)=>{
    sessionStorage.setItem('eic-magazzino-local-preview','1');
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
    sessionStorage.setItem('eic-magazzino-local-preview','1');
    fetchMock.mockRejectedValue(new TypeError('local service offline'));
    const res=await warehouseLocalFetch('https://example.invalid/rest/v1/warehouse_stock');
    expect(res?.status).toBe(503);expect((await res?.json()).code).toBe('08006');
  });
});
