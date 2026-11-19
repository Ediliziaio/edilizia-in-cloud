import json,time,unittest
from pathlib import Path
from test_transazioni import C,OTHER,A,A2,DENIED,W,O,O2,sql,rpc,uid,lit,seed,stock,line,reserve,state,serials,issue,parallel,DbError
W2='30000000-0000-0000-0000-000000000002';W3='30000000-0000-0000-0000-000000000003';V='50000000-0000-0000-0000-000000000001'
def seed_operations():
    sql('TRUNCATE warehouse_transfer_items,warehouse_transfers,inventory_audits,purchase_order_items,purchase_orders,warehouse_inventory_counts_v3,numerazione_ordini_fornitore CASCADE')
    seed()
    sql(f"INSERT INTO warehouses(id,company_id,name) VALUES({lit(W2)},{lit(C)},'Deposito secondario'),({lit(W3)},{lit(C)},'Terzo deposito');INSERT INTO suppliers(id,company_id,name) VALUES({lit(V)},{lit(C)},'Fornitore di prova') ON CONFLICT(id) DO UPDATE SET name=excluded.name;INSERT INTO fixture_permissions(actor,company,permission) VALUES({lit(A)},{lit(C)},'can_manage_purchasing'),({lit(A2)},{lit(C)},'can_manage_purchasing');TRUNCATE warehouse_assignments,multi_company_access")
def transfer(s,q=1,key=None,serial_numbers=None,source=W,dest=W2,items=None,**kw):
    return rpc('warehouse_transfer_v3',C,source,dest,'2026-11-17',None,items or [{'stock_item_id':s,'quantity':q,'serial_numbers':serial_numbers or []}],key or uid(),**kw)
def preview(s):return rpc('warehouse_inventory_preview_v3',s)
def count_inventory(s,q,key=None,snapshot=None,sns=None,**kw):return rpc('warehouse_inventory_count_v3',s,q,snapshot or preview(s),sns or [],'Conteggio di prova',key or uid(),**kw)
def apply_inventory(a,key=None,**kw):return rpc('warehouse_inventory_apply_v3',a['id'],key or uid(),**kw)
def reorder(s,q=1,key=None,**kw):return rpc('warehouse_reorder_v3',C,V,[{'stock_item_id':s,'quantity':q}],W,key or uid(),**kw)
def supply(s,minlevel=20):sql(f'UPDATE warehouse_stock SET supplier_id={lit(V)},min_stock_level={minlevel},updated_at=now() WHERE id={lit(s)}')
def dest_stock(s,wh=W2):return sql(f'SELECT destination_stock_id::text FROM warehouse_transfer_links_v3 WHERE source_stock_id=(SELECT root_stock_id FROM warehouse_stock_identity_v3 WHERE stock_item_id={lit(s)}) AND destination_warehouse_id={lit(wh)}')
class Operations(unittest.TestCase):
 def setUp(self):seed_operations()
 def denied(self,fn,code='PT409'):
    with self.assertRaises(DbError) as cm:fn()
    self.assertIn(code,str(cm.exception))
 def balanced(self):
    self.assertEqual(sql("SELECT count(*) FROM warehouse_stock s WHERE quantity<>(SELECT coalesce(sum(CASE WHEN movement_type='carico' THEN quantity ELSE -quantity END),0) FROM warehouse_movements WHERE stock_item_id=s.id)"),0)
 def test_01_fractional_transfer_balances_both_warehouses(self):
    s=stock();r=transfer(s,2.75);d=dest_stock(s)
    self.assertEqual(state(s)['quantity'],7.25);self.assertEqual(state(d)['quantity'],2.75);self.assertEqual(r['status'],'ricevuto');self.balanced()
 def test_02_reservations_protected(self):
    s=stock();reserve(line(s),8)
    self.denied(lambda:transfer(s,3));self.assertEqual(state(s)['quantity'],10)
 def test_03_duplicate_transfer_one_result(self):
    s=stock();key=uid();res=parallel(lambda:transfer(s,2,key=key,hold=.2),lambda:transfer(s,2,key=key))
    self.assertEqual(res[0],res[1]);self.assertFalse(isinstance(res[0],DbError),str(res));self.assertEqual(sql('SELECT count(*) FROM warehouse_transfers'),1);self.balanced()
 def test_04_competing_transfers_do_not_overdraw(self):
    s=stock();res=parallel(lambda:transfer(s,7,hold=.2),lambda:transfer(s,7,hold=.2))
    self.assertEqual(sum(isinstance(r,DbError) for r in res),1);self.assertEqual(state(s)['quantity'],3);self.balanced()
 def test_05_multiline_failure_rolls_back_header_and_stock(self):
    s=stock();t=stock()
    self.denied(lambda:transfer(s,items=[{'stock_item_id':s,'quantity':2},{'stock_item_id':t,'quantity':11}]))
    self.assertEqual(sql('SELECT count(*) FROM warehouse_transfers'),0);self.assertEqual(state(s)['quantity'],10);self.balanced()
 def test_06_serial_identity_and_warranty_move(self):
    s=stock(2,'pz',True);serials(s);transfer(s,1,serial_numbers=['SN-B']);d=dest_stock(s)
    u=sql("SELECT jsonb_build_object('stock',stock_item_id,'warehouse',warehouse_id,'warranty',warranty_expires_at) FROM stock_units WHERE serial_number='SN-B'")
    self.assertEqual(u,{'stock':d,'warehouse':W2,'warranty':'2028-02-03'});self.assertEqual(state(s)['quantity'],1);self.balanced()
 def test_07_reserved_serial_not_transferred(self):
    s=stock(2,'pz',True);serials(s);sql(f"UPDATE stock_units SET status='reserved',reserved_order_id={lit(O)} WHERE serial_number='SN-A'")
    self.denied(lambda:transfer(s,1,serial_numbers=['SN-A']));self.assertEqual(state(s)['quantity'],2)
 def test_08_chain_and_roundtrip_reuse_same_identity(self):
    s=stock();transfer(s,4);d=dest_stock(s);transfer(d,2,source=W2,dest=W3);e=dest_stock(d,W3);transfer(e,1,source=W3,dest=W)
    self.assertEqual(sql('SELECT count(*) FROM warehouse_stock'),3);self.assertEqual(state(s)['quantity'],7);self.balanced()
 def test_09_name_collision_is_not_automatic_match(self):
    s=stock();other=stock();sql(f'UPDATE warehouse_stock SET warehouse_id={lit(W2)} WHERE id={lit(other)}');transfer(s,2)
    self.assertNotEqual(dest_stock(s),other);self.assertEqual(state(other)['quantity'],10);self.balanced()
 def test_10_transfer_requires_correct_company_and_active_depot(self):
    s=stock();self.denied(lambda:transfer(s,actor=DENIED),'42501')
    sql(f'UPDATE warehouses SET is_active=false WHERE id={lit(W2)}');self.denied(lambda:transfer(s),'42501')
 def test_11_fractional_count_then_apply(self):
    s=stock();a=count_inventory(s,8.75);self.assertEqual(state(s)['quantity'],10);r=apply_inventory(a)
    self.assertEqual(r['difference'],-1.25);self.assertEqual(state(s)['quantity'],8.75);self.balanced()
 def test_12_zero_is_valid_inventory_count(self):
    s=stock();apply_inventory(count_inventory(s,0));self.assertEqual(state(s)['quantity'],0);self.balanced()
 def test_13_count_rejects_stale_snapshot(self):
    s=stock();snap=preview(s);issue(s,1)
    self.denied(lambda:count_inventory(s,8,snapshot=snap));self.assertEqual(sql('SELECT count(*) FROM warehouse_inventory_counts_v3'),0)
 def test_14_apply_rejects_movement_after_count(self):
    s=stock();a=count_inventory(s,8);issue(s,1)
    self.denied(lambda:apply_inventory(a));self.assertEqual(state(s)['quantity'],9);self.balanced()
 def test_15_duplicate_apply_changes_quantity_once(self):
    s=stock();a=count_inventory(s,8.5)
    res=parallel(lambda:apply_inventory(a,hold=.2),lambda:apply_inventory(a,hold=.2))
    self.assertFalse(any(isinstance(x,DbError) for x in res),str(res));self.assertEqual(state(s)['quantity'],8.5);self.assertEqual(sql('SELECT count(*) FROM warehouse_movements'),2);self.balanced()
 def test_16_inventory_below_reserve_rejected(self):
    s=stock();reserve(line(s),8);self.denied(lambda:count_inventory(s,7.5));self.assertEqual(state(s)['quantity'],10)
 def test_17_serial_missing_and_found_preserve_warranty(self):
    s=stock(2,'pz',True);serials(s);apply_inventory(count_inventory(s,1,sns=['SN-A']))
    self.assertEqual(sql("SELECT status FROM stock_units WHERE serial_number='SN-B'"),'inventory_missing');self.balanced()
    apply_inventory(count_inventory(s,2,sns=['SN-A','SN-B']))
    self.assertEqual(sql("SELECT status FROM stock_units WHERE serial_number='SN-B'"),'available');self.assertEqual(state(s)['quantity'],2);self.balanced()
 def test_18_reserved_serial_cannot_be_missing(self):
    s=stock(2,'pz',True);serials(s);sql(f"UPDATE stock_units SET status='reserved',reserved_order_id={lit(O)} WHERE serial_number='SN-B'")
    self.denied(lambda:count_inventory(s,1,sns=['SN-A']))
 def test_19_serial_count_cannot_invent_a_serial(self):
    s=stock(2,'pz',True);serials(s);self.denied(lambda:count_inventory(s,1,sns=['UNKNOWN']),'22023')
 def test_20_fractional_pieces_and_nan_rejected(self):
    s=stock(unit='pz');self.denied(lambda:count_inventory(s,1.5),'22023');self.denied(lambda:count_inventory(s,'NaN'),'22023');self.denied(lambda:transfer(s,.5),'22023')
 def test_21_reorder_preserves_quantity_unit_cost_and_draft(self):
    s=stock(10,'m',cost=12);supply(s);r=reorder(s,2.75)
    self.assertEqual(r['righe'],1);self.assertTrue(r['oda_number'].startswith('ODA-'))
    self.assertEqual(sql('SELECT jsonb_build_object(\'qty\',quantity,\'unit\',unit_of_measure) FROM purchase_order_items'),{'qty':2.75,'unit':'m'})
    self.assertEqual(sql('SELECT subtotal FROM purchase_orders'),33);self.assertEqual(sql('SELECT status FROM purchase_orders'),'bozza');self.assertEqual(state(s)['quantity'],10)
 def test_22_duplicate_reorder_is_one_draft(self):
    s=stock();supply(s);key=uid();res=parallel(lambda:reorder(s,2.75,key=key,hold=.2),lambda:reorder(s,2.75,key=key))
    self.assertEqual(res[0],res[1]);self.assertFalse(isinstance(res[0],DbError),str(res));self.assertEqual(sql('SELECT count(*) FROM purchase_orders'),1)
 def test_23_different_keys_do_not_duplicate_existing_open_order(self):
    s=stock();supply(s);res=parallel(lambda:reorder(s,3,hold=.2),lambda:reorder(s,3,hold=.2))
    self.assertFalse(any(isinstance(x,DbError) for x in res),str(res));self.assertEqual(sorted(r['righe'] for r in res),[0,1]);self.assertEqual(sql('SELECT count(*) FROM purchase_orders'),1)
 def test_24_preview_subtracts_incoming_and_reserves(self):
    s=stock();supply(s,12);reserve(line(s),2);reorder(s,3)
    p=rpc('warehouse_reorder_preview_v3',C,W)[0];self.assertEqual(p['incoming'],3);self.assertEqual(p['available'],8);self.assertEqual(p['deficit'],1)
 def test_25_cancelled_order_does_not_cover_need(self):
    s=stock();supply(s);reorder(s,3);sql("UPDATE purchase_orders SET status='annullato'");self.assertEqual(reorder(s,3)['righe'],1)
 def test_26_reorder_wrong_supplier_or_permission_rejected(self):
    s=stock();self.denied(lambda:reorder(s),'42501');supply(s);self.denied(lambda:reorder(s,actor=DENIED),'42501')
 def test_27_reorder_pieces_must_be_whole(self):
    s=stock(unit='pz');supply(s);self.denied(lambda:reorder(s,1.5),'22023');self.assertEqual(sql('SELECT count(*) FROM purchase_orders'),0)
 def test_28_reorder_preview_hides_cost_without_permission(self):
    s=stock();supply(s);sql(f"DELETE FROM fixture_permissions WHERE actor={lit(A)} AND permission='can_view_costs'");self.assertIsNone(rpc('warehouse_reorder_preview_v3',C,W)[0]['unitCost'])
 def test_29_replay_keys_cannot_change_transfer(self):
    s=stock();key=uid();transfer(s,2,key=key);self.denied(lambda:transfer(s,3,key=key));self.assertEqual(state(s)['quantity'],8)
 def test_30_count_same_request_is_not_duplicated(self):
    s=stock();snap=preview(s);key=uid();a=count_inventory(s,8,key=key,snapshot=snap);self.assertEqual(count_inventory(s,8,key=key,snapshot=snap),a);self.assertEqual(sql('SELECT count(*) FROM warehouse_inventory_counts_v3'),1)
 def test_31_unassigned_operator_cannot_transfer(self):
    s=stock();sql(f"DELETE FROM fixture_permissions WHERE actor={lit(A2)} AND permission='fixture_company_admin';INSERT INTO warehouse_assignments(warehouse_id,user_id) VALUES({lit(W)},{lit(A2)})")
    self.denied(lambda:transfer(s,actor=A2),'42501')
 def test_32_unassigned_inventory_and_reorder_rejected(self):
    s=stock();supply(s);sql(f"DELETE FROM fixture_permissions WHERE actor={lit(A2)} AND permission='fixture_company_admin'")
    self.denied(lambda:rpc('warehouse_inventory_preview_v3',s,actor=A2),'42501');self.denied(lambda:reorder(s,actor=A2),'42501')
 def test_33_assigned_operator_can_inventory(self):
    s=stock();sql(f"DELETE FROM fixture_permissions WHERE actor={lit(A2)} AND permission='fixture_company_admin';INSERT INTO warehouse_assignments(warehouse_id,user_id) VALUES({lit(W)},{lit(A2)})")
    snap=rpc('warehouse_inventory_preview_v3',s,actor=A2);a=count_inventory(s,8,snapshot=snap,actor=A2);apply_inventory(a,actor=A2);self.assertEqual(state(s)['quantity'],8)
 def test_34_reorder_rejects_stale_article(self):
    s=stock();supply(s);stamp=sql(f'SELECT updated_at::text FROM warehouse_stock WHERE id={lit(s)}');issue(s,1)
    self.denied(lambda:rpc('warehouse_reorder_v3',C,V,[{'stock_item_id':s,'quantity':2.75,'expected_updated_at':stamp}],W,uid()));self.assertEqual(sql('SELECT count(*) FROM purchase_orders'),0)
 def test_35_two_inventory_counts_cannot_apply_the_same_old_state(self):
    s=stock();a=count_inventory(s,8);b=count_inventory(s,9);apply_inventory(a)
    self.denied(lambda:apply_inventory(b));self.assertEqual(state(s)['quantity'],8);self.balanced()
 def test_36_serial_count_rejects_incoherent_register(self):
    s=stock(3,'pz',True);serials(s);self.denied(lambda:count_inventory(s,2,sns=['SN-A','SN-B']))
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Operations))
 Path('docs/ux/magazzino-p2/esito-operazioni.json').write_text(json.dumps({'tests':result.testsRun,'passed':result.testsRun-len(result.failures)-len(result.errors),'failures':len(result.failures),'errors':len(result.errors),'timestamp':time.strftime('%Y-%m-%dT%H:%M:%S%z')},indent=2)+'\n')
 raise SystemExit(not result.wasSuccessful())
