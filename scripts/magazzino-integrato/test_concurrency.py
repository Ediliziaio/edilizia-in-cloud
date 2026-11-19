"""Processi PostgreSQL separati sullo schema integrato; pulizia solo dei record di test."""
import concurrent.futures,time,unittest,json
from db import *
from load_history import COMPANY,ADMIN,STAFF,VIEWER
import test_integrated as integration_cases
from test_integrated import uid
from reconcile import fingerprint
class Concurrency(unittest.TestCase):
 def setUp(self):
  self.before=fingerprint();self.f=integration_cases.Integrated();self.f.setUp();sql('BEGIN;'+self.f.setup+'COMMIT;');self.keys=[]
 def tearDown(self):
  f=self.f
  sql(f"""BEGIN;SET LOCAL session_replication_role=replica;
   DELETE FROM public.automation_trigger_events WHERE entity_id IN(SELECT id::text FROM public.company_costs WHERE purchase_order_id={lit(f.po)});
   DELETE FROM public.company_costs WHERE purchase_order_id={lit(f.po)};
   DELETE FROM public.documenti_fiscali WHERE ordine_id={lit(f.o)};
   DELETE FROM public.warehouse_operation_requests WHERE company_id={lit(COMPANY)} AND (payload::text LIKE {lit('%'+f.s+'%')} OR payload::text LIKE {lit('%'+f.po+'%')} OR payload::text LIKE {lit('%'+f.i+'%')});
   DELETE FROM public.warehouse_receipt_reconciliations_v4 WHERE id IN (SELECT reconciliation_id FROM public.warehouse_receipt_opening_balances_v4 WHERE purchase_order_item_id={lit(f.pi)});
   DELETE FROM public.warehouse_receipt_opening_balances_v4 WHERE purchase_order_item_id={lit(f.pi)};
   DELETE FROM public.warehouse_oda_scan_receipts_v3 WHERE purchase_order_id={lit(f.po)};
   DELETE FROM public.warehouse_scan_events WHERE purchase_order_id={lit(f.po)} OR resolved_stock_item_id={lit(f.s)};
   DELETE FROM public.warehouse_uscite WHERE order_id={lit(f.o)};
   DELETE FROM public.warehouse_movements WHERE stock_item_id={lit(f.s)};
   DELETE FROM public.procurement_document_events WHERE purchase_order_id={lit(f.po)};
   DELETE FROM public.user_action_log WHERE record_id IN({lit(f.po)},{lit(f.pi)},{lit(f.s)},{lit(f.i)});
   DELETE FROM public.goods_receipts WHERE order_item_id={lit(f.i)};
   DELETE FROM public.purchase_order_items WHERE purchase_order_id={lit(f.po)};
   DELETE FROM public.purchase_orders WHERE id={lit(f.po)};
   DELETE FROM public.order_items WHERE id={lit(f.i)};
   DELETE FROM public.warehouse_stock WHERE id={lit(f.s)};
   DELETE FROM public.orders WHERE id={lit(f.o)};
   DELETE FROM public.suppliers WHERE id={lit(f.v)};
   DELETE FROM public.warehouse_assignments WHERE company_id={lit(COMPANY)} AND user_id IN({lit(STAFF)},{lit(VIEWER)});
   COMMIT;""")
  self.assertEqual(fingerprint(),self.before,'Record storici modificati dai casi concorrenti')
 def parallel(self,*fn):
  def safe(call):
   try:return call()
   except DbError as e:return e
  with concurrent.futures.ThreadPoolExecutor(max_workers=len(fn)) as ex:return list(ex.map(safe,fn))
 def call(self,expr,hold=0):
  return sql('SELECT '+expr+(' ;SELECT pg_sleep('+str(hold)+')' if hold else ''),ADMIN,COMPANY)
 def test_01_same_request_concurrent_uses_one_carico(self):
  expr=self.f.receive(1.5,uid());r=self.parallel(lambda:self.call(expr,.3),lambda:self.call(expr))
  self.assertEqual(r[0],r[1]);self.assertIsInstance(r[0],dict)
  self.assertEqual(sql('SELECT quantity FROM warehouse_stock WHERE id='+lit(self.f.s)),1.5)
  self.assertEqual(sql('SELECT count(*) FROM warehouse_movements WHERE stock_item_id='+lit(self.f.s)),1)
 def test_02_competing_receipts_respect_shared_residual(self):
  r=self.parallel(lambda:self.call(self.f.receive(3),.3),lambda:self.call(self.f.receive(3)))
  self.assertEqual(sum(isinstance(x,DbError) for x in r),1,str(r));self.assertEqual(sql('SELECT quantity_received FROM purchase_order_items WHERE id='+lit(self.f.pi)),3)
 def test_03_reconciliation_plan_race_applies_once(self):
  sql('UPDATE purchase_order_items SET quantity_received=2 WHERE id='+lit(self.f.pi))
  p=sql('SELECT warehouse_receipt_reconciliation_preview_v4('+lit(COMPANY)+')');key=uid()
  def apply():return sql('SELECT warehouse_receipt_reconciliation_apply_v4('+','.join(lit(x) for x in [COMPANY,p['source_hash'],key])+')')
  r=self.parallel(apply,apply);self.assertEqual(r[0],r[1]);self.assertIsInstance(r[0],dict)
  self.assertEqual(sql('SELECT count(*) FROM warehouse_receipt_opening_balances_v4 WHERE purchase_order_item_id='+lit(self.f.pi)),1)
  sql('DELETE FROM warehouse_receipt_opening_balances_v4 WHERE purchase_order_item_id='+lit(self.f.pi)+';DELETE FROM warehouse_receipt_reconciliations_v4 WHERE id='+lit(key))
 def test_04_reservation_and_issue_share_lock_order_and_residual(self):
  f=self.f;self.call(f.receive(4))
  reserve='warehouse_reserve_v2('+','.join(lit(x) for x in [f.i,4,uid()])+')'
  issue='warehouse_register_uscita_v2('+','.join(lit(x) for x in [f.w,{'tipo':'cantiere','order_id':f.o},[{'stock_item_id':f.s,'order_item_id':f.i,'quantity':3}],uid(),None,None])+')'
  results=self.parallel(lambda:self.call(reserve,.2),lambda:self.call(issue))
  self.assertIsInstance(results[1],dict,str(results))
  if isinstance(results[0],DbError):self.assertIn('PT409',str(results[0]))
  state=sql("SELECT jsonb_build_object('q',quantity,'r',quantity_reserved,'a',quantity_available) FROM warehouse_stock WHERE id="+lit(f.s))
  self.assertEqual(state,{'q':1,'r':1,'a':0})
if __name__=='__main__':unittest.main(verbosity=2)
