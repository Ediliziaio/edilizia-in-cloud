import unittest,json
from pathlib import Path
from test_operazioni import seed_operations,W2
from test_transazioni import A,A2,C,OTHER,W,stock,sql,rpc,lit,DbError
class Valuation(unittest.TestCase):
 def setUp(self):seed_operations()
 def batch(self,s,q=4,cost=5,days=3):sql(f"INSERT INTO warehouse_lot_batches(company_id,stock_item_id,quantity,unit_cost,lot_number,received_date,expiry_date) VALUES({lit(C)},{lit(s)},{q},{cost},'LOT-A','2026-01-01',current_date+{days})")
 def test_partial_layers_do_not_lose_unbatched_stock_value(self):
  s=stock(10,cost=10);self.batch(s)
  for method in ['media','fifo','lifo']:
   r=rpc('wh_get_valorizzazione',C,method,None);self.assertEqual(r['kpi']['valore_totale'],80);self.assertTrue(r['articoli'][0]['copertura_lotti_incompleta'])
 def test_complete_fifo_lifo_preserve_layer_order(self):
  s=stock(3,cost=10);self.batch(s,2,4);self.batch(s,4,9);sql("UPDATE warehouse_lot_batches SET received_date='2026-02-01' WHERE unit_cost=9")
  self.assertEqual(rpc('wh_get_valorizzazione',C,'fifo',None)['kpi']['valore_totale'],17)
  self.assertEqual(rpc('wh_get_valorizzazione',C,'lifo',None)['kpi']['valore_totale'],27)
 def test_valuation_without_cost_permission_denied(self):
  stock();sql(f"DELETE FROM fixture_permissions WHERE actor={lit(A)} AND permission='can_view_costs'")
  with self.assertRaises(DbError):rpc('wh_get_valorizzazione',C,'media',None)
 def test_expiry_without_cost_permission_keeps_dates_and_hides_prices(self):
  s=stock();self.batch(s);sql(f"DELETE FROM fixture_permissions WHERE actor={lit(A)} AND permission='can_view_costs'")
  r=rpc('wh_get_lotti_in_scadenza',C,30);self.assertEqual(r['kpi']['totale'],1);self.assertIsNone(r['kpi']['valore_a_rischio']);self.assertIsNone(r['lotti'][0]['unit_cost']);self.assertIsNone(r['lotti'][0]['valore'])
 def test_unassigned_warehouses_not_in_value_or_expiry(self):
  s=stock();self.batch(s);sql(f"DELETE FROM fixture_permissions WHERE actor={lit(A2)} AND permission='fixture_company_admin'")
  self.assertEqual(rpc('wh_get_valorizzazione',C,'media',None,actor=A2)['articoli'],[])
  self.assertEqual(rpc('wh_get_lotti_in_scadenza',C,30,actor=A2)['lotti'],[])
 def test_other_company_denied(self):
  stock()
  with self.assertRaises(DbError):rpc('wh_get_valorizzazione',OTHER,'media',None)
 def test_no_layers_use_registered_stock_cost(self):
  stock(2.75,cost=12);self.assertEqual(rpc('wh_get_valorizzazione',C,'fifo',None)['kpi']['valore_totale'],33)
 def test_unknown_price_is_explicit(self):
  r=rpc('warehouse_import_stock_v3',C,W,[{'name':'Senza prezzo','quantity':2,'prezzo_da_definire':True}], '60000000-0000-0000-0000-000000000001')
  self.assertEqual(r['inserted'],1);self.assertTrue(rpc('wh_get_valorizzazione',C,'media',None)['articoli'][0]['prezzo_da_definire'])
if __name__=='__main__':
 r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Valuation))
 Path('docs/ux/magazzino-controllo-completo/test-valorizzazione.json').write_text(json.dumps({'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors)},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
