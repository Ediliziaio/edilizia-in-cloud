-- ============================================================================
-- Prova a schermo dell'11/11/2026: affidando le voci di una fase, il costo
-- previsto scritto a mano sulla ditta veniva sovrascritto; togliendo tutte le
-- voci restava l'ultimo importo affidato, marcato «manuale», e quello di prima
-- era perso. Ora il valore manuale si mette da parte quando gli affidamenti
-- prendono il comando e torna quando se ne vanno.
-- La colonna sta dietro la stessa regola dei costi (costi_solo_con_permesso è
-- sull'intera tabella) e il trigger dei costi protetti la blocca dal browser.
-- Le funzioni si correggono sul loro testo, come 20290216130000.
-- ============================================================================

set local lock_timeout = '3s';

alter table public.order_external_teams add column if not exists cost_preventivo_manuale numeric;

do $do$
declare
  d text;
begin
  d := pg_get_functiondef('public.affidamenti_allinea_ditta(uuid,uuid,uuid)'::regprocedure);
  if d not like '%cost_preventivo_manuale%' then
    d := replace(d,
      'update public.order_external_teams set costo_origine = ''manuale''',
      'update public.order_external_teams set costo_origine = ''manuale'', cost_preventivo = coalesce(cost_preventivo_manuale, cost_preventivo), cost_preventivo_manuale = null');
    d := replace(d,
      'set cost_preventivo = round(v_netto * (1 + v_iva / 100), 2), costo_origine = ''contratto''',
      'set cost_preventivo_manuale = case when costo_origine is distinct from ''contratto'' then cost_preventivo else cost_preventivo_manuale end, cost_preventivo = round(v_netto * (1 + v_iva / 100), 2), costo_origine = ''contratto''');
    if d not like '%coalesce(cost_preventivo_manuale, cost_preventivo)%'
       or d not like '%set cost_preventivo_manuale = case when%' then
      raise exception 'affidamenti_allinea_ditta: testo non atteso, correzione non applicata';
    end if;
    execute d;
  end if;

  d := pg_get_functiondef('public.order_external_teams_costi_protetti()'::regprocedure);
  if d not like '%cost_preventivo_manuale%' then
    d := replace(d,
      'new.cost_preventivo := old.cost_preventivo;',
      'new.cost_preventivo := old.cost_preventivo;
    new.cost_preventivo_manuale := old.cost_preventivo_manuale;');
    if d not like '%new.cost_preventivo_manuale := old.cost_preventivo_manuale;%' then
      raise exception 'order_external_teams_costi_protetti: testo non atteso, correzione non applicata';
    end if;
    execute d;
  end if;
end
$do$;
