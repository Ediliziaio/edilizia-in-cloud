"""Casi su schema/policy/trigger reali, tutti in transazioni con rollback."""
import json,unittest,uuid
from db import *
from load_history import COMPANY,OTHER,ADMIN,STAFF,VIEWER,DENIED

def uid():return str(uuid.uuid4())
class Integrated(unittest.TestCase):
 def setUp(self):
  self.w=sql('SELECT id::text FROM warehouses WHERE company_id='+lit(COMPANY)+' ORDER BY is_default DESC,id LIMIT 1')
  self.v,self.o,self.s,self.i,self.po,self.pi=[uid() for _ in range(6)]
  self.setup=f"""
   INSERT INTO warehouse_assignments(company_id,warehouse_id,user_id) VALUES({lit(COMPANY)},{lit(self.w)},{lit(STAFF)}),({lit(COMPANY)},{lit(self.w)},{lit(VIEWER)}) ON CONFLICT DO NOTHING;
   INSERT INTO suppliers(id,company_id,name) VALUES({lit(self.v)},{lit(COMPANY)},'Fornitore collaudo');
   INSERT INTO orders(id,company_id,description,order_code) VALUES({lit(self.o)},{lit(COMPANY)},'Collaudo integrato',{lit('LOC-'+self.o)});
   INSERT INTO warehouse_stock(id,company_id,warehouse_id,name,quantity,unit_cost,unita_misura,tracking_mode) VALUES({lit(self.s)},{lit(COMPANY)},{lit(self.w)},{lit('Articolo '+self.s)},0,10,'m','fungible');
   INSERT INTO order_items(id,order_id,name,quantity,stock_item_id,unita_misura,purchase_price) VALUES({lit(self.i)},{lit(self.o)},'Posizione collaudo',4,{lit(self.s)},'m',10);
   INSERT INTO purchase_orders(id,company_id,supplier_id,oda_number,status,order_id,delivery_warehouse_id) VALUES({lit(self.po)},{lit(COMPANY)},{lit(self.v)},{lit('LOC-'+self.po)},'confermato',{lit(self.o)},{lit(self.w)});
   INSERT INTO purchase_order_items(id,company_id,purchase_order_id,order_item_id,stock_item_id,description,quantity,unit_of_measure,unit_price) VALUES({lit(self.pi)},{lit(COMPANY)},{lit(self.po)},{lit(self.i)},{lit(self.s)},'Posizione collaudo',4,'m',10);
  """
 def context(self,actor):return f"SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub={lit(actor)};SET LOCAL request.jwt.claims={lit(json.dumps({'sub':actor,'role':'authenticated'}))};SET LOCAL request.headers={lit(json.dumps({'x-azienda-scheda':COMPANY}))};"
 def case(self,statement,actor=ADMIN):return sql("BEGIN;SET LOCAL statement_timeout='15s';"+self.setup+self.context(actor)+statement+';ROLLBACK;')
 def receive(self,q,key=None):return 'public.warehouse_receive_oda_v3('+','.join(lit(x) for x in [self.po,self.w,[{'stock_item_id':self.s,'oda_item_id':self.pi,'quantity':q,'serial_numbers':[]}],None,None,key or uid()])+')'
 def goods(self,q,key=None,quality='ok'):return 'public.warehouse_goods_receipt_v3('+','.join(lit(x) for x in [self.i,self.w,q,quality,None,None,None,None,None,None,key or uid()])+')'
 def denied(self,expression,actor):
  self.case(f"DO $$BEGIN BEGIN PERFORM {expression};RAISE EXCEPTION 'Operazione accettata senza permesso';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;SELECT true",actor)
 def test_01_partial_scan_real_triggers_preserve_fraction_and_no_cost_yet(self):
  r=self.case('SELECT '+self.receive(1.5)+f";RESET ROLE;SELECT jsonb_build_object('stock',(SELECT quantity FROM warehouse_stock WHERE id={lit(self.s)}),'reserved',(SELECT quantity_reserved FROM warehouse_stock WHERE id={lit(self.s)}),'received',(SELECT quantity_received FROM purchase_order_items WHERE id={lit(self.pi)}),'costs',(SELECT count(*) FROM company_costs WHERE purchase_order_id={lit(self.po)}))")
  self.assertEqual(r,{'stock':1.5,'reserved':1.5,'received':1.5,'costs':0})
 def test_02_completion_creates_one_real_cost_and_automation_event(self):
  k=uid();expr=self.receive(4,k)
  r=self.case('SELECT '+expr+';SELECT '+expr+f";RESET ROLE;SELECT jsonb_build_object('costs',(SELECT count(*) FROM company_costs WHERE purchase_order_id={lit(self.po)}),'amount',(SELECT sum(amount) FROM company_costs WHERE purchase_order_id={lit(self.po)}),'events',(SELECT count(*) FROM automation_trigger_events WHERE entity_id IN (SELECT id::text FROM company_costs WHERE purchase_order_id={lit(self.po)})))")
  self.assertEqual(r,{'costs':1,'amount':40,'events':1})
 def test_03_assigned_staff_can_receive_with_real_permissions(self):
  r=self.case('SELECT '+self.receive(1),STAFF);self.assertEqual(r['shipped_items'],1)
 def test_04_viewer_cannot_receive_via_rpc(self):self.denied(self.receive(1),VIEWER)
 def test_05_foreign_company_cannot_receive_via_rpc(self):self.denied(self.receive(1),DENIED)
 def test_06_duplicate_goods_receipt_is_one_carico(self):
  k=uid();g=self.goods(1,k);r=self.case('SELECT '+g+';SELECT '+g+f";RESET ROLE;SELECT jsonb_build_object('receipts',(SELECT count(*) FROM goods_receipts WHERE order_item_id={lit(self.i)}),'stock',(SELECT quantity FROM warehouse_stock WHERE id={lit(self.s)}),'movements',(SELECT count(*) FROM warehouse_movements WHERE stock_item_id={lit(self.s)}))")
  self.assertEqual(r,{'receipts':1,'stock':1,'movements':1})
 def test_07_scan_and_receipt_share_residual_with_real_trigger_chain(self):
  r=self.case('SELECT '+self.receive(1.5)+';SELECT '+self.goods(1)+f";RESET ROLE;SELECT jsonb_build_object('received',(SELECT quantity_received FROM purchase_order_items WHERE id={lit(self.pi)}),'stock',(SELECT quantity FROM warehouse_stock WHERE id={lit(self.s)}))")
  self.assertEqual(r,{'received':2.5,'stock':2.5})
 def test_08_ddt_uses_real_fiscal_generator_once(self):
  issue='public.warehouse_register_uscita_v2('+','.join(lit(x) for x in [self.w,{'tipo':'cantiere','order_id':self.o},[{'stock_item_id':self.s,'quantity':1}],uid(),None,None])+')'
  r=self.case('SELECT '+self.receive(4)+';CREATE TEMP TABLE exit_result AS SELECT '+issue+" r;CREATE TEMP TABLE ddt_first AS SELECT * FROM create_ddt_from_uscita((SELECT (r->>'uscita_id')::uuid FROM exit_result),'{}');CREATE TEMP TABLE ddt_second AS SELECT * FROM create_ddt_from_uscita((SELECT (r->>'uscita_id')::uuid FROM exit_result),'{}');RESET ROLE;"+f"SELECT jsonb_build_object('equal',(SELECT a.documento_id=b.documento_id FROM ddt_first a CROSS JOIN ddt_second b),'ddt',(SELECT count(*) FROM documenti_fiscali WHERE ordine_id={lit(self.o)}),'stock',(SELECT quantity FROM warehouse_stock WHERE id={lit(self.s)}),'state',(SELECT stato FROM documenti_fiscali WHERE ordine_id={lit(self.o)}))")
  self.assertEqual(r,{'equal':True,'ddt':1,'stock':3,'state':'bozza'})
 def test_09_direct_viewer_stock_update_is_denied(self):
  self.case(f"DO $$DECLARE changed integer;BEGIN BEGIN UPDATE warehouse_stock SET quantity=5 WHERE id={lit(self.s)};GET DIAGNOSTICS changed=ROW_COUNT;IF changed>0 THEN RAISE EXCEPTION 'Lettore ha modificato la giacenza';END IF;EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;SELECT true",VIEWER)
 def test_10_direct_viewer_goods_insert_is_denied(self):
  self.case(f"DO $$BEGIN BEGIN INSERT INTO goods_receipts(order_item_id,warehouse_id,company_id,quantity_received,quality_check_status,received_by) VALUES({lit(self.i)},{lit(self.w)},{lit(COMPANY)},1,'ok',{lit(VIEWER)});RAISE EXCEPTION 'Lettore ha creato un carico diretto';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;SELECT true",VIEWER)
 def test_11_receipt_delete_reverses_stock_without_erasing_legacy_balance(self):
  r=self.case('SELECT '+self.goods(1)+f";DELETE FROM goods_receipts WHERE order_item_id={lit(self.i)};RESET ROLE;SELECT jsonb_build_object('stock',(SELECT quantity FROM warehouse_stock WHERE id={lit(self.s)}),'received',(SELECT quantity_received FROM purchase_order_items WHERE id={lit(self.pi)}))")
  self.assertEqual(r,{'stock':0,'received':0})
 def test_12_maintenance_functions_are_not_public_rpc(self):
  self.denied('public.warehouse_receipt_reconciliation_preview_v4('+lit(COMPANY)+')',ADMIN)
 def test_13_reconciled_history_has_no_unassigned_receipts_or_counter_differences(self):
  r=sql('SELECT public.warehouse_receipt_reconciliation_preview_v4('+lit(COMPANY)+')');self.assertEqual(r['rows'],[]);self.assertEqual(r['blocked'],[])
 def test_14_pending_and_damaged_receipts_do_not_reserve_missing_stock(self):
  for quality in ['pending','damaged']:
   r=self.case('SELECT '+self.goods(1,quality=quality)+f";RESET ROLE;SELECT jsonb_build_object('stock',(SELECT quantity FROM warehouse_stock WHERE id={lit(self.s)}),'reserved',(SELECT quantity_reserved FROM warehouse_stock WHERE id={lit(self.s)}),'received',(SELECT quantity_received FROM purchase_order_items WHERE id={lit(self.pi)}))")
   self.assertEqual(r,{'stock':0,'reserved':0,'received':1})
 def test_15_cancel_pending_receipt_also_restores_commessa_counter(self):
  r=self.case('SELECT '+self.goods(1,quality='pending')+f";DELETE FROM goods_receipts WHERE order_item_id={lit(self.i)};RESET ROLE;SELECT jsonb_build_object('stock',(SELECT quantity FROM warehouse_stock WHERE id={lit(self.s)}),'received',(SELECT quantity_received FROM order_items WHERE id={lit(self.i)}),'oda',(SELECT quantity_received FROM purchase_order_items WHERE id={lit(self.pi)}))")
  self.assertEqual(r,{'stock':0,'received':0,'oda':0})
 def test_16_cancellation_after_material_was_used_is_atomic(self):
  issue='public.warehouse_register_uscita_v2('+','.join(lit(x) for x in [self.w,{'tipo':'cantiere','order_id':self.o},[{'stock_item_id':self.s,'quantity':1,'order_item_id':self.i}],uid(),None,None])+')'
  r=self.case('SELECT '+self.goods(1)+';SELECT '+issue+f";DO $$BEGIN BEGIN DELETE FROM goods_receipts WHERE order_item_id={lit(self.i)};RAISE EXCEPTION 'Ricezione consumata cancellata';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;END $$;RESET ROLE;SELECT count(*) FROM goods_receipts WHERE order_item_id={lit(self.i)}")
  self.assertEqual(r,1)
 def test_17_direct_receipt_quantity_edit_is_denied(self):
  self.case('SELECT '+self.goods(1)+f";DO $$BEGIN BEGIN UPDATE goods_receipts SET quantity_received=2 WHERE order_item_id={lit(self.i)};RAISE EXCEPTION 'Quantità diretta modificata senza rettifica';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;SELECT true")
 def test_18_authorized_staff_can_edit_article_metadata(self):
  r=self.case(f"UPDATE warehouse_stock SET description='Note locali' WHERE id={lit(self.s)};RESET ROLE;SELECT description FROM warehouse_stock WHERE id={lit(self.s)}",STAFF);self.assertEqual(r,'Note locali')
 def test_19_reconciliation_rejects_stale_plan(self):
  q=f"UPDATE purchase_order_items SET quantity_received=2 WHERE id={lit(self.pi)};DO $$DECLARE p jsonb;BEGIN p:=warehouse_receipt_reconciliation_preview_v4({lit(COMPANY)});UPDATE purchase_order_items SET quantity_received=3 WHERE id={lit(self.pi)};BEGIN PERFORM warehouse_receipt_reconciliation_apply_v4({lit(COMPANY)},p->>'source_hash',{lit(uid())});RAISE EXCEPTION 'Piano obsoleto accettato';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;END $$;SELECT true"
  self.assertTrue(sql('BEGIN;'+self.setup+q+';ROLLBACK'))
 def test_20_reconciliation_replay_does_not_duplicate_opening_balance(self):
  q=f"UPDATE purchase_order_items SET quantity_received=2 WHERE id={lit(self.pi)};DO $$DECLARE p jsonb;a jsonb;b jsonb;k uuid:=gen_random_uuid();BEGIN p:=warehouse_receipt_reconciliation_preview_v4({lit(COMPANY)});a:=warehouse_receipt_reconciliation_apply_v4({lit(COMPANY)},p->>'source_hash',k);b:=warehouse_receipt_reconciliation_apply_v4({lit(COMPANY)},p->>'source_hash',k);IF a<>b THEN RAISE EXCEPTION 'Replay differente';END IF;END $$;SELECT count(*) FROM warehouse_receipt_opening_balances_v4 WHERE purchase_order_item_id={lit(self.pi)}"
  self.assertEqual(sql('BEGIN;'+self.setup+q+';ROLLBACK'),1)
 def test_21_second_opening_balance_keeps_first_provenance(self):
  q=f"UPDATE purchase_order_items SET quantity_received=2 WHERE id={lit(self.pi)};DO $$DECLARE p jsonb;BEGIN p:=warehouse_receipt_reconciliation_preview_v4({lit(COMPANY)});PERFORM warehouse_receipt_reconciliation_apply_v4({lit(COMPANY)},p->>'source_hash',gen_random_uuid());UPDATE purchase_order_items SET quantity_received=3 WHERE id={lit(self.pi)};p:=warehouse_receipt_reconciliation_preview_v4({lit(COMPANY)});PERFORM warehouse_receipt_reconciliation_apply_v4({lit(COMPANY)},p->>'source_hash',gen_random_uuid());END $$;SELECT jsonb_build_object('rows',count(*),'quantity',sum(quantity),'first_still_present',bool_or(recorded_quantity=2)) FROM warehouse_receipt_opening_balances_v4 WHERE purchase_order_item_id={lit(self.pi)}"
  self.assertEqual(sql('BEGIN;'+self.setup+q+';ROLLBACK'),{'rows':2,'quantity':3,'first_still_present':True})
 def test_22_overordered_history_does_not_apply(self):
  q=f"UPDATE purchase_order_items SET quantity_received=5 WHERE id={lit(self.pi)};DO $$DECLARE p jsonb;BEGIN p:=warehouse_receipt_reconciliation_preview_v4({lit(COMPANY)});BEGIN PERFORM warehouse_receipt_reconciliation_apply_v4({lit(COMPANY)},p->>'source_hash',gen_random_uuid());RAISE EXCEPTION 'Storico oltre ordinato accettato';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;END $$;SELECT count(*) FROM warehouse_receipt_opening_balances_v4 WHERE purchase_order_item_id={lit(self.pi)}"
  self.assertEqual(sql('BEGIN;'+self.setup+q+';ROLLBACK'),0)
 def test_23_cost_valuation_requires_real_cost_permission(self):
  self.denied('public.wh_get_valorizzazione('+','.join(lit(v) for v in [COMPANY,'media',self.w])+')',VIEWER)
 def test_24_real_audit_and_procurement_revision_are_recorded(self):
  r=self.case('SELECT '+self.receive(1)+f";RESET ROLE;SELECT jsonb_build_object('audit',(SELECT count(*) FROM user_action_log WHERE user_id={lit(ADMIN)} AND record_id IN ({lit(self.pi)},{lit(self.po)})),'revision',(SELECT count(*) FROM procurement_document_events WHERE purchase_order_id={lit(self.po)} AND actor_id={lit(ADMIN)}))")
  self.assertGreater(r['audit'],0);self.assertGreater(r['revision'],0)
 def test_25_ambiguous_receipt_is_quarantined_not_guessed(self):
  other,item=uid(),uid()
  q=f"INSERT INTO purchase_orders(id,company_id,supplier_id,oda_number,status) VALUES({lit(other)},{lit(COMPANY)},{lit(self.v)},{lit('LOC-'+other)},'confermato');INSERT INTO purchase_order_items(id,company_id,purchase_order_id,order_item_id,description,quantity,unit_of_measure) VALUES({lit(item)},{lit(COMPANY)},{lit(other)},{lit(self.i)},'Ambigua',4,'m');SET LOCAL session_replication_role=replica;INSERT INTO goods_receipts(company_id,order_item_id,warehouse_id,quantity_received,quality_check_status) VALUES({lit(COMPANY)},{lit(self.i)},{lit(self.w)},1,'pending');SET LOCAL session_replication_role=origin;SELECT jsonb_array_length(warehouse_receipt_reconciliation_preview_v4({lit(COMPANY)})->'blocked')"
  self.assertGreater(sql('BEGIN;'+self.setup+q+';ROLLBACK'),0)
 def test_26_new_ddt_receipt_after_opening_balance_keeps_history_without_new_stock(self):
  d=uid()
  preparation=f"UPDATE purchase_order_items SET quantity_received=2 WHERE id={lit(self.pi)};DO $$DECLARE p jsonb;BEGIN p:=warehouse_receipt_reconciliation_preview_v4({lit(COMPANY)});PERFORM warehouse_receipt_reconciliation_apply_v4({lit(COMPANY)},p->>'source_hash',gen_random_uuid());END $$;INSERT INTO ddt_ricezione(id,company_id,purchase_order_id,warehouse_id,numero_ddt,supplier_id) VALUES({lit(d)},{lit(COMPANY)},{lit(self.po)},{lit(self.w)},'DDT-LOCALE',{lit(self.v)});"
  goods='public.warehouse_goods_receipt_v3('+','.join(lit(x) for x in [self.i,self.w,1,'ok',None,None,None,d,None,None,uid()])+')'
  r=sql('BEGIN;'+self.setup+preparation+self.context(ADMIN)+'SELECT '+goods+f";RESET ROLE;SELECT jsonb_build_object('received',(SELECT quantity_received FROM purchase_order_items WHERE id={lit(self.pi)}),'stock',(SELECT quantity FROM warehouse_stock WHERE id={lit(self.s)}));ROLLBACK")
  self.assertEqual(r,{'received':3,'stock':1})
 def test_27_cancel_uses_original_stock_without_releasing_other_stock_reservation(self):
  other=uid();extra=f"INSERT INTO warehouse_stock(id,company_id,warehouse_id,name,quantity,unit_cost,unita_misura) VALUES({lit(other)},{lit(COMPANY)},{lit(self.w)},'Altro articolo',3,10,'m');"
  r=sql('BEGIN;'+self.setup+extra+self.context(ADMIN)+'SELECT '+self.goods(1)+f";UPDATE order_items SET stock_item_id={lit(other)} WHERE id={lit(self.i)};DELETE FROM goods_receipts WHERE order_item_id={lit(self.i)};RESET ROLE;SELECT jsonb_build_object('original',(SELECT quantity FROM warehouse_stock WHERE id={lit(self.s)}),'other_reserved',(SELECT quantity_reserved FROM warehouse_stock WHERE id={lit(other)}),'other_quantity',(SELECT quantity FROM warehouse_stock WHERE id={lit(other)}));ROLLBACK")
  self.assertEqual(r,{'original':0,'other_reserved':1,'other_quantity':3})
 def test_28_fractional_documental_receipt_cancels_exactly(self):
  r=self.case('SELECT '+self.goods(1.25)+f";RESET ROLE;SELECT jsonb_build_object('stock',(SELECT quantity FROM warehouse_stock WHERE id={lit(self.s)}),'received',(SELECT quantity_received FROM goods_receipts WHERE order_item_id={lit(self.i)}))")
  self.assertEqual(r,{'stock':1.25,'received':1.25})
  r=self.case('SELECT '+self.goods(1.25)+f";DELETE FROM goods_receipts WHERE order_item_id={lit(self.i)};RESET ROLE;SELECT quantity FROM warehouse_stock WHERE id={lit(self.s)}")
  self.assertEqual(r,0)
if __name__=='__main__':unittest.main(verbosity=2)
