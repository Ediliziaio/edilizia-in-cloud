-- Fasi e voci della commessa, seconda parte: le colonne degli importi non si
-- leggono più dalle tabelle grezze (vedi 20290327110000 per lo schema).
-- Da applicare solo con il frontend che legge da order_work_phases_visibili e
-- order_work_phase_voci_visibili già online.
--
-- Una colonna NUOVA su queste tabelle non è leggibile da `authenticated`
-- finché non si rilancia questo blocco (e quello delle viste in 20290327110000).
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Permessi per colonna sulle tabelle grezze: tutto tranne gli importi.
do $colonne$
declare t record; cols text;
begin
 for t in select * from (values
   ('order_work_phases', array['importo_venduto']),
   ('order_work_phase_voci', array['importo', 'costo_manodopera', 'costo_materiali'])
 ) x(tabella, protette) loop
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
    from pg_attribute a
   where a.attrelid = format('public.%I', t.tabella)::regclass and a.attnum > 0 and not a.attisdropped
     and a.attname <> all (t.protette);
  execute format('revoke select on public.%I from authenticated, anon', t.tabella);
  execute format('revoke select (%s) on public.%I from authenticated, anon',
    (select string_agg(quote_ident(c), ', ') from unnest(t.protette) c), t.tabella);
  execute format('grant select (%s) on public.%I to authenticated', cols, t.tabella);
 end loop;
end $colonne$;
