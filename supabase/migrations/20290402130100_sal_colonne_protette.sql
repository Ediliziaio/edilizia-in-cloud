-- Le colonne degli importi dei SAL chiuse sulle tabelle grezze (15/11/2026).
--
-- Dopo 20290402130000 il browser legge verbali, voci e sottofasi dalle viste `*_visibili`
-- (lib/orders/protectedSalRequests, online dal commit f883bc956, 15/11/2026). Qui il GRANT di SELECT diventa per
-- colonna: tutto tranne gli importi. Le righe visibili non cambiano, quindi nessuna regola di altre
-- tabelle si svuota. Chi legge davvero gli importi lo fa dalle viste (col diritto) o da funzioni
-- SECURITY DEFINER e dal service role, che non passano da questi permessi.
-- Una colonna nuova che il browser deve leggere va aggiunta qui e rilanciata insieme al blocco delle
-- viste di 20290402130000.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $colonne$
declare t record; cols text;
begin
 for t in select * from (values
   ('sal_records', array['importo_totale']),
   ('sal_voci', array['importo_contrattuale', 'importo_sal']),
   ('sal_voci_sottofasi', array['importo_contrattuale', 'importo_sal'])
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
