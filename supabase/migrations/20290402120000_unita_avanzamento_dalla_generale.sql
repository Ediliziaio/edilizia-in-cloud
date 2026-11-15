-- 20290402120000_unita_avanzamento_dalla_generale.sql
--
-- Simulazione «Residenza Le Querce» (15/11/2026): i lavori stavano sulla generale (fasi al 100%) e
-- le quattro unità, senza fasi proprie, risultavano al 0% con «Eseguito € 0» nel Dossier e nella
-- pagina. Un'unità (o un lotto) senza fasi e senza un avanzamento suo fa parte del cantiere della
-- generale: prende l'avanzamento delle fasi della generale (non quello complessivo, che comprende
-- le figlie), e così l'eseguito (importo × avanzamento).
-- Le commesse con fasi proprie, quelle avanzate a mano e quelle a misura restano come sono.
-- Il riepilogo dice quali lo prendono dalla generale («avanzamento_dalla_generale»).
--
-- Idempotente.

do $migrazione$
declare
  definizione text := pg_get_functiondef('public.commessa_generale_riepilogo(uuid)'::regprocedure);
  avanzamento_vecchio constant text := '           coalesce(o.percentuale_avanzamento, 0) as avanzamento,';
  avanzamento_nuovo constant text := '           -- Senza fasi né avanzamento suo: quello della generale (20290402120000).
           case when coalesce(o.percentuale_avanzamento, 0) = 0
                     and not exists (select 1 from public.order_work_phases ph where ph.order_id = o.id)
                then coalesce((select round(avg(coalesce(ph.percentuale, 0))) from public.order_work_phases ph where ph.order_id = p_generale_id), (select gg.percentuale_avanzamento from public.orders gg where gg.id = p_generale_id), 0)
                else coalesce(o.percentuale_avanzamento, 0) end as avanzamento,
           coalesce(o.percentuale_avanzamento, 0) = 0
             and not exists (select 1 from public.order_work_phases ph where ph.order_id = o.id)
             and coalesce((select round(avg(coalesce(ph.percentuale, 0))) from public.order_work_phases ph where ph.order_id = p_generale_id), (select gg.percentuale_avanzamento from public.orders gg where gg.id = p_generale_id), 0) > 0 as dalla_generale,';
  uscita_vecchia constant text := '''avanzamento_fasi'', f.avanzamento, ''a_misura'', f.a_misura,';
  uscita_nuova constant text := '''avanzamento_fasi'', f.avanzamento, ''a_misura'', f.a_misura,
           ''avanzamento_dalla_generale'', f.dalla_generale and not f.a_misura,';
begin
  if position('avanzamento_dalla_generale' in definizione) > 0 then
    return;
  end if;
  if position(avanzamento_vecchio in definizione) = 0 or position(uscita_vecchia in definizione) = 0 then
    raise exception 'commessa_generale_riepilogo: non trovo l''avanzamento delle figlie';
  end if;
  execute replace(replace(definizione, avanzamento_vecchio, avanzamento_nuovo), uscita_vecchia, uscita_nuova);
end
$migrazione$;
