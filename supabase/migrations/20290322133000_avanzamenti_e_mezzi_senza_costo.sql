-- 20290322133000_avanzamenti_e_mezzi_senza_costo.sql
--
-- Tre difetti emersi costruendo la demo del grande appalto (Demo Azienda, O-0071, 14/11/2026).
--
-- 1. L'avanzamento di una commessa generale veniva solo dalle sue fasi: O-0071 era al 100 %
--    perché la sua unica fase («Allestimento cantiere») era finita, coi lotti al 80 % e al 15 %.
--    Ora recompute_order_progress, per una generale, conta anche le fasi delle commesse dentro
--    (come il riquadro Cantiere della Panoramica), e quando cambia una fase di una figlia
--    ricalcola anche la generale.
-- 2. Nel riepilogo della generale l'«avanzamento» di una commessa a misura era il misurato
--    (60 % del lotto 2), mentre la commessa diceva 15 % (le fasi). Sono due cose vere e diverse:
--    il riepilogo ora le dà entrambe (avanzamento = misurato, avanzamento_fasi = fasi, a_misura).
-- 3. v_ordine_costi_mezzi_stimati contava i «mezzi senza costo» solo fra quelli assegnati al
--    cantiere: un mezzo usato in un rapportino senza costo orario (rapportino_mezzi_costi con
--    importo NULL) non risultava. Ora conta anche quelli. La vista resta security_invoker.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $migrazione$
declare
  avanz text := pg_get_functiondef('public.recompute_order_progress(uuid)'::regprocedure);
  fasi_vecchio constant text := '      from public.order_work_phases
     where order_id = p_order_id
  ), n as (';
  fasi_nuovo constant text := '      from public.order_work_phases
     where order_id = p_order_id
        -- Commessa generale: anche le fasi delle commesse dentro (20290322133000).
        or order_id in (select o2.id from public.orders o2
                         where o2.commessa_generale_id = p_order_id and o2.deleted_at is null)
  ), n as (';
  vuoto_vecchio constant text := '  if v_pct is null then
    return;
  end if;';
  vuoto_nuovo constant text := '  if v_pct is null then
    perform public.recompute_order_progress(o.commessa_generale_id)
       from public.orders o where o.id = p_order_id and o.commessa_generale_id is not null;
    return;
  end if;';
  fine_vecchio constant text := '     and coalesce(percentuale_avanzamento, -1) <> v_pct;
end;';
  fine_nuovo constant text := '     and coalesce(percentuale_avanzamento, -1) <> v_pct;
  -- Una fase di una commessa dentro una generale muove anche la generale.
  perform public.recompute_order_progress(o.commessa_generale_id)
     from public.orders o where o.id = p_order_id and o.commessa_generale_id is not null;
end;';
  riep text := pg_get_functiondef('public.commessa_generale_riepilogo(uuid)'::regprocedure);
  riep_vecchio constant text := '''avanzamento'', case when f.a_misura and f.importo > 0 then least(100, round(f.misurato / f.importo * 100, 1)) else f.avanzamento end,';
  riep_nuovo constant text := '''avanzamento'', case when f.a_misura and f.importo > 0 then least(100, round(f.misurato / f.importo * 100, 1)) else f.avanzamento end,
           ''avanzamento_fasi'', f.avanzamento, ''a_misura'', f.a_misura,';
  mezzi text := pg_get_viewdef('public.v_ordine_costi_mezzi_stimati'::regclass);
  mezzi_vecchio constant text := 'COALESCE(po.mezzi_senza_costo, (0)::bigint) AS mezzi_senza_costo';
  mezzi_nuovo constant text := '( SELECT count(DISTINCT x.mezzo_id) AS count
           FROM ( SELECT pe.mezzo_id
                   FROM (periodi pe
                     LEFT JOIN costi_annui ca ON ((ca.mezzo_id = pe.mezzo_id)))
                  WHERE ((pe.order_id = o.id) AND (COALESCE(ca.costo_annuo, (0)::numeric) <= (0)::numeric))
                UNION
                 SELECT q.mezzo_id
                   FROM rapportino_mezzi_costi q
                  WHERE ((q.order_id = o.id) AND (q.importo IS NULL))) x) AS mezzi_senza_costo';
begin
  if position('Commessa generale: anche le fasi' in avanz) = 0 then
    if position(fasi_vecchio in avanz) = 0 or position(vuoto_vecchio in avanz) = 0 or position(fine_vecchio in avanz) = 0 then
      raise exception 'recompute_order_progress: non trovo i punti da cambiare';
    end if;
    execute replace(replace(replace(avanz, fasi_vecchio, fasi_nuovo), vuoto_vecchio, vuoto_nuovo), fine_vecchio, fine_nuovo);
  end if;

  if position('avanzamento_fasi' in riep) = 0 then
    if position(riep_vecchio in riep) = 0 then
      raise exception 'commessa_generale_riepilogo: non trovo l''avanzamento delle figlie';
    end if;
    execute replace(riep, riep_vecchio, riep_nuovo);
  end if;

  if position('q.importo IS NULL' in mezzi) = 0 then
    if position(mezzi_vecchio in mezzi) = 0 then
      raise exception 'v_ordine_costi_mezzi_stimati: non trovo i mezzi senza costo';
    end if;
    execute 'create or replace view public.v_ordine_costi_mezzi_stimati as '
            || rtrim(replace(mezzi, mezzi_vecchio, mezzi_nuovo), '; ' || chr(10));
  end if;
  -- CREATE OR REPLACE VIEW azzera security_invoker (10/11/2026): si rimette.
  execute 'alter view public.v_ordine_costi_mezzi_stimati set (security_invoker = true)';
end
$migrazione$;

-- Le generali che hanno fasi (proprie o delle figlie) si ricalcolano una volta.
select public.recompute_order_progress(g.order_id)
  from public.commesse_generali g
  join public.orders o on o.id = g.order_id and o.deleted_at is null
 where exists (select 1 from public.order_work_phases p
                where p.order_id = g.order_id
                   or p.order_id in (select f.id from public.orders f where f.commessa_generale_id = g.order_id and f.deleted_at is null));
