"""Installa proposte esclusivamente nel database locale eic_magazzino_integrato."""
import collections,json
from db import *
def install():
 sql("DO $$ BEGIN IF current_database()<>'eic_magazzino_integrato' THEN RAISE EXCEPTION 'Database locale richiesto';END IF;END $$;DO $$ BEGIN CREATE ROLE service_role NOLOGIN;EXCEPTION WHEN duplicate_object THEN NULL;END $$;")
 m=load('operational-extra.json');by=collections.defaultdict(list)
 for c in m['columns']:by[c['table']].append(c)
 for t,cs in by.items():
  if sql('SELECT to_regclass('+lit('public.'+t)+') IS NOT NULL'):continue
  fields=[]
  for c in sorted(cs,key=lambda c:c['position']):
   field=ident(c['name'])+' '+c['type']
   if c['generated']:field+=' GENERATED ALWAYS AS ('+c['default']+') STORED'
   elif c['default']:field+=' DEFAULT '+c['default']
   if c['notnull']:field+=' NOT NULL'
   fields.append(field)
  sql('CREATE TABLE public.'+ident(t)+'('+','.join(fields)+')')
 for kind in ['p','u','c','f']:
  for c in m['constraints']:
   if c['type']==kind and not sql('SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='+lit('public.'+c['table'])+'::regclass AND conname='+lit(c['name'])+')'):
    sql('ALTER TABLE public.'+ident(c['table'])+' ADD CONSTRAINT '+ident(c['name'])+' '+c['definition'])
 for name in ['magazzino-p2-transazioni.sql','magazzino-p3-operazioni.sql','magazzino-p4-valorizzazione.sql','magazzino-p5-ricezioni-ddt.sql','magazzino-p6-riconciliazione.sql','magazzino-p7-permessi-storno.sql','magazzino-p8-prenotazioni.sql','magazzino-p9-carico-costi.sql','magazzino-p10-ricezioni-frazionarie.sql']:
  print('Installing local proposal:',name,flush=True);run_file(ROOT/'docs/sql-proposte'/name)
 print('Local proposals installed')
if __name__=='__main__':install()
