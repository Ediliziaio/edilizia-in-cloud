import { localWarehouseMode } from './mode';
const TABLES = new Set(['documenti_fiscali_elenco','documenti_fiscali_elenco_operativo','documenti_fiscali','warehouses','warehouse_stock','warehouse_movements','warehouse_uscite','warehouse_scan_events','warehouse_sections','warehouse_assignments','warehouse_lot_batches','warehouse_transfers','warehouse_transfer_items','stock_units','stock_lotti','orders','order_items','suppliers','customers','order_statuses','article_families','inventory_audits','purchase_orders','purchase_order_items','ddt_ricezione','ddt_righe','campo_rapportini','contratti_subappalto','v_subappaltatori_dashboard']);
const RPCS = new Set(['warehouse_receive_oda_v3','warehouse_goods_receipt_v3','wh_get_valorizzazione','wh_get_lotti_in_scadenza','warehouse_import_stock_v3','warehouse_transfer_v3','warehouse_transfer_list_v3','warehouse_inventory_preview_v3','warehouse_inventory_count_v3','warehouse_inventory_apply_v3','warehouse_inventory_list_v3','warehouse_reorder_preview_v3','warehouse_reorder_v3','warehouse_capabilities_v2','warehouse_register_carico_v2','warehouse_register_uscita_v2','warehouse_return_material_v2','warehouse_return_candidates_v2','warehouse_reserve_v2','magazzino_riepilogo','magazzino_in_arrivo','get_low_stock_alerts','get_blocked_orders','create_ddt_from_uscita']);
let session: Promise<{token:string}> | undefined;
export async function localBridge(path: string, payload: unknown) {
  session ??= fetch('/__magazzino_local/session', { credentials: 'omit', cache: 'no-store' }).then(async (r) => {
    if (!r.ok) throw new Error('Il database locale non è raggiungibile. Nessuna operazione online verrà eseguita.');
    return r.json() as Promise<{token:string}>;
  }).catch((error) => { session = undefined; throw error; });
  const {token} = await session;
  return fetch(`/__magazzino_local/${path}`, { method:'POST', credentials:'omit', headers:{'Content-Type':'application/json','X-Local-Fixture':token}, body:JSON.stringify(payload) });
}
/** Called only by the serve-only Vite transform. Never forwards JWT/apikey/headers. */
export async function warehouseLocalFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> {
  if (!localWarehouseMode()) return null;
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const resource = url.pathname.split('/rest/v1/')[1];
  const rpc = resource?.startsWith('rpc/') ? resource.slice(4) : undefined;
  const handled = resource && (rpc ? RPCS.has(rpc) : TABLES.has(resource));
  // Auth refresh and unrelated reads retain the signed-in user's session.
  // Every business write remains local or is refused, even after navigation.
  if (!handled) {
    if (!['GET','HEAD'].includes(method) && !url.pathname.startsWith('/auth/v1/')) return new Response(JSON.stringify({code:'P0001',message:'Questa operazione non è disponibile nel collaudo locale. Nessuna scrittura online eseguita.'}),{status:409,headers:{'Content-Type':'application/json'}});
    return null;
  }
  try {
    const body = init?.body ?? (input instanceof Request && !['GET','HEAD'].includes(method) ? await input.clone().text() : undefined);
    const response = await localBridge('bridge', { resource, method, params:[...url.searchParams], body:typeof body === 'string' && body ? JSON.parse(body) : null });
    const result = await response.json() as { data?:unknown; count?:number; error?:{code:string;message:string} };
    const headers = new Headers({'Content-Type':'application/json'});
    if (result.error) return new Response(JSON.stringify(result.error),{status:409,headers});
    headers.set('Content-Range',`0-${Math.max(0,(Array.isArray(result.data)?result.data.length:1)-1)}/${result.count ?? '*'}`);
    const accept = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get('accept');
    let data=result.data;
    if (accept?.includes('vnd.pgrst.object+json') && Array.isArray(data)) {
      if(data.length!==1) return new Response(JSON.stringify({code:'PGRST116',message:'Riga locale non trovata',details:'The result contains 0 rows'}),{status:406,headers});
      data=data[0];
    }
    return new Response(method==='HEAD'?null:JSON.stringify(data),{status:200,headers});
  } catch (error) {
    return new Response(JSON.stringify({message:(error as Error).message,code:'08006'}),{status:503,headers:{'Content-Type':'application/json'}});
  }
}
