"""Local-only transaction lab with synthetic stock; does not load application .env.
Run after test_transazioni.py: python3 scripts/magazzino-p2/server_locale.py
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from bridge import execute as bridge_execute
from pathlib import Path
import json, secrets, threading
from test_operazioni import seed_operations,W2,W3,V
from test_transazioni import A,C,W,O,O2,DbError,seed,stock,line,issue,serials,rpc,sql,lit,uid
ROOT=Path(__file__).resolve().parent
PORT=8117
LAB_HOSTS={f'127.0.0.1:{PORT}',f'localhost:{PORT}'}
LAB_ORIGINS={f'http://{host}' for host in LAB_HOSTS | {'127.0.0.1:8096','localhost:8096'}}
TOKEN=secrets.token_urlsafe(24)
DATA={}
LOCK=threading.Lock()
def reset():
    with LOCK:
        sql("TRUNCATE documenti_fiscali,fixture_ddt_numbers,goods_receipts,order_item_timeline,ddt_ricezione")
        seed_operations()
        sql(f"DELETE FROM warehouses WHERE id={lit(W3)}")
        cable=stock(20,'m',cost=10); cableline=line(cable,20);issue(cable,6.75,l=cableline)
        pump=stock(2,'pz',True,cost=150); pumpline=line(pump,2,unit='pz');serials(pump)
        issue(pump,2,l=pumpline,serials=['SN-A','SN-B'])
        panels=stock(10,'mq',cost=18);first=line(panels,6,unit='mq');second=line(panels,6,order=O2,unit='mq')
        for s,name in [(cable,'Cavo elettrico'),(pump,'Pompa con matricola'),(panels,'Pannelli isolamento')]:sql(f'UPDATE warehouse_stock SET name={lit(name)} WHERE id={lit(s)}')
        sql(f"UPDATE warehouse_stock SET supplier_id={lit(V)},min_stock_level=CASE WHEN id={lit(cable)} THEN 20 WHEN id={lit(panels)} THEN 14 ELSE 0 END,updated_at=now()")
        motor=stock(2,'pz',True,cost=120)
        sql(f"UPDATE warehouse_stock SET name='Motore con matricola' WHERE id={lit(motor)};INSERT INTO stock_units(company_id,stock_item_id,warehouse_id,serial_number,purchase_price,warranty_start_date,warranty_months,warranty_expires_at) VALUES({lit(C)},{lit(motor)},{lit(W)},'MOVE-01',120,'2026-02-03',24,'2028-02-03'),({lit(C)},{lit(motor)},{lit(W)},'MOVE-02',120,'2026-02-03',24,'2028-02-03')")
        DATA.clear();DATA.update(cable=cable,pump=pump,panels=panels,motor=motor,first=first,second=second,warehouse2=W2)
def snapshot():
    items=sql("SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'quantity',quantity,'reserved',quantity_reserved,'available',quantity_available,'unit',unita_misura,'tracking',tracking_mode) ORDER BY name),'[]') FROM warehouse_stock")
    candidates=rpc('warehouse_return_candidates_v2',O)
    counts=sql("SELECT jsonb_build_object('movements',(SELECT count(*) FROM warehouse_movements),'exits',(SELECT count(*) FROM warehouse_uscite),'requests',(SELECT count(*) FROM warehouse_operation_requests))")
    units=sql("SELECT coalesce(jsonb_agg(jsonb_build_object('serial',serial_number,'status',status,'warranty',warranty_expires_at) ORDER BY serial_number),'[]') FROM stock_units")
    reportpath=ROOT.parents[1]/'docs/ux/magazzino-p2/esito-transazioni.json'
    report=json.loads(reportpath.read_text()) if reportpath.exists() else None
    return {'items':items,'candidates':candidates,'counts':counts,'units':units,'proof':report,'fixture':DATA}
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def send(self,status,body,kind='application/json'):
        body=body.encode();self.send_response(status);self.send_header('Content-Type',kind+'; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def valid_host(self):return self.headers.get('Host') in LAB_HOSTS
    def do_GET(self):
        if not self.valid_host():return self.send(403,'{}')
        if self.path=='/':return self.send(200,(ROOT/'collaudo.html').read_text().replace('__LOCAL_TOKEN__',TOKEN),'text/html')
        if self.path=='/bridge/session':return self.send(200,json.dumps({'token':TOKEN}))
        if self.path=='/state':return self.send(200,json.dumps(snapshot()))
        return self.send(404,'{}')
    def do_POST(self):
        if not self.valid_host() or self.headers.get('Origin') not in LAB_ORIGINS or self.headers.get('X-Local-Fixture')!=TOKEN:return self.send(403,'{}')
        if int(self.headers.get('Content-Length','0'))>1024*1024:return self.send(413,'{}')
        try:
            p=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))))
            if self.path=='/bridge':
                result=bridge_execute(p)
                # Sonda locale: il commit avviene ma la risposta viene persa una volta.
                fault=Path('/private/tmp/eic-magazzino-audit-response-loss.json')
                if p.get('method')=='POST' and p.get('resource','').startswith('rpc/') and fault.exists():
                    configured=json.loads(fault.read_text())
                    if configured.get('resource')==p['resource']:
                        fault.unlink();return self.send(504,json.dumps({'error':{'code':'PGRST002','message':'Collaudo locale: risposta persa dopo la registrazione. Verifica l’esito.'}}))
                return self.send(200,json.dumps(result))
            if self.path=='/reset':reset();result={'message':'Dati di prova ripristinati'}
            elif self.path=='/reserve':
                l=p['line']
                if l not in (DATA['first'],DATA['second']):raise ValueError('Riga non valida')
                result=rpc('warehouse_reserve_v2',l,6,p['request'])
            elif self.path=='/return':
                candidate=next((r for r in rpc('warehouse_return_candidates_v2',O) if r['id']==p['candidate']),None)
                if not candidate:raise ValueError('Materiale non trovato')
                result=rpc('warehouse_return_material_v2',O,candidate['stockItemId'],candidate['orderItemId'],p['quantity'],p.get('serials',[]),p['request'],p['expected'])
            elif self.path=='/issue':
                if p['stock'] not in (DATA['cable'],DATA['panels']):raise ValueError('Usa un articolo fungibile')
                result=rpc('warehouse_register_uscita_v2',W,{'tipo':'cantiere','order_id':O},[{'stock_item_id':p['stock'],'quantity':p['quantity']}],p['request'],None,None)
            elif self.path=='/receive':
                if p['stock']!=DATA['cable']:raise ValueError('Usa il cavo di prova')
                result=rpc('warehouse_register_carico_v2',W,None,[{'stock_item_id':p['stock'],'quantity':p['quantity'],'offline_client_uuid':p['event'],'unit_price':14}],p['request'],None,None)
            else:return self.send(404,'{}')
            self.send(200,json.dumps({'ok':True,'result':result}))
        except (DbError,ValueError,KeyError) as e:
            if self.path=='/bridge':
                import re
                found=re.search(r'ERROR:\s+(\w+): (.*)',str(e));code=found.group(1) if found else 'P0001';message=found.group(2) if found else str(e)
                self.send(409,json.dumps({'error':{'code':code,'message':message}}))
            else:self.send(409,json.dumps({'ok':False,'error':str(e)}))
if __name__=='__main__':
    with ThreadingHTTPServer(('127.0.0.1',PORT),Handler) as server:
        reset()
        print(f'Collaudo locale: http://127.0.0.1:{PORT} — solo PostgreSQL sintetico 127.0.0.1:55439',flush=True)
        server.serve_forever()
