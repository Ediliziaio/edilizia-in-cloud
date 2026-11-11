-- ============================================================================
-- Prova a schermo dell'11/11/2026: un contratto in firma si poteva eliminare.
-- La richiesta restava senza contratto (FK set null) e la ditta aveva in mano
-- un link a un documento che non c'era più. Si annulla la richiesta, poi si
-- elimina. Corretta sul testo della funzione, come 20290216150000.
-- ============================================================================

set local lock_timeout = '3s';

do $do$
declare
  d text;
begin
  d := pg_get_functiondef('public.contratto_subappalto_protetto()'::regprocedure);
  if d like '%Il contratto è in firma: per eliminarlo%' then return; end if;
  d := replace(d,
    '  if tg_op = ''DELETE'' then
',
    '  if tg_op = ''DELETE'' then
    if public.contratto_in_firma(old.id) then
      raise exception using errcode = ''23514'',
        message = ''Il contratto è in firma: per eliminarlo annulla prima la richiesta di firma.'';
    end if;
');
  if d not like '%Il contratto è in firma: per eliminarlo%' then
    raise exception 'contratto_subappalto_protetto: testo non atteso, correzione non applicata';
  end if;
  execute d;
end
$do$;
