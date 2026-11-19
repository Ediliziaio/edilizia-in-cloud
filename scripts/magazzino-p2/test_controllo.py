"""Regressioni aggiuntive dell'audit, solo PostgreSQL sintetico locale."""
import json,time,unittest
from pathlib import Path
from test_operazioni import seed_operations,W2,count_inventory,apply_inventory
from test_transazioni import A,A2,C,OTHER,W,O,sql,rpc,stock,line,issue,ret,receive,reserve,uid,lit,state,DbError
class Audit(unittest.TestCase):
 def setUp(self):seed_operations()
 def operator(self):sql(f"DELETE FROM fixture_permissions WHERE actor={lit(A2)} AND permission='fixture_company_admin'")
 def denied(self,fn):
  with self.assertRaises(DbError) as cm:fn()
  self.assertIn('42501',str(cm.exception))
 def test_unassigned_load_rejected(self):
  s=stock();self.operator();self.denied(lambda:receive(s,actor=A2));self.assertEqual(state(s)['quantity'],10)
 def test_unassigned_issue_rejected(self):
  s=stock();self.operator();self.denied(lambda:issue(s,actor=A2));self.assertEqual(state(s)['quantity'],10)
 def test_unassigned_return_rejected(self):
  s=stock();l=line(s);issue(s,2,l=l);self.operator();self.denied(lambda:ret(s,l,1,actor=A2));self.assertEqual(state(s)['quantity'],8)
 def test_unassigned_reservation_rejected(self):
  s=stock();l=line(s);self.operator();self.denied(lambda:reserve(l,2,actor=A2));self.assertEqual(state(s)['reserved'],0)
 def test_unassigned_cannot_read_return_serials(self):
  s=stock();l=line(s);issue(s,2,l=l);self.operator();self.assertEqual(rpc('warehouse_return_candidates_v2',O,actor=A2),[])
 def test_assigned_operator_can_complete_all_primary_flows(self):
  s=stock();l=line(s);self.operator();sql(f'INSERT INTO warehouse_assignments(warehouse_id,user_id) VALUES({lit(W)},{lit(A2)})')
  receive(s,.75,actor=A2);reserve(l,2.5,actor=A2);issue(s,2.5,l=l,actor=A2);ret(s,l,1.25,actor=A2)
  self.assertEqual(state(s),{'quantity':9.5,'reserved':0,'available':9.5})
 def test_inactive_assignment_denied(self):
  s=stock();self.operator();sql(f'INSERT INTO warehouse_assignments(warehouse_id,user_id,active) VALUES({lit(W)},{lit(A2)},false)');self.denied(lambda:receive(s,actor=A2))
 def test_return_value_hidden_without_cost_permission(self):
  s=stock();l=line(s);issue(s,2,l=l);sql(f"DELETE FROM fixture_permissions WHERE actor={lit(A)} AND permission='can_view_costs'")
  self.assertIsNone(ret(s,l,1)['valore_stornato']);self.assertEqual(state(s)['quantity'],9)
 def test_location_helper_is_internal(self):
  self.denied(lambda:rpc('warehouse_location_access_v2',C,W))
 def test_inventory_apply_same_request_after_commit_is_stable(self):
  s=stock();a=count_inventory(s,8.25);k=uid();first=apply_inventory(a,key=k);self.assertEqual(apply_inventory(a,key=k),first);self.assertEqual(state(s)['quantity'],8.25)
 def test_import_keeps_fractions_and_ledger(self):
  r=rpc('warehouse_import_stock_v3',C,W,[{'name':'Cavo','quantity':12.5,'unita_misura':'m','unit_cost':3},{'name':'Pannello','quantity':2.75,'unita_misura':'mq','unit_cost':8}],uid())
  self.assertEqual(r['inserted'],2);self.assertEqual(sql('SELECT sum(quantity) FROM warehouse_stock'),15.25)
  self.assertEqual(sql("SELECT count(*) FROM warehouse_stock s WHERE quantity<>(SELECT coalesce(sum(CASE WHEN movement_type='carico' THEN quantity ELSE -quantity END),0) FROM warehouse_movements WHERE stock_item_id=s.id)"),0)
 def test_import_same_request_is_not_duplicated(self):
  from test_transazioni import parallel
  key=uid();items=[{'name':'Cavo','quantity':2.75,'unita_misura':'m'}]
  r=parallel(lambda:rpc('warehouse_import_stock_v3',C,W,items,key,hold=.2),lambda:rpc('warehouse_import_stock_v3',C,W,items,key))
  self.assertEqual(r[0],r[1]);self.assertEqual(sql('SELECT count(*) FROM warehouse_stock'),1)
 def test_import_invalid_second_row_rolls_back(self):
  with self.assertRaises(DbError):rpc('warehouse_import_stock_v3',C,W,[{'name':'Cavo','quantity':2.75,'unita_misura':'m'},{'name':'Pezzi','quantity':1.5,'unita_misura':'pz'}],uid())
  self.assertEqual(sql('SELECT count(*) FROM warehouse_stock'),0);self.assertEqual(sql('SELECT count(*) FROM warehouse_movements'),0)
 def test_import_assigned_warehouse_required(self):
  self.operator();self.denied(lambda:rpc('warehouse_import_stock_v3',C,W,[{'name':'Articolo','quantity':0}],uid(),actor=A2))
 def test_import_negative_price_rejected(self):
  with self.assertRaises(DbError):rpc('warehouse_import_stock_v3',C,W,[{'name':'Articolo','quantity':1,'unit_cost':-2}],uid())
  self.assertEqual(sql('SELECT count(*) FROM warehouse_stock'),0)
if __name__=='__main__':
 r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Audit))
 Path('docs/ux/magazzino-controllo-completo/test-database.json').write_text(json.dumps({'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'timestamp':time.strftime('%Y-%m-%dT%H:%M:%S%z')},indent=2)+'\n')
 raise SystemExit(not r.wasSuccessful())
