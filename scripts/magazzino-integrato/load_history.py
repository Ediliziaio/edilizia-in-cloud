"""Carica solo proiezioni necessarie. Contatti e credenziali non vengono copiati."""
import collections,json,uuid,hashlib
from db import *
COMPANY='d2000000-0000-4000-a000-000000000002'
OTHER='90000000-0000-4000-a000-000000000002'
ADMIN='80000000-0000-4000-a000-000000000001'
STAFF='80000000-0000-4000-a000-000000000002'
VIEWER='80000000-0000-4000-a000-000000000003'
DENIED='80000000-0000-4000-a000-000000000004'
def load_history():
 m=load('schema-ready.json');s=load('ricezioni.json');e=load('contesto.json');values={r['id']:r for r in load('order-item-values.json')}
 columns=collections.defaultdict(dict)
 for c in m['columns']:columns[c['table']][c['name']]=c
 statements=["DO $$ BEGIN IF current_database()<>'eic_magazzino_integrato' THEN RAISE EXCEPTION 'Database locale richiesto';END IF;END $$;BEGIN;SET LOCAL session_replication_role=replica;SET LOCAL search_path=public,extensions,auth;"]
 tables=sql("SELECT jsonb_agg(quote_ident(schemaname)||'.'||quote_ident(tablename)) FROM pg_tables WHERE schemaname IN ('public','auth')")
 statements.append('TRUNCATE '+','.join(tables)+' RESTART IDENTITY CASCADE;')
 def insert(table,rows,schema='public'):
  for r in rows:
   r={k:v for k,v in r.items() if k in columns[table] and not columns[table][k]['generated']}
   for k,c in columns[table].items():
    if c['notnull'] and not c['default'] and not c['identity'] and not c['generated'] and k not in r:
     if c['type'].startswith(('text','character')):r[k]='Locale '+str(r.get('id',''))[-8:]
     else:raise ValueError('Campo non disponibile: '+table+'.'+k)
   statements.append('INSERT INTO '+ident(schema)+'.'+ident(table)+'('+','.join(ident(k) for k in r)+') VALUES('+','.join(lit(v) for v in r.values())+');')
 insert('companies',[{'id':COMPANY,'name':'Copia locale Demo Azienda 2','email':'copia@example.invalid'},{'id':OTHER,'name':'Altra azienda locale','email':'altra@example.invalid'}])
 actor_ids={r['received_by'] for r in s['goods_receipts'] if r['received_by']}|{ADMIN,STAFF,VIEWER,DENIED}
 insert('users',[{'id':u,'email':u+'@local.invalid'} for u in sorted(actor_ids)],schema='auth')
 insert('profiles',[{'id':u,'company_id':OTHER if u==DENIED else COMPANY,'first_name':'Utente','last_name':'Locale','email':u+'@local.invalid'} for u in sorted(actor_ids)])
 insert('user_roles',[{'user_id':u,'role':'company_admin' if u==ADMIN else 'company_staff'} for u in [ADMIN,STAFF,VIEWER,DENIED]])
 insert('staff_permissions',[{'user_id':u,'company_id':COMPANY,'can_view_warehouse':True,'can_edit_warehouse':u==STAFF,'can_view_orders':True,'can_edit_orders':u==STAFF,'can_manage_purchasing':u==STAFF,'can_view_costs':u==STAFF} for u in [STAFF,VIEWER]])
 insert('warehouses',e['warehouses']);insert('suppliers',[dict(r,name='Fornitore locale '+r['id'][-8:]) for r in e['suppliers']])
 insert('orders',[dict(r,description='Commessa locale '+str(r.get('order_code') or r['id'])) for r in e['orders']])
 insert('warehouse_stock',e['warehouse_stock'])
 insert('order_items',[dict(r,**{k:v for k,v in values.get(r['id'],{}).items() if k!='id'},name='Materiale locale '+r['id'][-8:]) for r in s['order_items']])
 totals={r['id']:r for r in e['purchase_order_totals']}
 insert('purchase_orders',[dict(r,**{k:v for k,v in totals[r['id']].items() if k!='id'}) for r in s['purchase_orders']])
 insert('purchase_order_items',[dict(r,description='Posizione locale '+r['id'][-8:]) for r in s['purchase_order_items']])
 insert('ddt_ricezione',s['ddt_ricezione']);insert('goods_receipts',s['goods_receipts']);insert('arrivi_posizione',e['arrivi_posizione'])
 insert('company_costs',[dict(r,name='Costo locale '+r['id'][-8:]) for r in e['company_costs']])
 # Dati fiscali sintetici: nessuna anagrafica reale o credenziale viene duplicata.
 digits='1234567890';check=(10-sum((int(x) if i%2==0 else (2*int(x) if int(x)<5 else 2*int(x)-9)) for i,x in enumerate(digits))%10)%10;vat=digits+str(check)
 insert('anagrafica_azienda',[{'company_id':c,'ragione_sociale':'Impresa locale','partita_iva':vat,'codice_fiscale':vat,'indirizzo_via':'Via Locale 1','indirizzo_cap':'00100','indirizzo_comune':'Roma','indirizzo_provincia':'RM'} for c in [COMPANY,OTHER]])
 statements.append('COMMIT;');sql('\n'.join(statements))
 # Convalida anche i riferimenti importati: non basta disattivare i trigger durante la copia.
 sql("DO $$ DECLARE r record;BEGIN FOR r IN SELECT conrelid::regclass t,conname FROM pg_constraint WHERE contype='f' AND NOT convalidated LOOP EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I',r.t,r.conname);END LOOP;END $$")
 counts={t:sql('SELECT count(*) FROM public.'+ident(t)) for t in ['purchase_orders','purchase_order_items','goods_receipts','ddt_ricezione','warehouse_stock','company_costs']}
 (REPORT/'history-load.json').write_text(json.dumps({'counts':counts,'source_sha256':hashlib.sha256((SOURCE/'ricezioni.json').read_bytes()).hexdigest(),'contact_fields_synthetic':True},indent=2)+'\n')
 print(json.dumps(counts))
if __name__=='__main__':load_history()
