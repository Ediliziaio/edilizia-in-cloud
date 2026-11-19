"""ODA/DDT e autorizzazioni su PostgreSQL nativo locale. Nessun servizio online."""
import unittest
from test_transazioni import C,OTHER,A,A2,DENIED,W,O,sql,rpc,uid,lit,stock,line,state,issue,parallel,DbError
from test_operazioni import seed_operations,W2,V

def oda(s,q=10,unit='m',status='confermato'):
 p,i=uid(),uid()
 sql(f"INSERT INTO purchase_orders(id,company_id,supplier_id,oda_number,status) VALUES({lit(p)},{lit(C)},{lit(V)},{lit('ODA-'+p)},{lit(status)});INSERT INTO purchase_order_items(id,company_id,purchase_order_id,description,quantity,unit_of_measure,stock_item_id,unit_price) VALUES({lit(i)},{lit(C)},{lit(p)},'Materiale',{q},{lit(unit)},{lit(s)},8)")
 return p,i

def receive(p,i,s,q=1,key=None,sns=None,wh=W,scans=None,ddt=None,**kw):
 return rpc('warehouse_receive_oda_v3',p,wh,scans or [{'stock_item_id':s,'oda_item_id':i,'quantity':q,'serial_numbers':sns or []}], 'DDT prova',ddt,key or uid(),**kw)
def ddt(u,extra=None,**kw):return sql(f'SELECT to_jsonb(r) FROM public.create_ddt_from_uscita({lit(u)},{lit(extra)}) r',kw.pop('actor',A),**kw)
def goods(l,q=1,key=None,wh=W,**kw):return rpc('warehouse_goods_receipt_v3',l,wh,q,'ok',None,None,None,None,None,None,key or uid(),**kw)
class Ricezioni(unittest.TestCase):
 def setUp(self):
  sql('TRUNCATE documenti_fiscali,fixture_ddt_numbers,goods_receipts,order_item_timeline,ddt_ricezione')
  seed_operations()
 def denied(self,fn,code=None):
  with self.assertRaises(DbError) as cm:fn()
  if code:self.assertIn(code,str(cm.exception))
 def test_01_fractional_receipt_updates_stock_movement_and_residual(self):
  s=stock();p,i=oda(s);r=receive(p,i,s,2.75)
  self.assertEqual(r['shipped_items'],1);self.assertFalse(r['oda_now_complete']);self.assertEqual(state(s)['quantity'],12.75)
  self.assertEqual(sql(f'SELECT quantity_received FROM purchase_order_items WHERE id={lit(i)}'),2.75)
  self.assertEqual(sql("SELECT quantity FROM warehouse_movements WHERE notes LIKE 'Carico da ODA%'"),2.75)
 def test_02_same_request_concurrent_commits_once(self):
  s=stock();p,i=oda(s);k=uid();r=parallel(lambda:receive(p,i,s,2.75,key=k,hold=.2),lambda:receive(p,i,s,2.75,key=k))
  self.assertEqual(r[0],r[1]);self.assertIsInstance(r[0],dict);self.assertEqual(state(s)['quantity'],12.75)
 def test_03_competing_receipts_cannot_exceed_order(self):
  s=stock();p,i=oda(s,5);r=parallel(lambda:receive(p,i,s,4,hold=.2),lambda:receive(p,i,s,4))
  self.assertEqual(sum(isinstance(x,DbError) for x in r),1);self.assertEqual(state(s)['quantity'],14)
 def test_04_full_receipt_replay_works_after_status_changed(self):
  s=stock();p,i=oda(s,3);k=uid();r=receive(p,i,s,3,key=k)
  self.assertTrue(r['oda_now_complete']);self.assertEqual(receive(p,i,s,3,key=k),r);self.assertEqual(state(s)['quantity'],13)
 def test_05_overreceipt_rolls_back_not_silent_cap(self):
  s=stock();p,i=oda(s,2);self.denied(lambda:receive(p,i,s,3),'PT409');self.assertEqual(state(s)['quantity'],10)
 def test_06_wrong_line_or_stock_rolls_back(self):
  s=stock();t=stock();p,i=oda(s);self.denied(lambda:receive(p,i,t),'22023');self.assertEqual(state(t)['quantity'],10)
 def test_07_cancelled_and_draft_orders_rejected(self):
  for status in ['bozza','annullato']:
   s=stock();p,i=oda(s,status=status);self.denied(lambda:receive(p,i,s),'PT409');self.assertEqual(state(s)['quantity'],10)
 def test_08_missing_or_unassigned_permissions_rejected(self):
  s=stock();p,i=oda(s)
  sql(f"INSERT INTO fixture_permissions VALUES({lit(DENIED)},{lit(C)},'can_view_warehouse');DELETE FROM fixture_permissions WHERE actor={lit(A2)} AND permission='fixture_company_admin'")
  self.denied(lambda:receive(p,i,s,actor=DENIED),'42501');self.denied(lambda:receive(p,i,s,actor=A2),'42501')
  sql(f'INSERT INTO warehouse_assignments(warehouse_id,user_id) VALUES({lit(W)},{lit(A2)})');self.assertEqual(receive(p,i,s,actor=A2)['shipped_items'],1)
 def test_09_foreign_company_warehouse_and_ddt_rejected(self):
  s=stock();p,i=oda(s);d=uid();sql(f'INSERT INTO ddt_ricezione(id,company_id) VALUES({lit(d)},{lit(OTHER)})')
  self.denied(lambda:receive(p,i,s,ddt=d),'42501');self.denied(lambda:receive(p,i,s,wh=W2),'42501')
  sql(f'UPDATE purchase_orders SET company_id={lit(OTHER)} WHERE id={lit(p)}');self.denied(lambda:receive(p,i,s),'42501')
 def test_10_serial_count_and_duplicates_are_atomic(self):
  s=stock(unit='pz',serial=True);p,i=oda(s,3,'pz')
  for sns in [[],['SN'],['SN','SN'],['','B']]:self.denied(lambda:receive(p,i,s,2,sns=sns),'22023')
  self.assertEqual(state(s)['quantity'],10);self.assertEqual(sql('SELECT count(*) FROM stock_units'),0)
 def test_11_serial_receipt_and_duplicate_serial_rollback(self):
  s=stock(unit='pz',serial=True);p,i=oda(s,4,'pz');r=receive(p,i,s,2,sns=['A','B']);self.assertEqual(r['created_units'],2)
  self.denied(lambda:receive(p,i,s,2,sns=['C','B']),'23505');self.assertEqual(state(s)['quantity'],12);self.assertEqual(sql('SELECT count(*) FROM stock_units'),2)
 def test_12_bad_second_line_rolls_back_first(self):
  s=stock();p,i=oda(s);self.denied(lambda:receive(p,i,s,scans=[{'stock_item_id':s,'oda_item_id':i,'quantity':2},{'stock_item_id':s,'quantity':-1}]),'22023')
  self.assertEqual(state(s)['quantity'],10);self.assertEqual(sql('SELECT sum(quantity_received) FROM purchase_order_items'),0)
 def test_13_nan_infinity_zero_and_pieces_fraction_rejected(self):
  s=stock(unit='pz');p,i=oda(s,10,'pz')
  for q in ['NaN','Infinity',0,-1,.5]:self.denied(lambda:receive(p,i,s,q),'22023')
 def test_14_extra_item_still_supported_but_cannot_bypass_oda_line(self):
  s=stock();t=stock();p,i=oda(s)
  self.assertEqual(receive(p,None,t)['shipped_items'],1);self.denied(lambda:receive(p,None,s),'22023')
 def test_15_su_misura_and_units_mismatch_rejected(self):
  s=stock();p,i=oda(s,10,'mq');self.denied(lambda:receive(p,i,s),'22023')
  l=line(s);sql(f'UPDATE purchase_order_items SET unit_of_measure=\'m\',order_item_id={lit(l)};UPDATE order_items SET gruppo_id={lit(uid())} WHERE id={lit(l)}');self.denied(lambda:receive(p,i,s),'22023')
 def test_16_request_cannot_change_payload_or_actor(self):
  s=stock();p,i=oda(s);k=uid();receive(p,i,s,key=k);self.denied(lambda:receive(p,i,s,2,key=k),'PT409');self.denied(lambda:receive(p,i,s,key=k,actor=A2),'PT409')
 def test_17_concurrent_ddt_is_one_draft_without_second_stock_out(self):
  s=stock();u=issue(s,2)['uscita_id'];r=parallel(lambda:ddt(u,hold=.2),lambda:ddt(u))
  self.assertEqual(r[0],r[1]);self.assertIsInstance(r[0],dict);self.assertEqual(sql('SELECT count(*) FROM documenti_fiscali'),1);self.assertEqual(sql('SELECT n FROM fixture_ddt_numbers'),1)
  self.assertEqual(state(s)['quantity'],8);self.assertEqual(sql('SELECT count(*) FROM warehouse_movements'),2);self.assertEqual(sql('SELECT stato FROM documenti_fiscali'),'bozza')
 def test_18_ddt_preserves_transport_snapshot_and_notes(self):
  s=stock();sql(f"UPDATE orders SET indirizzo_lavori='Via Cantiere 2' WHERE id={lit(O)}");u=issue(s,2)['uscita_id'];ddt(u,{'indirizzo_consegna':'Via Consegna 3','numero_colli':'2','note_documento':'Fragile'})
  self.assertEqual(sql("SELECT jsonb_build_object('causale',ddt_causale_trasporto,'address',ddt_indirizzo_consegna->>'indirizzo','colli',ddt_numero_colli) FROM documenti_fiscali"),{'causale':'trasferimento_cantiere','address':'Via Consegna 3','colli':2})
 def test_19_ddt_viewer_and_unassigned_cannot_create(self):
  s=stock();u=issue(s)['uscita_id'];sql(f"INSERT INTO fixture_permissions VALUES({lit(DENIED)},{lit(C)},'can_view_warehouse');DELETE FROM fixture_permissions WHERE actor={lit(A2)} AND permission='fixture_company_admin'")
  self.denied(lambda:ddt(u,actor=DENIED),'42501');self.denied(lambda:ddt(u,actor=A2),'42501');self.assertEqual(sql('SELECT count(*) FROM documenti_fiscali'),0)
 def test_20_ddt_foreign_and_bad_transport_roll_back_number(self):
  s=stock();u=issue(s)['uscita_id'];self.denied(lambda:ddt(u,{'numero_colli':'bad'}),'22P02');self.assertEqual(sql('SELECT count(*) FROM documenti_fiscali'),0);self.assertEqual(sql('SELECT count(*) FROM fixture_ddt_numbers'),0)
  sql(f'UPDATE warehouse_uscite SET company_id={lit(OTHER)} WHERE id={lit(u)}');self.denied(lambda:ddt(u))
 def test_21_goods_receipt_duplicate_request_once(self):
  s=stock();l=line(s,5);k=uid();r=parallel(lambda:goods(l,2,key=k,hold=.2),lambda:goods(l,2,key=k))
  self.assertEqual(r[0],r[1]);self.assertIsInstance(r[0],dict);self.assertEqual(sql('SELECT count(*) FROM goods_receipts'),1);self.assertEqual(sql('SELECT quantity_received FROM order_items'),2)
 def test_22_goods_receipt_overreceive_fraction_and_permission(self):
  s=stock();l=line(s,3);self.denied(lambda:goods(l,4),'PT409');goods(l,.5);self.assertEqual(state(s)['quantity'],10.5);self.denied(lambda:goods(line(stock(unit='pz'),3),.5),'22023');self.denied(lambda:goods(l,actor=DENIED),'42501')
  self.assertEqual(sql('SELECT count(*) FROM goods_receipts'),1)
 def test_23_goods_serials_must_use_scanning(self):
  l=line(stock(unit='pz',serial=True),3);self.denied(lambda:goods(l),'22023')
 def test_24_anon_cannot_execute_writes(self):
  s=stock();p,i=oda(s);self.denied(lambda:receive(p,i,s,role='anon'),'42501');self.denied(lambda:goods(line(s),role='anon'),'42501')
 def test_25_legacy_paths_also_check_permissions(self):
  s=stock();p,i=oda(s);l=line(s);sql(f"INSERT INTO fixture_permissions VALUES({lit(DENIED)},{lit(C)},'can_view_warehouse')");self.denied(lambda:rpc('receive_from_oda_via_scans',p,W,[{'stock_item_id':s,'oda_item_id':i,'quantity':1}],None,None,actor=DENIED),'42501')
  self.denied(lambda:rpc('insert_goods_receipt_atomic',l,W,1,'ok',None,None,None,None,None,None,actor=DENIED),'42501')
 def test_26_scan_and_documental_receipt_share_residual_and_stock(self):
  s=stock();l=line(s,10);p,i=oda(s,10);sql(f'UPDATE purchase_order_items SET order_item_id={lit(l)} WHERE id={lit(i)}')
  receive(p,i,s,2.75);goods(l,3)
  self.assertEqual(sql('SELECT quantity_received FROM purchase_order_items'),5.75);self.assertEqual(sql('SELECT quantity_received FROM order_items'),5.75);self.assertEqual(state(s)['quantity'],15.75)
  receive(p,i,s,4.25);self.assertEqual(sql('SELECT status FROM purchase_orders'),'ricevuto');self.assertEqual(state(s)['quantity'],20)
 def test_27_goods_ddt_after_scan_uses_combined_residual(self):
  s=stock();l=line(s,10);p,i=oda(s,10);d=uid();sql(f'UPDATE purchase_order_items SET order_item_id={lit(l)} WHERE id={lit(i)};INSERT INTO ddt_ricezione(id,company_id,purchase_order_id,warehouse_id) VALUES({lit(d)},{lit(C)},{lit(p)},{lit(W)})')
  receive(p,i,s,2.5)
  r=rpc('warehouse_goods_receipt_v3',l,W,3,'ok',None,None,None,d,None,None,uid());self.assertIsInstance(r,dict)
  self.assertEqual(sql('SELECT quantity_received FROM purchase_order_items'),5.5);self.assertEqual(state(s)['quantity'],15.5)
 def test_28_goods_receipt_uses_explicit_stock_identity_even_same_name(self):
  s=stock();t=stock();l=line(t);goods(l,2);self.assertEqual(state(s)['quantity'],10);self.assertEqual(state(t)['quantity'],12)
 def test_29_goods_receipt_into_other_depot_preserves_identity(self):
  s=stock();l=line(s);goods(l,2,wh=W2);dest=sql(f'SELECT stock_item_id::text FROM order_items WHERE id={lit(l)}');self.assertNotEqual(dest,s);self.assertEqual(state(dest)['quantity'],2);self.assertEqual(state(s)['quantity'],10)
 def test_30_competing_scan_and_goods_receipt_do_not_exceed_oda(self):
  s=stock();l=line(s,10);p,i=oda(s,5);sql(f'UPDATE purchase_order_items SET order_item_id={lit(l)} WHERE id={lit(i)}')
  r=parallel(lambda:receive(p,i,s,4,hold=.2),lambda:goods(l,4));self.assertEqual(sum(isinstance(x,DbError) for x in r),1);self.assertEqual(state(s)['quantity'],14)
 def test_31_first_partial_receipt_reserves_only_received_quantity(self):
  s=stock(0);l=line(s,10);goods(l,2);self.assertEqual(state(s),{'quantity':2,'reserved':2,'available':0})
 def test_32_first_partial_scan_reserves_only_received_quantity(self):
  s=stock(0);l=line(s,10);p,i=oda(s,10);sql(f'UPDATE purchase_order_items SET order_item_id={lit(l)} WHERE id={lit(i)}');receive(p,i,s,2.5);self.assertEqual(state(s),{'quantity':2.5,'reserved':2.5,'available':0})
 def test_33_internal_receipt_ledger_and_recalculation_are_not_public(self):
  self.denied(lambda:sql('SELECT * FROM public.warehouse_oda_scan_receipts_v3',A),'42501')
  self.denied(lambda:rpc('ricalcola_ricezione_oda',uid()),'42501')
  s=stock();u=issue(s)['uscita_id'];self.denied(lambda:ddt(u,role='anon'),'42501')
if __name__=='__main__' :unittest.main(verbosity=2)
