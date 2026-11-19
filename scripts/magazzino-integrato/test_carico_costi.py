"""Costo libero e movimento atomici: schema reale, rollback e identità sintetiche."""
import unittest
import test_integrated as base
from db import lit
from test_integrated import uid
from load_history import STAFF,VIEWER,DENIED
class CaricoCosti(unittest.TestCase):
 def setUp(self):self.f=base.Integrated();self.f.setUp();self.key=uid()
 def call(self,price=10,cost=True,qty=1.25,key=None):
  scan={'stock_item_id':self.f.s,'quantity':qty,'unit_price':price,'offline_client_uuid':uid(),'serial_numbers':[]}
  if cost:scan['company_cost']={'date':'2026-11-18','category':'Magazzino','vat_rate':22,'is_paid':True}
  return 'warehouse_register_carico_v2('+','.join(lit(x) for x in [self.f.w,self.f.v,[scan],key or self.key,None,'Collaudo costo atomico'])+')'
 def summary(self):return f"RESET ROLE;SELECT jsonb_build_object('stock',(SELECT quantity FROM warehouse_stock WHERE id={lit(self.f.s)}),'movements',(SELECT count(*) FROM warehouse_movements WHERE stock_item_id={lit(self.f.s)}),'costs',(SELECT count(*) FROM company_costs WHERE notes='Carico magazzino · richiesta {self.key}'),'amount',(SELECT sum(amount) FROM company_costs WHERE notes='Carico magazzino · richiesta {self.key}'))"
 def test_01_cost_and_carico_once_on_replay(self):
  expression=self.call();r=self.f.case('SELECT '+expression+';SELECT '+expression+';'+self.summary());self.assertEqual(r,{'stock':1.25,'movements':1,'costs':1,'amount':12.50})
 def test_02_missing_price_rolls_back_all(self):
  r=self.f.case("DO $$ BEGIN BEGIN PERFORM "+self.call(price=None)+";RAISE EXCEPTION 'Mancato blocco';EXCEPTION WHEN SQLSTATE '22023' THEN NULL;END;END $$;"+self.summary());self.assertEqual(r,{'stock':0,'movements':0,'costs':0,'amount':None})
 def test_03_ordinary_carico_creates_no_company_expense(self):
  r=self.f.case('SELECT '+self.call(cost=False)+';'+self.summary());self.assertEqual(r,{'stock':1.25,'movements':1,'costs':0,'amount':None})
 def test_04_viewer_and_foreign_company_denied(self):
  for actor in [VIEWER,DENIED]:self.f.denied(self.call(),actor)
 def test_05_staff_with_economic_permission_allowed(self):
  r=self.f.case('SELECT '+self.call()+';'+self.summary(),STAFF);self.assertEqual(r['costs'],1)
 def test_06_warehouse_only_staff_cannot_insert_expense(self):
  self.f.setup+=f"UPDATE staff_permissions SET can_view_costs=false,can_manage_purchasing=false WHERE user_id={lit(STAFF)};"
  self.f.denied(self.call(),STAFF)
 def test_07_changed_payload_cannot_reuse_key(self):
  first=self.call();second=self.call(price=25)
  r=self.f.case('SELECT '+first+";DO $$ BEGIN BEGIN PERFORM "+second+";RAISE EXCEPTION 'Chiave riusata';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;END $$;"+self.summary());self.assertEqual(r['costs'],1);self.assertEqual(r['stock'],1.25)
 def test_08_cost_failure_rolls_back_stock(self):
  expression=self.call().replace('"category": "Magazzino"','"category": ""')
  r=self.f.case("DO $$ BEGIN BEGIN PERFORM "+expression+";RAISE EXCEPTION 'Mancato blocco';EXCEPTION WHEN SQLSTATE '22023' THEN NULL;END;END $$;"+self.summary());self.assertEqual(r['stock'],0);self.assertEqual(r['movements'],0)
 def test_09_zero_amount_after_stock_update_rolls_back_everything(self):
  r=self.f.case("DO $$ BEGIN BEGIN PERFORM "+self.call(price=0)+";RAISE EXCEPTION 'Costo nullo accettato';EXCEPTION WHEN SQLSTATE '22023' THEN NULL;END;END $$;"+self.summary());self.assertEqual(r,{'stock':0,'movements':0,'costs':0,'amount':None})
 def test_10_unpaid_expense_has_due_date_without_payment(self):
  expression=self.call().replace('"is_paid": true','"is_paid": false')
  r=self.f.case('SELECT '+expression+f";RESET ROLE;SELECT jsonb_build_object('paid',is_paid,'paid_date',paid_date,'due_date',due_date,'vat',vat_rate) FROM company_costs WHERE notes='Carico magazzino · richiesta {self.key}'")
  self.assertEqual(r,{'paid':False,'paid_date':None,'due_date':'2026-11-18','vat':22})
if __name__=='__main__':unittest.main(verbosity=2)
