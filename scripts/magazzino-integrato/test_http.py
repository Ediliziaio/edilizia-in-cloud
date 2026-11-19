"""HTTP reale PostgREST locale, JWT firmati sintetici. Mai URL o credenziali remoti."""
import base64,hashlib,hmac,json,time,unittest,urllib.request,urllib.error,subprocess
from pathlib import Path
from db import ARGS,lit
from load_history import COMPANY,ADMIN,STAFF,VIEWER,DENIED
import test_integrated as base
from test_integrated import uid
PRIVATE=Path.home()/'Library/Caches/EdiliziaInCloud/magazzino-release-frozen-20261118/http-private.json'
CONFIG=json.loads(PRIVATE.read_text());assert CONFIG['database']=='eic_magazzino_http'
DB=[*ARGS];DB[-1]='eic_magazzino_http'
def sql(q):
 p=subprocess.run(DB,input=q,text=True,capture_output=True)
 if p.returncode:raise RuntimeError(p.stderr)
 lines=[x for x in p.stdout.splitlines() if x.strip()]
 return json.loads(lines[-1]) if lines else None
def enc(x):return base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).decode().rstrip('=')
def jwt(actor=ADMIN,**claims):
 h=enc({'alg':'HS256','typ':'JWT'});p=enc({'role':'authenticated','sub':actor,'iat':int(time.time()),'exp':int(time.time())+300,**claims});signature=base64.urlsafe_b64encode(hmac.new(CONFIG['jwt_secret'].encode(),(h+'.'+p).encode(),hashlib.sha256).digest()).decode().rstrip('=');return h+'.'+p+'.'+signature
def http(path,body=None,actor=ADMIN,method=None,token=None):
 headers={'Content-Type':'application/json','X-Azienda-Scheda':COMPANY,'Prefer':'return=representation'}
 if actor is not None:headers['Authorization']='Bearer '+(token or jwt(actor))
 request=urllib.request.Request('http://127.0.0.1:8098/'+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method or ('POST' if body is not None else 'GET'))
 try:
  with urllib.request.urlopen(request,timeout=20) as r:return r.status,json.loads(r.read() or 'null')
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read() or 'null')
class HttpSecurity(unittest.TestCase):
 def setUp(self):
  self.f=base.Integrated();self.f.setUp();sql("BEGIN;"+self.f.setup.replace("Fornitore collaudo", "Fornitore HTTP "+self.f.v)+"COMMIT;")
 def rpc(self,name,payload,actor=ADMIN):return http('rpc/'+name,payload,actor)
 def receive(self,q,key=None):return self.rpc('warehouse_receive_oda_v3',{'p_oda_id':self.f.po,'p_warehouse_id':self.f.w,'p_scans':[{'stock_item_id':self.f.s,'oda_item_id':self.f.pi,'quantity':q,'serial_numbers':[]}],'p_ddt_number':None,'p_ddt_ricezione_id':None,'p_request_id':key or uid()})
 def balance(self):return sql('SELECT jsonb_build_object(\'q\',quantity,\'r\',quantity_reserved,\'a\',quantity_available) FROM warehouse_stock WHERE id='+lit(self.f.s))
 def test_01_signed_jwt_reads_own_company(self):
  status,data=http('warehouse_stock?id=eq.'+self.f.s+'&select=id,quantity');self.assertEqual(status,200,data);self.assertEqual(data[0]['id'],self.f.s)
 def test_02_expired_token_is_rejected(self):
  status,_=http('warehouse_stock?select=id',token=jwt(exp=int(time.time())-120));self.assertEqual(status,401)
 def test_03_tampered_signature_is_rejected(self):
  token=jwt();header,payload,signature=token.split('.');signature=('A' if signature[0]!='A' else 'B')+signature[1:];status,_=http('warehouse_stock?select=id',token=header+'.'+payload+'.'+signature);self.assertEqual(status,401)
 def test_04_unsigned_token_is_rejected(self):
  token=enc({'alg':'none'})+'.'+enc({'role':'authenticated','sub':ADMIN,'exp':int(time.time())+300})+'.';status,_=http('warehouse_stock?select=id',token=token);self.assertEqual(status,401)
 def test_05_anonymous_cannot_write(self):
  status,_=http('rpc/warehouse_reserve_v2',{'p_order_item_id':self.f.i,'p_quantity':1,'p_request_id':uid()},actor=None);self.assertIn(status,[401,403,404]);self.assertEqual(self.balance()['r'],0)
 def test_06_viewer_cannot_change_stock(self):
  status,data=http('warehouse_stock?id=eq.'+self.f.s,{'quantity':100},VIEWER,method='PATCH');self.assertTrue(status in [401,403] or data==[],(status,data));self.assertEqual(self.balance()['q'],0)
 def test_07_foreign_company_is_hidden(self):
  status,data=http('warehouse_stock?id=eq.'+self.f.s+'&select=id',actor=DENIED);self.assertTrue(status in [401,403] or data==[],(status,data))
 def test_08_user_metadata_cannot_grant_permission(self):
  status,data=http('rpc/warehouse_reserve_v2',{'p_order_item_id':self.f.i,'p_quantity':1,'p_request_id':uid()},VIEWER,token=jwt(VIEWER,user_metadata={'role':'company_admin','can_edit_warehouse':True}));self.assertIn(status,[401,403],data)
 def test_09_oda_issue_ddt_return_with_replay(self):
  status,data=self.receive(1.5);self.assertEqual(status,200,data)
  key=uid();status,data=self.receive(2.5,key);self.assertEqual(status,200,data);status,replayed=self.receive(2.5,key);self.assertEqual(status,200,replayed);self.assertEqual(data,replayed)
  self.assertEqual(self.balance(),{'q':4,'r':4,'a':0})
  status,issue=self.rpc('warehouse_register_uscita_v2',{'p_warehouse_id':self.f.w,'p_destinatario':{'tipo':'cantiere','order_id':self.f.o},'p_scans':[{'stock_item_id':self.f.s,'order_item_id':self.f.i,'quantity':1.25}],'p_request_id':uid()});self.assertEqual(status,200,issue)
  ddt={'p_uscita_id':issue['uscita_id'],'p_ddt_extra':{}};status,doc=self.rpc('create_ddt_from_uscita',ddt);self.assertEqual(status,200,doc);status,doc2=self.rpc('create_ddt_from_uscita',ddt);self.assertEqual(status,200,doc2);self.assertEqual(doc,doc2)
  status,data=self.rpc('warehouse_return_material_v2',{'p_order_id':self.f.o,'p_stock_item_id':self.f.s,'p_order_item_id':self.f.i,'p_quantity':.5,'p_serial_numbers':[],'p_request_id':uid(),'p_expected_returned':0});self.assertEqual(status,200,data)
  self.assertEqual(self.balance(),{'q':3.25,'r':2.75,'a':.5});self.assertEqual(sql('SELECT count(*) FROM company_costs WHERE purchase_order_id='+lit(self.f.po)),1);self.assertEqual(sql('SELECT count(*) FROM documenti_fiscali WHERE ordine_id='+lit(self.f.o)),1)
 def test_10_goods_receipt_and_cancellation(self):
  status,result=self.rpc('warehouse_goods_receipt_v3',{'p_order_item_id':self.f.i,'p_warehouse_id':self.f.w,'p_quantity_received':1.5,'p_quality_check_status':'ok','p_request_id':uid(),'p_supplier_id':None,'p_ddt_number':None,'p_ddt_photo_url':None,'p_ddt_ricezione_id':None,'p_quality_notes':None,'p_notes':None});self.assertEqual(status,200,result)
  self.assertEqual(self.balance()['q'],1.5)
  status,data=http('goods_receipts?id=eq.'+result['receipt_id'],actor=ADMIN,method='DELETE');self.assertIn(status,[200,204],data);self.assertEqual(self.balance()['q'],0)
 def test_11_internal_reconciliation_not_public(self):
  status,_=self.rpc('warehouse_receipt_reconciliation_preview_v4',{'p_company_id':COMPANY});self.assertIn(status,[401,403,404])
if __name__=='__main__':unittest.main(verbosity=2)
