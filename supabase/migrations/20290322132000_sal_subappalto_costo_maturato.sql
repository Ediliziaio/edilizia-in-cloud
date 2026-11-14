-- 20290322132000_sal_subappalto_costo_maturato.sql
--
-- Un SAL del subappaltatore approvato («verificato» o «pagato») è lavoro eseguito e dovuto: ma
-- nel costo della commessa entrava solo quando arrivava la fattura del subappaltatore e diventava
-- un costo. Fino ad allora il margine era più alto del vero. Bonarrigo, 27-0002: SAL da
-- 38.000 € approvato, costo della commessa 0 €. Demo Azienda, O-0101: SAL 15.000 € fuori.
--
-- Regola, per commessa: il costo dei SAL approvati (lordo + quota oneri) conta per la parte non
-- ancora coperta da
--   - fatture del subappaltatore collegate a un contratto della commessa (già costo), e
--   - costi delle ditte sulla commessa (order_external_teams, netti d'IVA): è così che diverse
--     aziende registrano il subappalto (Demo Azienda 2: 3.085.318 € di ditte contro 3.086.388 €
--     di SAL), e contarli due volte gonfierebbe il costo.
-- Quando arriva la fattura, la parte «maturata» scende di altrettanto: il totale non raddoppia.
--
-- 1. private.sal_sub_da_fatturare(commessa): la parte da aggiungere.
-- 2. private.office_order_economics_base: la aggiunge al costo diretto (e quindi a consuntivo e
--    margine di tutte le schermate che leggono l'economia delle commesse).
-- 3. generale_piano_righe_reali: nel piano della commessa generale diventa una riga propria
--    («SAL dei subappaltatori non ancora fatturati», gruppo subappalti), non una rettifica.

create or replace function private.sal_sub_da_fatturare(p_order uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with sal as (
    select coalesce(sum(s.importo_lordo + coalesce(s.oneri_quota, 0)), 0) as maturato
      from public.contratti_subappalto c
      join public.sal_subappaltatori s on s.contratto_id = c.id and s.company_id = c.company_id
     where c.order_id = p_order
       and s.stato in ('verificato', 'pagato')
  )
  select case when sal.maturato <= 0 then 0 else greatest(0, round(
           sal.maturato
           - coalesce((select sum(cc.amount)
                         from public.contratti_subappalto c
                         join public.fatture_ricevute f on f.contratto_subappalto_id = c.id and f.company_id = c.company_id
                         join public.company_costs cc on cc.id = f.company_cost_id
                        where c.order_id = p_order
                          and coalesce(f.stato, '') not in ('annullata', 'scartata', 'rifiutata')), 0)
           - coalesce((select sum(ot.total_cost / (1 + coalesce(ot.vat_rate, 0) / 100))
                         from public.order_external_teams ot
                        where ot.order_id = p_order), 0), 2)) end
    from sal;
$$;

comment on function private.sal_sub_da_fatturare(uuid) is
  'SAL dei subappaltatori approvati e non ancora coperti da fatture collegate o costi delle ditte: la parte di costo maturato da aggiungere alla commessa. 20290322132000.';

revoke all on function private.sal_sub_da_fatturare(uuid) from public, anon;
grant execute on function private.sal_sub_da_fatturare(uuid) to authenticated, service_role;

set local lock_timeout = '3s';

do $migrazione$
declare
  vista text := pg_get_viewdef('private.office_order_economics_base'::regclass);
  vecchio constant text := '+ COALESCE(rip.costo_ripartito, (0)::numeric))) AS costo_diretto';
  nuovo constant text := '+ COALESCE(rip.costo_ripartito, (0)::numeric)) + COALESCE(private.sal_sub_da_fatturare(o.id), (0)::numeric)) AS costo_diretto';
  piano text := pg_get_functiondef('public.generale_piano_righe_reali(uuid,boolean,boolean)'::regprocedure);
  piano_ancora constant text := '           ''Rimborsi chilometrici approvati'', m.costo_rimborsi_km
      from m
';
  piano_nuovo constant text := '           ''Rimborsi chilometrici approvati'', m.costo_rimborsi_km
      from m
    union all
    -- SAL dei subappaltatori approvati e non ancora fatturati (20290322132000): sono già nel
    -- consuntivo della commessa; qui hanno la loro riga, invece di finire tra le rettifiche.
    select ''sal_subappalto'', null::uuid, m.id, null::date, ''subappalti'', null::text,
           ''SAL dei subappaltatori non ancora fatturati'', private.sal_sub_da_fatturare(m.id)
      from m
     where private.sal_sub_da_fatturare(m.id) > 0
';
begin
  if position('sal_sub_da_fatturare' in vista) = 0 then
    if position(vecchio in vista) = 0 then
      raise exception 'office_order_economics_base: non trovo il costo diretto da cambiare';
    end if;
    execute 'create or replace view private.office_order_economics_base as '
            || rtrim(replace(vista, vecchio, nuovo), '; ' || chr(10));
  end if;
  if position('sal_subappalto' in piano) = 0 then
    if position(piano_ancora in piano) = 0 then
      raise exception 'generale_piano_righe_reali: non trovo i rimborsi chilometrici';
    end if;
    execute replace(piano, piano_ancora, piano_nuovo);
  end if;
end
$migrazione$;
