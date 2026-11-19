"""Narrow PostgREST-shaped adapter for the actual warehouse components.
Reads are from synthetic fixtures, RPC writes call the same tested PostgreSQL functions.
No credentials, arbitrary SQL, external URLs, or production connection are accepted.
"""
import re, json, datetime
from test_transazioni import A,C,W,O,O2,sql,rpc,lit
REAL_TABLES={'documenti_fiscali','warehouses','warehouse_stock','warehouse_movements','warehouse_uscite','warehouse_scan_events','warehouse_sections','stock_units','order_items','orders','suppliers','customers','campo_rapportini','ddt_ricezione','warehouse_transfers','warehouse_transfer_items','inventory_audits','purchase_orders','purchase_order_items'}
EMPTY_TABLES={'warehouse_assignments','warehouse_lot_batches','stock_lotti','order_statuses','article_families','ddt_righe','contratti_subappalto','v_subappaltatori_dashboard'}
RPC_ARGS={
 'create_ddt_from_uscita':['p_uscita_id','p_ddt_extra'],
 'warehouse_receive_oda_v3':['p_oda_id','p_warehouse_id','p_scans','p_ddt_number','p_ddt_ricezione_id','p_request_id'],
 'warehouse_goods_receipt_v3':['p_order_item_id','p_warehouse_id','p_quantity_received','p_quality_check_status','p_supplier_id','p_ddt_number','p_ddt_photo_url','p_ddt_ricezione_id','p_quality_notes','p_notes','p_request_id'],
 'wh_get_valorizzazione':['p_company_id','p_method','p_warehouse_id'],
 'wh_get_lotti_in_scadenza':['p_company_id','p_days_ahead'],
 'warehouse_import_stock_v3':['p_company_id','p_warehouse_id','p_items','p_request_id'],
 'warehouse_transfer_v3':['p_company_id','p_from_warehouse_id','p_to_warehouse_id','p_transfer_date','p_notes','p_items','p_request_id'],
 'warehouse_transfer_list_v3':['p_company_id'],
 'warehouse_inventory_preview_v3':['p_stock_item_id'],
 'warehouse_inventory_count_v3':['p_stock_item_id','p_counted','p_snapshot','p_serial_numbers','p_notes','p_request_id'],
 'warehouse_inventory_apply_v3':['p_audit_id','p_request_id'],
 'warehouse_inventory_list_v3':['p_company_id','p_stock_item_id'],
 'warehouse_reorder_preview_v3':['p_company_id','p_warehouse_id'],
 'warehouse_reorder_v3':['p_company_id','p_supplier_id','p_lines','p_warehouse_id','p_request_id'],
 'warehouse_capabilities_v2':['p_company_id'],
 'warehouse_register_carico_v2':['p_warehouse_id','p_supplier_id','p_scans','p_request_id','p_ddt_ricezione_id','p_notes'],
 'warehouse_register_uscita_v2':['p_warehouse_id','p_destinatario','p_scans','p_request_id','p_vettore','p_note'],
 'warehouse_return_material_v2':['p_order_id','p_stock_item_id','p_order_item_id','p_quantity','p_serial_numbers','p_request_id','p_expected_returned'],
 'warehouse_return_candidates_v2':['p_order_id'],
 'warehouse_reserve_v2':['p_order_item_id','p_quantity','p_request_id'],
}
def raw_rows(table):
    if table in ('documenti_fiscali_elenco','documenti_fiscali_elenco_operativo'):
        return [dict(r,totale_documento=0,deleted_at=None) for r in raw_rows('documenti_fiscali')]
    if table in EMPTY_TABLES:return []
    if table not in REAL_TABLES:raise ValueError('Lettura non disponibile nel collaudo locale: '+table)
    return sql('SELECT coalesce(jsonb_agg(to_jsonb(t)),\'[]\'::jsonb) FROM (SELECT * FROM public.'+table+' LIMIT 10000) t')
def enriched(table):
    rows=raw_rows(table)
    if table=='orders':
        for i,r in enumerate(sorted(rows,key=lambda x:x['id'])):
            r.update(order_code='LOC-'+str(i+1).zfill(3),client_name='Cliente di prova '+str(i+1),client_company='Impresa di prova',customer={'first_name':'Cliente','last_name':'di prova'},description='Cantiere locale di collaudo',status='in_corso',expected_date=datetime.date.today().isoformat(),work_start_date=datetime.date.today().isoformat(),work_end_date=None,current_status_id=None,parent_order_id=None,is_master=False,indirizzo_lavori='Via di prova 1',work_address='Via di prova 1',default_warehouse_id=W,order_items=[{'destination_warehouse_id':W}])
    elif table in ('order_items','warehouse_movements','warehouse_stock','warehouse_uscite','stock_units'):
        orders={r['id']:r for r in enriched('orders')}
        stocks={r['id']:r for r in raw_rows('warehouse_stock')}
        warehouses={r['id']:r for r in raw_rows('warehouses')}
        for r in rows:
            r['order']=orders.get(r.get('order_id'));r['orders']=r['order']
            r['stock_item']=stocks.get(r.get('stock_item_id'));r['warehouse_stock']=r['stock_item']
            r['warehouse']=warehouses.get(r.get('warehouse_id'));r['warehouses']=r['warehouse']
            r['supplier']=None;r['section']=None;r['customer']=None
            if table=='order_items':r['destination_warehouse_id']=W
    elif table=='purchase_orders':
        suppliers={r['id']:r for r in raw_rows('suppliers')}
        items=raw_rows('purchase_order_items')
        for r in rows:
            r['supplier']=suppliers.get(r['supplier_id']);r['suppliers']=r['supplier'];r['purchase_order_items']=[i for i in items if i['purchase_order_id']==r['id']]
    return rows

def split_top(value):
    parts=[];level=0;start=0;quoted=False
    for i,c in enumerate(value):
        if c=='"':quoted=not quoted
        if quoted:continue
        if c=='(':level+=1
        if c==')':level-=1
        if c==',' and level==0:parts.append(value[start:i]);start=i+1
    parts.append(value[start:]);return parts

def at(row,key):
    result=row
    for name in key.split('.'):
        if not isinstance(result,dict):return None
        result=result.get(name)
    return result

def matches(row,key,condition):
    if key in ('or','and'):
        tokens=split_top(condition[1:-1] if condition.startswith('(') and condition.endswith(')') else condition)
        def one(token):
            if token.startswith('and(') or token.startswith('or('):return matches(row,token.split('(')[0],token[token.index('('):])
            field,op,value=token.split('.',2);return matches(row,field,op+'.'+value)
        return any(one(t) for t in tokens) if key=='or' else all(one(t) for t in tokens)
    neg=condition.startswith('not.')
    if neg:condition=condition[4:]
    op,_,value=condition.partition('.')
    actual=at(row,key)
    if key.endswith('company_id'):value=C if op=='eq' else value
    if op=='is':result=actual is None if value=='null' else actual is (value=='true')
    elif op=='in':result=str(actual) in [s.strip('"') for s in split_top(value.strip('()'))]
    elif op in ('ilike','like'):
        pattern='^'+re.escape(value).replace('%','.*').replace(r'\*','.*')+'$';result=re.match(pattern,str(actual or ''),re.I if op=='ilike' else 0) is not None
    elif op in ('eq','neq'):
        expected=None if value=='null' else value=='true' if value in ('true','false') else value
        result=str(actual)==str(expected)
        if op=='neq':result=not result
    elif op in ('gte','gt','lte','lt'):
        if actual is None:return False
        try:a,b=float(actual),float(value)
        except (ValueError,TypeError):a,b=str(actual),value
        result={'gte':lambda:a>=b,'gt':lambda:a>b,'lte':lambda:a<=b,'lt':lambda:a<b}[op]()
    else:raise ValueError('Filtro locale non supportato: '+op)
    return not result if neg else result

def summary(warehouse=None):
    stock=[r for r in raw_rows('warehouse_stock') if not warehouse or r['warehouse_id']==warehouse]
    items=raw_rows('order_items');counts={key:{'n':0,'commesse':0,'valore':0} for key in ('in_ritardo','in_magazzino','ordinato','da_ordinare')}
    for key in counts:
        chosen=[r for r in items if r['status']==key];counts[key]={'n':len(chosen),'commesse':len({r['order_id'] for r in chosen}),'valore':sum(float(r.get('quantity') or 0)*float(r.get('purchase_price') or 0) for r in chosen)}
    return {'righe':counts,'articoli':{'n':len(stock),'con_giacenza':sum(r['quantity']>0 for r in stock),'valore':sum(r['quantity']*r['unit_cost'] for r in stock),'senza_costo':sum(r['unit_cost']<=0 for r in stock),'negativi':sum(r['quantity']<0 for r in stock),'sotto_scorta':sum(r['quantity_available']<r['min_stock_level'] for r in stock),'impegnato':sum(r['quantity_reserved']>0 for r in stock)},'in_arrivo':{'quantita':0,'articoli':0}}

def execute(payload):
    resource=payload['resource'];method=payload['method'];params=payload.get('params',[]);body=payload.get('body') or {}
    if resource.startswith('rpc/'):
        name=resource[4:]
        if name in RPC_ARGS:
            args={**body,'p_company_id':C}
            if name=='create_ddt_from_uscita':
                result=sql('SELECT jsonb_agg(to_jsonb(r)) FROM public.create_ddt_from_uscita('+lit(args.get('p_uscita_id'))+','+lit(args.get('p_ddt_extra'))+') r',A)
            else:result=rpc(name,*[args.get(key) for key in RPC_ARGS[name]])
            if name in ('wh_get_valorizzazione','wh_get_lotti_in_scadenza') and isinstance(result,dict) and 'meta' in result:
                result={**result,'meta':{**result['meta'],'company_id':(payload.get('body') or {}).get('p_company_id') or C}}
        elif name=='magazzino_riepilogo':result=summary(body.get('p_warehouse_id'))
        elif name in ('magazzino_in_arrivo','get_blocked_orders'):result=[]
        elif name=='get_low_stock_alerts':result=[dict(r,stock_item_id=r['id'],deficit=r['min_stock_level']-r['quantity_available'],supplier_name=None,section_name=None) for r in raw_rows('warehouse_stock') if r['quantity_available']<r['min_stock_level']]
        else:raise ValueError('Funzione non disponibile nel collaudo locale: '+name)
        return {'data':result}
    if method not in ('GET','HEAD'):raise ValueError('Nel collaudo i movimenti passano soltanto dalle funzioni transazionali. Nessuna modifica online eseguita.')
    rows=enriched(resource)
    for key,value in params:
        if key not in ('select','order','limit','offset','columns','on_conflict'):
            rows=[r for r in rows if matches(r,key,value)]
    count=len(rows)
    for key,value in params:
        if key=='order':
            for field in reversed(value.split(',')):
                parts=field.split('.');rows.sort(key=lambda row:(at(row,parts[0]) is None,str(at(row,parts[0]))),reverse='desc' in parts)
    values=dict(params);offset=int(values.get('offset',0));limit=int(values.get('limit',1000))
    return {'data':rows[offset:offset+min(limit,1000)],'count':count}
