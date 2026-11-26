-- La programmazione della giornata segnalava il conflitto di versione con SQLSTATE
-- 40001: quel codice fa ripetere la transazione a PostgREST, quindi lo stesso
-- salvataggio obsoleto veniva ritentato invece di fermarsi. PT409 è un 409 secco,
-- senza retry, e conserva messaggio, firma, proprietario, SECURITY, search_path e
-- permessi (CREATE OR REPLACE non li tocca). Nessuna riga di dati viene scritta.
-- Allinea il database ai file corretti di 20290613150000_programmazione_giornata.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $migration$
declare f record; originale text; corretto text;
begin
  for f in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname = any(array['programmazione_salva', 'programmazione_pubblica'])
       and p.prosrc ~* $pattern$errcode[[:space:]]*=[[:space:]]*'40001'$pattern$
  loop
    originale := pg_get_functiondef(f.oid);
    corretto := regexp_replace(
      originale,
      $pattern$(errcode[[:space:]]*=[[:space:]]*)'40001'$pattern$,
      $replacement$\1'PT409'$replacement$,
      'gi'
    );
    if corretto is distinct from originale then execute corretto; end if;
  end loop;
end
$migration$;
notify pgrst, 'reload schema';
