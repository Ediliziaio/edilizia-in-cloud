"""Anteprima e applicazione alla sola copia locale; mai inserimenti di merce/costi."""
import csv,json,uuid,hashlib
from db import *
from load_history import COMPANY
PHYSICAL=('warehouse_stock','warehouse_movements','stock_units','goods_receipts','company_costs','documenti_fiscali')
def fingerprint():
 out={}
 for t in PHYSICAL:
  out[t]=sql('SELECT jsonb_build_object(\'count\',count(*),\'hash\',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),\'[]\')::text)) FROM public.'+ident(t)+' t')
 out['statuses']=sql("SELECT md5(jsonb_agg(jsonb_build_array(id,status,actual_delivery_date) ORDER BY id)::text) FROM public.purchase_orders")
 return out

def run():
 before=fingerprint();p=sql('SELECT public.warehouse_receipt_reconciliation_preview_v4('+lit(COMPANY)+')')
 plans=CACHE/'plans';plans.mkdir(mode=0o700,exist_ok=True)
 (plans/'receipt-plan.json').write_text(json.dumps(p,indent=2)+'\n')
 source=load('ricezioni.json');numbers={r['id']:r['oda_number'] for r in source['purchase_orders']}
 with open(plans/'ricezioni-da-riconciliare.csv','w') as f:
  w=csv.writer(f);w.writerow(['ODA','Riga ODA','Stato','Registrato','Documentato','Saldo storico','Azione'])
  for r in p['rows']:w.writerow([numbers.get(r['order_id'],r['order_id']),r['item_id'],r['status'],r['recorded'],r['documented'],r['quantity'] if r['action']=='preserve_legacy_balance' else 0,r['action']])
 if p['blocked']:raise RuntimeError('Il piano contiene abbinamenti ambigui: nessuna modifica applicata')
 key=str(uuid.uuid4());result=sql('SELECT public.warehouse_receipt_reconciliation_apply_v4('+','.join(lit(v) for v in [COMPANY,p['source_hash'],key])+')')
 replay=sql('SELECT public.warehouse_receipt_reconciliation_apply_v4('+','.join(lit(v) for v in [COMPANY,p['source_hash'],key])+')')
 assert result==replay,'Replay diverso'
 remaining=sql('SELECT public.warehouse_receipt_reconciliation_preview_v4('+lit(COMPANY)+')')
 assert not remaining['rows'] and not remaining['blocked'],'Differenze residue'
 after=fingerprint();assert before==after,'La riconciliazione ha modificato merci, costi o stati'
 summary={'company':'Demo Azienda 2 — copia locale','legacy_balances':p['legacy_balances'],'counter_alignments':p['counter_alignments'],'su_misura_rows_excluded':p['su_misura_rows'],'blocked':len(p['blocked']),'remaining':len(remaining['rows']),'physical_and_financial_unchanged':before==after,'replay_identical':True,'before':before,'after':after,'private_manifest':str(plans/'ricezioni-da-riconciliare.csv'),'source_hash':p['source_hash'],'result':result}
 (REPORT/'riconciliazione.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({k:v for k,v in summary.items() if k not in ('before','after','result')}))
if __name__=='__main__':run()
