-- Un conflitto applicativo è definitivo: PostgREST deve restituire HTTP 409,
-- non ritentare la stessa scrittura come una serializzazione PostgreSQL.
do $migrazione$
declare f record;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('fattura_riconciliazione_salva')
 loop
  execute replace(pg_get_functiondef(f.oid),chr(39)||'40001'||chr(39),chr(39)||'PT409'||chr(39));
 end loop;
end $migrazione$;
