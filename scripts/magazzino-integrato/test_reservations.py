"""Nuovi vincoli di prenotazione su schema integrato, sempre rollback."""
import unittest
import test_integrated as base
from db import lit
from test_integrated import uid
from load_history import VIEWER
class Reservations(unittest.TestCase):
 def setUp(self):self.f=base.Integrated();self.f.setUp()
 def reserve(self,q,key=None):return 'warehouse_reserve_v2('+','.join(lit(x) for x in [self.f.i,q,key or uid()])+')'
 def issue(self,q):return 'warehouse_register_uscita_v2('+','.join(lit(x) for x in [self.f.w,{'tipo':'cantiere','order_id':self.f.o},[{'stock_item_id':self.f.s,'order_item_id':self.f.i,'quantity':q}],uid(),None,None])+')'
 def ret(self,q):return 'warehouse_return_material_v2('+','.join(lit(x) for x in [self.f.o,self.f.s,self.f.i,q,[],uid(),0])+')'
 def balances(self):return "SELECT jsonb_build_object('q',quantity,'r',quantity_reserved,'a',quantity_available) FROM warehouse_stock WHERE id="+lit(self.f.s)
 def test_01_reserve_issue_return_balances(self):
  f=self.f;r=f.case('SELECT '+f.receive(4)+';SELECT '+self.reserve(4)+';SELECT '+self.issue(3)+';SELECT '+self.ret(1)+';RESET ROLE;'+self.balances());self.assertEqual(r,{'q':2,'r':1,'a':1})
 def test_02_net_issued_caps_remaining_reservation(self):
  f=self.f;r=f.case('SELECT '+f.receive(4)+';SELECT '+self.issue(3)+";DO $$BEGIN BEGIN PERFORM "+self.reserve(2)+";RAISE EXCEPTION 'Prenotazione accettata oltre il residuo';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;END $$;SELECT true");self.assertTrue(r)
 def test_03_return_reopens_need_only_for_returned_quantity(self):
  f=self.f;r=f.case('SELECT '+f.receive(4)+';SELECT '+self.issue(3)+';SELECT '+self.ret(1)+';SELECT '+self.reserve(2)+';RESET ROLE;'+self.balances());self.assertEqual(r,{'q':2,'r':2,'a':0})
 def test_04_zero_releases_only_own_reservation(self):
  f=self.f;r=f.case('SELECT '+f.receive(4)+';SELECT '+self.reserve(0)+';RESET ROLE;'+self.balances());self.assertEqual(r,{'q':4,'r':0,'a':4})
 def test_05_same_request_replays_without_second_reservation(self):
  f=self.f;e=self.reserve(2,uid());r=f.case('SELECT '+f.receive(4)+';SELECT '+e+';SELECT '+e+';RESET ROLE;'+self.balances());self.assertEqual(r,{'q':4,'r':2,'a':2})
 def test_06_permissions_stay_enforced(self):self.f.denied(self.reserve(1),VIEWER)
if __name__=='__main__':unittest.main(verbosity=2)
