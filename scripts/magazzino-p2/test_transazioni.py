"""Integration tests against a dedicated native PostgreSQL fixture, never Supabase.
Run: python3 scripts/magazzino-p2/test_transazioni.py
Requires the schema in schema-locale.sql and the proposal already loaded.
"""
import concurrent.futures, json, os, subprocess, time, unittest, uuid
from pathlib import Path
PSQL = os.environ.get('EIC_TEST_PSQL', '/opt/homebrew/opt/postgresql@17/bin/psql')
TEST_DATABASE = os.environ.get('EIC_TEST_DATABASE', 'eic_magazzino_p2')
if TEST_DATABASE not in ('eic_magazzino_p2','eic_magazzino_regressione'):
    raise RuntimeError('Sono ammessi soltanto i database sintetici locali di collaudo')
DB = ['-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h','127.0.0.1','-p','55439','-U',os.environ.get('USER','andriciuc'),'-d',TEST_DATABASE]
C='10000000-0000-0000-0000-000000000001'; OTHER='10000000-0000-0000-0000-000000000002'
A='20000000-0000-0000-0000-000000000001'; A2='20000000-0000-0000-0000-000000000002'; DENIED='20000000-0000-0000-0000-000000000003'
W='30000000-0000-0000-0000-000000000001'; O='40000000-0000-0000-0000-000000000001'; O2='40000000-0000-0000-0000-000000000002'
def uid(): return str(uuid.uuid4())
def lit(x):
    if x is None:return 'NULL'
    if isinstance(x,(dict,list)):return "'"+json.dumps(x,ensure_ascii=False).replace("'","''")+"'::jsonb"
    return "'"+str(x).replace("'","''")+"'"
class DbError(Exception):pass
def sql(statement, actor=None, hold=0, role='authenticated'):
    if actor:
        statement=f"BEGIN;SET LOCAL statement_timeout='8s';SET LOCAL ROLE {role};SET LOCAL request.jwt.claim.sub={lit(actor)};{statement};"+(f'SELECT pg_sleep({hold});' if hold else '')+'COMMIT;'
    p=subprocess.run([PSQL,*DB],input=statement,text=True,capture_output=True)
    if p.returncode:raise DbError(p.stderr.strip())
    lines=[x for x in p.stdout.splitlines() if x.strip()]
    if not lines:return None
    try:return json.loads(lines[-1])
    except json.JSONDecodeError:return lines[-1]
def rpc(name,*args,actor=A,hold=0,role='authenticated'):return sql(f'SELECT public.{name}('+','.join(lit(a) for a in args)+')',actor,hold,role)
def parallel(*calls):
    def safe(fn):
        try:return fn()
        except DbError as e:return e
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(calls)) as pool:return list(pool.map(safe,calls))
def seed():
    sql('TRUNCATE public.company_costs,public.warehouse_operation_requests,public.warehouse_return_allocations,public.warehouse_unit_exits,public.warehouse_movements,public.stock_units,public.order_items,public.warehouse_stock,public.warehouse_uscite,public.warehouse_scan_events,public.campo_rapportini,public.orders,public.warehouses,public.customers,public.companies,public.fixture_permissions,public.warehouse_lot_batches,public.warehouse_assignments,public.multi_company_access CASCADE;')
    sql(f"INSERT INTO companies VALUES({lit(C)},'Azienda di collaudo locale'),({lit(OTHER)},'Altra azienda'); INSERT INTO warehouses(id,company_id,name) VALUES({lit(W)},{lit(C)},'Deposito collaudo');INSERT INTO orders(id,company_id) VALUES({lit(O)},{lit(C)}),({lit(O2)},{lit(C)}); INSERT INTO fixture_permissions SELECT a::uuid,{lit(C)}::uuid,p FROM unnest(ARRAY[{lit(A)},{lit(A2)}]) a CROSS JOIN unnest(ARRAY['can_view_warehouse','can_edit_warehouse','can_edit_orders','can_view_orders','can_view_costs','fixture_company_admin']) p;")
def stock(q=10,unit='m',serial=False,cost=12):
    s=uid();sql(f"INSERT INTO warehouse_stock(id,company_id,warehouse_id,name,quantity,unita_misura,tracking_mode,unit_cost) VALUES({lit(s)},{lit(C)},{lit(W)},'Articolo prova',{q},{lit(unit)},{lit('serialized' if serial else 'fungible')},{cost});INSERT INTO warehouse_movements(stock_item_id,company_id,warehouse_id,movement_type,quantity,unit_cost,performed_by) VALUES({lit(s)},{lit(C)},{lit(W)},'carico',{q},{cost},{lit(A)});")
    return s
def line(s,q=10,order=O,unit='m'):
    l=uid();sql(f"INSERT INTO order_items(id,order_id,name,stock_item_id,quantity,unita_misura,status,fulfillment_status) VALUES({lit(l)},{lit(order)},'Materiale prova',{lit(s)},{q},{lit(unit)},'da_ordinare','not_started')")
    return l
def reserve(l,q,key=None,**kw):return rpc('warehouse_reserve_v2',l,q,key or uid(),**kw)
def issue(s,q=1,order=O,key=None,serials=None,l=None,scans=None,**kw):
    scan={'stock_item_id':s,'quantity':q}
    if serials is not None:scan['serial_numbers']=serials
    if l:scan['order_item_id']=l
    return rpc('warehouse_register_uscita_v2',W,{'tipo':'cantiere','order_id':order},scans or [scan],key or uid(),None,None,**kw)
def ret(s,l,q,key=None,serials=None,expected=None,order=O,**kw):return rpc('warehouse_return_material_v2',order,s,l,q,serials or [],key or uid(),expected,**kw)
def state(s):return sql(f"SELECT jsonb_build_object('quantity',quantity,'reserved',quantity_reserved,'available',quantity_available) FROM warehouse_stock WHERE id={lit(s)}")
def count(table):return sql('SELECT count(*) FROM '+table)
def serials(s):
    sql(f"INSERT INTO stock_units(company_id,stock_item_id,warehouse_id,serial_number,purchase_price,warranty_start_date,warranty_months,warranty_expires_at) VALUES({lit(C)},{lit(s)},{lit(W)},'SN-A',12,'2026-01-02',24,'2028-01-02'),({lit(C)},{lit(s)},{lit(W)},'SN-B',14,'2026-02-03',24,'2028-02-03')")

def receive(s,q=1,key=None,event=None,serials=None,scans=None,**kw):
    scan={'stock_item_id':s,'quantity':q,'offline_client_uuid':event or uid(),'unit_price':12}
    if serials is not None:scan['serial_numbers']=serials
    return rpc('warehouse_register_carico_v2',W,None,scans or [scan],key or uid(),None,None,**kw)

class WarehouseTransactions(unittest.TestCase):
    def setUp(self):seed()
    def rejected(self,fn,code='PT409'):
        with self.assertRaises(DbError) as cm:fn()
        self.assertIn(code,str(cm.exception))
    def test_01_concurrent_reservations_cannot_overbook(self):
        s=stock();a=line(s,7);b=line(s,7,O2)
        results=parallel(lambda:reserve(a,7,hold=.25),lambda:reserve(b,7,hold=.25))
        self.assertEqual(sum(isinstance(x,DbError) for x in results),1)
        self.assertEqual(state(s),{'quantity':10,'reserved':7,'available':3})
    def test_02_exact_fractional_reservations_and_release(self):
        s=stock(3.5);l=line(s,3.5)
        reserve(l,2.75);self.assertEqual(state(s)['reserved'],2.75)
        reserve(l,1.25);self.assertEqual(state(s)['reserved'],1.25)
        sql(f'DELETE FROM order_items WHERE id={lit(l)}');self.assertEqual(state(s)['reserved'],0)
    def test_03_own_reserved_stock_consumed_other_protected(self):
        s=stock();a=line(s,6);b=line(s,4,O2)
        reserve(a,6);reserve(b,4);issue(s,6,l=a)
        self.assertEqual(state(s),{'quantity':4,'reserved':4,'available':0})
        self.rejected(lambda:issue(s,1));self.assertEqual(count('warehouse_uscite'),1)
    def test_04_concurrent_reservation_and_outgoing(self):
        s=stock();l=line(s,7,O2)
        results=parallel(lambda:reserve(l,7,hold=.2),lambda:issue(s,7,hold=.2))
        self.assertEqual(sum(isinstance(x,DbError) for x in results),1)
        self.assertGreaterEqual(state(s)['quantity'],state(s)['reserved'])
    def test_05_duplicate_concurrent_outgoing_has_one_result(self):
        s=stock();key=uid()
        results=parallel(lambda:issue(s,2,key=key,hold=.25),lambda:issue(s,2,key=key,hold=.25))
        self.assertEqual(results[0],results[1]);self.assertFalse(isinstance(results[0],DbError),str(results))
        self.assertEqual(count('warehouse_uscite'),1);self.assertEqual(count('warehouse_movements'),2)
        self.assertEqual(state(s)['quantity'],8)
        self.assertEqual(issue(s,2,key=key),results[0])
    def test_06_request_key_cannot_change_payload_or_actor(self):
        s=stock();key=uid();issue(s,2,key=key)
        self.rejected(lambda:issue(s,3,key=key));self.rejected(lambda:issue(s,2,key=key,actor=A2))
        self.assertEqual(state(s)['quantity'],8)
    def test_07_invalid_second_line_rolls_back_everything(self):
        s=stock();t=stock();key=uid()
        self.rejected(lambda:issue(s,key=key,scans=[{'stock_item_id':s,'quantity':2},{'stock_item_id':t,'quantity':99}]))
        self.assertEqual(state(s)['quantity'],10);self.assertEqual(count('warehouse_uscite'),0);self.assertEqual(count('warehouse_operation_requests'),0)
        issue(s,1,key=key);self.assertEqual(sql('SELECT max(numero_seq) FROM warehouse_uscite'),1)
    def test_08_fractional_return_and_fifo_original_costs(self):
        s=stock(20,cost=10);l=line(s,20);issue(s,2.5,l=l)
        sql(f'UPDATE warehouse_stock SET unit_cost=20 WHERE id={lit(s)}');issue(s,2,l=l)
        sql(f'UPDATE warehouse_stock SET unit_cost=99 WHERE id={lit(s)}')
        r=ret(s,l,3.25,expected=0)
        self.assertEqual(r['valore_stornato'],40);self.assertEqual(r['avanzano'],1.25);self.assertEqual(state(s)['quantity'],18.75)
        self.assertEqual(sql('SELECT sum(quantity) FROM warehouse_return_allocations'),3.25)
    def test_09_pieces_cannot_have_fractional_returns(self):
        s=stock(unit='pz');l=line(s,unit='pz');issue(s,2,l=l)
        self.rejected(lambda:ret(s,l,.5),code='22023');self.assertEqual(state(s)['quantity'],8)
    def test_10_concurrent_returns_stale_residue_rejected(self):
        s=stock();l=line(s);issue(s,4,l=l)
        results=parallel(lambda:ret(s,l,2.5,expected=0,hold=.2),lambda:ret(s,l,2.5,expected=0,hold=.2))
        self.assertEqual(sum(isinstance(x,DbError) for x in results),1);self.assertEqual(state(s)['quantity'],8.5)
    def test_11_return_duplicate_request_replays_even_stale_expected(self):
        s=stock();l=line(s);issue(s,4,l=l);key=uid()
        results=parallel(lambda:ret(s,l,1.25,key=key,expected=0,hold=.2),lambda:ret(s,l,1.25,key=key,expected=0))
        self.assertEqual(results[0],results[1]);self.assertFalse(isinstance(results[0],DbError),str(results));self.assertEqual(state(s)['quantity'],7.25)
    def test_12_serial_return_restores_exact_unit_and_warranty(self):
        s=stock(2,'pz',True);l=line(s,2,unit='pz');serials(s);issue(s,2,l=l,serials=['SN-A','SN-B'])
        r=ret(s,l,1,serials=['SN-B'],expected=0)
        self.assertEqual(r['seriali_ripristinati'],1);self.assertEqual(state(s)['quantity'],1)
        self.assertEqual(sql("SELECT jsonb_build_object('status',status,'order',delivered_to_order_id,'warranty',warranty_expires_at) FROM stock_units WHERE serial_number='SN-B'"),{'status':'available','order':None,'warranty':'2028-02-03'})
        self.rejected(lambda:ret(s,l,1,serials=['SN-B']));self.assertEqual(state(s)['quantity'],1)
    def test_13_serial_wrong_order_installed_and_duplicates_rejected(self):
        s=stock(2,'pz',True);l=line(s,2,unit='pz');serials(s);issue(s,2,l=l,serials=['SN-A','SN-B'])
        self.rejected(lambda:ret(s,None,1,serials=['SN-A'],order=O2))
        self.rejected(lambda:ret(s,l,2,serials=['SN-A','SN-A']),code='22023')
        sql("UPDATE stock_units SET status='installed' WHERE serial_number='SN-A'")
        self.rejected(lambda:ret(s,l,1,serials=['SN-A']));self.assertEqual(count('warehouse_return_allocations'),0)
    def test_14_serial_failure_rolls_back_prior_valid_unit(self):
        s=stock(2,'pz',True);l=line(s,2,unit='pz');serials(s);issue(s,2,l=l,serials=['SN-A','SN-B'])
        sql("UPDATE stock_units SET status='installed' WHERE serial_number='SN-B'")
        self.rejected(lambda:ret(s,l,2,serials=['SN-A','SN-B']));self.assertEqual(count('warehouse_return_allocations'),0)
        self.assertEqual(sql("SELECT status FROM stock_units WHERE serial_number='SN-A'"),'shipped');self.assertEqual(state(s)['quantity'],0)
    def test_15_unassigned_outgoing_can_return_with_explicit_origin(self):
        s=stock();issue(s,2.75);r=ret(s,None,.75)
        self.assertEqual(r['avanzano'],2);self.assertEqual(state(s)['quantity'],8)
    def test_16_report_consumption_reduces_returnable(self):
        s=stock();l=line(s);issue(s,5,l=l)
        material=[{'order_item_id':l,'stock_item_id':s,'quantita':3.5,'unita':'m'}]
        sql(f"INSERT INTO campo_rapportini(order_id,stato,materiali_usati) VALUES({lit(O)},'approvato',{lit(material)})")
        self.rejected(lambda:ret(s,l,2));self.assertEqual(ret(s,l,1.5)['avanzano'],0)
    def test_17_legacy_return_consumes_fifo_before_new_return(self):
        s=stock(20,cost=10);l=line(s,20);issue(s,2,l=l)
        sql(f'UPDATE warehouse_stock SET unit_cost=20 WHERE id={lit(s)}');issue(s,2,l=l)
        sql(f"INSERT INTO warehouse_movements(stock_item_id,company_id,warehouse_id,order_id,order_item_id,movement_type,quantity,unit_cost,rientro_commessa,performed_by) VALUES({lit(s)},{lit(C)},{lit(W)},{lit(O)},{lit(l)},'carico',1,10,true,{lit(A)});UPDATE warehouse_stock SET quantity=quantity+1 WHERE id={lit(s)}")
        self.assertEqual(ret(s,l,2)['valore_stornato'],30)
    def test_18_zero_original_cost_stays_zero(self):
        s=stock(cost=0);l=line(s);issue(s,2,l=l);sql(f'UPDATE warehouse_stock SET unit_cost=88 WHERE id={lit(s)}')
        self.assertEqual(ret(s,l,.5)['valore_stornato'],0)
        self.assertEqual(sql('SELECT unit_cost FROM warehouse_movements WHERE rientro_commessa'),0)
    def test_19_access_denied_and_internal_helpers_hidden(self):
        s=stock();self.rejected(lambda:issue(s,actor=DENIED),code='42501')
        self.rejected(lambda:sql(f'SELECT public.warehouse_claim_v2({lit(C)},{lit(uid())},\'x\',\'{{}}\')',A),code='42501')
        self.rejected(lambda:rpc('warehouse_capabilities_v2',OTHER),code='42501')
        self.rejected(lambda:sql('SELECT * FROM warehouse_operation_requests',A),code='42501')
        self.rejected(lambda:rpc('warehouse_capabilities_v2',C,actor=A,role='anon'),code='42501')
    def test_20_raw_stock_updates_cannot_bypass_reservations(self):
        s=stock();l=line(s);reserve(l,8)
        self.rejected(lambda:sql(f'UPDATE warehouse_stock SET quantity=7 WHERE id={lit(s)}'),code='23514')
        self.assertEqual(state(s)['quantity'],10)

    def test_21_fractional_installation_preserves_reservations(self):
        s=stock(10);l=line(s,2.75);reserve(l,2.75)
        sql(f"SET request.jwt.claim.sub={lit(A)};UPDATE order_items SET status='installato' WHERE id={lit(l)}")
        self.assertEqual(state(s),{'quantity':7.25,'reserved':0,'available':7.25})
    def test_22_serial_install_requires_prior_identified_exit(self):
        s=stock(2,'pz',True);l=line(s,2,unit='pz');serials(s)
        self.rejected(lambda:sql(f"UPDATE order_items SET status='installato' WHERE id={lit(l)}"))
        self.assertEqual(state(s)['quantity'],2)
        issue(s,2,l=l,serials=['SN-A','SN-B'])
        sql(f"UPDATE order_items SET status='installato' WHERE id={lit(l)}")
        self.assertEqual(state(s)['quantity'],0)
    def test_23_duplicate_serials_in_separate_scans_roll_back(self):
        s=stock(2,'pz',True);serials(s)
        self.rejected(lambda:issue(s,scans=[{'stock_item_id':s,'quantity':1,'serial_numbers':['SN-A']},{'stock_item_id':s,'quantity':1,'serial_numbers':['SN-A']}]))
        self.assertEqual(count('warehouse_uscite'),0);self.assertEqual(state(s)['quantity'],2)
    def test_24_simultaneous_serial_return_restores_once(self):
        s=stock(2,'pz',True);l=line(s,2,unit='pz');serials(s);issue(s,2,l=l,serials=['SN-A','SN-B'])
        results=parallel(lambda:ret(s,l,1,serials=['SN-A'],hold=.2),lambda:ret(s,l,1,serials=['SN-A'],hold=.2))
        self.assertEqual(sum(isinstance(x,DbError) for x in results),1);self.assertEqual(state(s)['quantity'],1)
    def test_25_incompatible_measurements_rejected(self):
        s=stock();l=line(s,unit='kg');issue(s,2,l=l)
        self.rejected(lambda:ret(s,l,1),code='22023');self.assertEqual(count('warehouse_return_allocations'),0)
    def test_26_request_scope_cannot_leak_costs(self):
        s=stock();l=line(s);issue(s,2,l=l)
        sql(f"DELETE FROM fixture_permissions WHERE actor={lit(A)} AND permission='can_view_costs'")
        self.assertIsNone(ret(s,l,1)['valore_stornato'])

    def test_27_concurrent_duplicate_carico_counts_once(self):
        s=stock();key=uid();event=uid()
        results=parallel(lambda:receive(s,1.25,key=key,event=event,hold=.2),lambda:receive(s,1.25,key=key,event=event))
        self.assertEqual(results[0],results[1]);self.assertFalse(isinstance(results[0],DbError),str(results))
        self.assertEqual(state(s)['quantity'],11.25);self.assertEqual(count('warehouse_movements'),2)
    def test_28_same_scan_different_requests_cannot_load_twice(self):
        s=stock();event=uid()
        results=parallel(lambda:receive(s,1.25,event=event,hold=.2),lambda:receive(s,1.25,event=event,hold=.2))
        self.assertEqual(sum(isinstance(x,DbError) for x in results),1);self.assertEqual(state(s)['quantity'],11.25)
    def test_29_fractional_carico_stock_and_ledger_agree(self):
        s=stock();receive(s,.75)
        self.assertEqual(sql(f"SELECT sum(CASE WHEN movement_type='carico' THEN quantity ELSE -quantity END) FROM warehouse_movements WHERE stock_item_id={lit(s)}"),10.75)
        self.assertEqual(state(s)['quantity'],10.75)
    def test_30_serial_carico_is_atomic_on_duplicate(self):
        s=stock(2,'pz',True);serials(s)
        self.rejected(lambda:receive(s,2,serials=['SN-NEW','SN-A']))
        self.assertEqual(count('stock_units'),2);self.assertEqual(state(s)['quantity'],2)
    def test_31_serial_carico_requires_exact_count(self):
        s=stock(1,'pz',True)
        self.rejected(lambda:receive(s,2,serials=['ONE']),code='22023');self.assertEqual(state(s)['quantity'],1)
    def test_32_carico_bad_second_row_rolls_back_first(self):
        s=stock();t=stock(unit='pz')
        self.rejected(lambda:receive(s,scans=[{'stock_item_id':s,'quantity':1,'offline_client_uuid':uid()},{'stock_item_id':t,'quantity':.75,'offline_client_uuid':uid()}]),code='22023')
        self.assertEqual(state(s)['quantity'],10);self.assertEqual(count('warehouse_scan_events'),0)
    def test_33_carico_and_uscita_preserve_balance_concurrently(self):
        s=stock()
        results=parallel(lambda:receive(s,.75,hold=.2),lambda:issue(s,2.25,hold=.2))
        self.assertFalse(any(isinstance(x,DbError) for x in results),str(results));self.assertEqual(state(s)['quantity'],8.5)
    def test_34_serial_reserved_for_other_order_is_rejected(self):
        s=stock(2,'pz',True);serials(s)
        sql(f"UPDATE stock_units SET status='reserved',reserved_order_id={lit(O2)} WHERE serial_number='SN-A'")
        self.rejected(lambda:issue(s,1,serials=['SN-A']));self.assertEqual(state(s)['quantity'],2)
    def test_35_no_orphan_claim_after_late_failure(self):
        s=stock(2,'pz',True);serials(s);key=uid()
        self.rejected(lambda:issue(s,2,key=key,serials=['SN-A','MISSING']))
        self.assertEqual(count('warehouse_operation_requests'),0);self.assertEqual(count('warehouse_unit_exits'),0)
        self.assertEqual(sql("SELECT status FROM stock_units WHERE serial_number='SN-A'"),'available')

    def test_36_fractional_report_with_decimal_comma_is_not_ignored(self):
        s=stock();l=line(s);issue(s,5,l=l)
        material=[{'order_item_id':l,'stock_item_id':s,'quantita':' 3,5 ','unita':'m'}]
        sql(f"INSERT INTO campo_rapportini(order_id,stato,materiali_usati) VALUES({lit(O)},'approvato',{lit(material)})")
        self.rejected(lambda:ret(s,l,2));self.assertEqual(ret(s,l,1.5)['avanzano'],0)
    def test_37_installed_row_cannot_return_serials(self):
        s=stock(2,'pz',True);l=line(s,2,unit='pz');serials(s);issue(s,2,l=l,serials=['SN-A','SN-B'])
        sql(f"UPDATE order_items SET status='installato' WHERE id={lit(l)}")
        self.rejected(lambda:ret(s,l,1,serials=['SN-A']));self.assertEqual(state(s)['quantity'],0)
    def test_38_fractional_reservation_of_pieces_is_rejected(self):
        s=stock(unit='pz');l=line(s,unit='pz')
        self.rejected(lambda:reserve(l,1.5),code='22023');self.assertEqual(state(s)['reserved'],0)

    def test_39_candidates_use_real_residue_and_eligible_serials(self):
        s=stock(2,'pz',True);l=line(s,2,unit='pz');serials(s);issue(s,2,l=l,serials=['SN-A','SN-B'])
        ret(s,l,1,serials=['SN-A'])
        candidates=rpc('warehouse_return_candidates_v2',O)
        self.assertEqual(len(candidates),1);self.assertEqual(candidates[0]['avanzano'],1)
        self.assertEqual([u['serial_number'] for u in candidates[0]['serials']],['SN-B'])
        self.assertEqual(candidates[0]['protocolVersion'],2);self.assertIsNone(candidates[0]['blocked'])

    def test_40_install_after_unassigned_partial_return_links_net_only(self):
        s=stock();issue(s,2.5);ret(s,None,1)
        l=line(s,3)
        sql(f"SET request.jwt.claim.sub={lit(A)};UPDATE order_items SET status='installato' WHERE id={lit(l)}")
        self.assertEqual(state(s)['quantity'],7)
        self.assertEqual(sql(f"SELECT magazzino_scaricato_riga({lit(l)},{lit(s)})"),3)
        self.assertEqual(sql(f"SELECT count(*) FROM warehouse_movements WHERE rientro_commessa AND order_item_id={lit(l)}"),1)
    def test_41_cannot_split_returned_origin_ambiguously(self):
        s=stock();issue(s,3);ret(s,None,1);l=line(s,1)
        self.rejected(lambda:sql(f"SET request.jwt.claim.sub={lit(A)};UPDATE order_items SET status='installato' WHERE id={lit(l)}"))
        self.assertEqual(state(s)['quantity'],8)
    def test_42_legacy_unassigned_without_return_keeps_partial_link(self):
        s=stock();issue(s,3);l=line(s,1)
        sql(f"SET request.jwt.claim.sub={lit(A)};UPDATE order_items SET status='installato' WHERE id={lit(l)}")
        self.assertEqual(state(s)['quantity'],7)
        self.assertEqual(sql(f"SELECT magazzino_scaricato_riga({lit(l)},{lit(s)})"),1)

if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(WarehouseTransactions))
    report={'tests':result.testsRun,'passed':result.testsRun-len(result.failures)-len(result.errors),'failures':len(result.failures),'errors':len(result.errors),'database':'127.0.0.1:55439/eic_magazzino_p2','timestamp':time.strftime('%Y-%m-%dT%H:%M:%S%z')}
    Path('docs/ux/magazzino-p2/esito-transazioni.json').write_text(json.dumps(report,indent=2)+'\n')
    raise SystemExit(not result.wasSuccessful())
