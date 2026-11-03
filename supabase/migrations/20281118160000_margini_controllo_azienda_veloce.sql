-- La tab Marginalità andava in errore 500: v_ordine_marginalita superava gli 8 secondi del server
-- (Demo Azienda 2, 234 commesse: 8,1 secondi, con o senza le regole dei permessi).
-- Per ogni commessa queste due funzioni rifacevano il controllo su TUTTE le aziende della piattaforma.
-- Basta controllare l'azienda dell'ordine: stesso significato, una sola verifica.
do $mig$
declare
  f record;
  v_def text;
  v_nuova text;
begin
  for f in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('marginalita_costo_oda', 'oda_copertura_righe')
  loop
    v_def := pg_get_functiondef(f.oid);
    v_nuova := regexp_replace(
      v_def,
      '(po2?)\.company_id\s+in\s*\(\s*select\s+c\.id\s+from\s+public\.companies\s+c\s+where\s+public\.user_can_access_company\(c\.id\)\s*\)',
      'public.user_can_access_company(\1.company_id)',
      'gi');
    if v_nuova = v_def and v_def !~ 'user_can_access_company\(po2?\.company_id\)' then
      raise exception 'Funzione %: controllo non riconosciuto', f.proname;
    end if;
    execute v_nuova;
  end loop;
end $mig$;
