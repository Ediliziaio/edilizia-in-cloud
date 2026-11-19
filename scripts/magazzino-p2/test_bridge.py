import unittest
from bridge import execute,matches,enriched
from test_transazioni import seed,stock,line,issue,state,C,OTHER,W,O,uid,sql,lit
class LocalBridge(unittest.TestCase):
    def setUp(self):seed()
    def test_company_filter_uses_only_fixture(self):
        s=stock();result=execute({'resource':'warehouse_stock','method':'GET','params':[['company_id','eq.online-company']]})
        self.assertEqual(result['count'],1);self.assertEqual(result['data'][0]['company_id'],C)
    def test_ddt_list_reads_only_synthetic_documents(self):
        local,foreign=uid(),uid();sql(f'INSERT INTO documenti_fiscali(id,company_id) VALUES({lit(local)},{lit(C)}),({lit(foreign)},{lit(OTHER)})')
        for resource in ('documenti_fiscali','documenti_fiscali_elenco','documenti_fiscali_elenco_operativo'):
            result=execute({'resource':resource,'method':'GET','params':[['company_id','eq.online-company']]})
            self.assertIn(local,[r['id'] for r in result['data']]);self.assertNotIn(foreign,[r['id'] for r in result['data']]);self.assertTrue(all(r['company_id']==C for r in result['data']))
    def test_raw_updates_are_never_movements(self):
        s=stock()
        with self.assertRaisesRegex(ValueError,'funzioni transazionali'):execute({'resource':'warehouse_stock','method':'PATCH','body':{'quantity':99}})
        self.assertEqual(state(s)['quantity'],10)
    def test_unknown_table_or_function_does_not_fall_back(self):
        for resource in ('unrecognized_table','rpc/register_warehouse_uscita'):
            with self.assertRaises(ValueError):execute({'resource':resource,'method':'GET'})
    def test_bridge_calls_real_fractional_movement(self):
        s=stock();r=execute({'resource':'rpc/warehouse_register_carico_v2','method':'POST','body':{'p_warehouse_id':W,'p_supplier_id':None,'p_scans':[{'stock_item_id':s,'quantity':.75,'offline_client_uuid':uid(),'unit_price':10}],'p_request_id':uid()}})
        self.assertEqual(r['data']['created_movements'],1);self.assertEqual(state(s)['quantity'],10.75)
    def test_ddt_calls_real_function_and_returns_postgrest_rows(self):
        s=stock();u=issue(s,2)['uscita_id'];payload={'resource':'rpc/create_ddt_from_uscita','method':'POST','body':{'p_uscita_id':u,'p_ddt_extra':{}}}
        r=execute(payload)['data'];self.assertIsInstance(r,list);self.assertTrue(r[0]['documento_id']);self.assertEqual(execute(payload)['data'],r);self.assertEqual(state(s)['quantity'],8)
    def test_nested_date_or_filter_and_decimal_filter(self):
        self.assertTrue(matches({'quantity':1.25},'quantity','gte.1.2'))
        self.assertTrue(matches({'start':None,'expected':'2026-11-18'},'or','(and(start.gte.2026-11-17,start.lte.2026-11-30),and(start.is.null,expected.gte.2026-11-17))'))
    def test_valuation_maps_only_fixture_company_identity(self):
        stock(2.75,cost=12)
        r=execute({'resource':'rpc/wh_get_valorizzazione','method':'POST','body':{'p_company_id':'ui-company','p_method':'media','p_warehouse_id':None}})['data']
        self.assertEqual(r['meta']['company_id'],'ui-company');self.assertEqual(r['kpi']['valore_totale'],33)
    def test_order_join_respects_scope(self):
        s=stock();l=line(s)
        result=execute({'resource':'order_items','method':'GET','params':[['order.company_id','eq.company-id'],['order.deleted_at','is.null']]})
        self.assertEqual(result['count'],1);self.assertEqual(result['data'][0]['order']['order_code'],'LOC-001')
if __name__=='__main__':unittest.main(verbosity=2)
