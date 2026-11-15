-- 20290402110000_generale_chiusura_a_finire_zero.sql
--
-- Operazione chiusa = «a finire» zero (richiesta del 15/11/2026, dopo la simulazione «Residenza
-- Le Querce»: a operazione finita il piano continuava a prevedere 222.903 € di costi ancora da
-- sostenere, e il Dossier dava un margine di 608.200 € contro 831.103 € registrati).
--
-- 1. commessa_generale_chiusura(generale, chiusa): chiude (orders.status = 'completato') o riapre
--    ('in_corso') l'operazione. Serve il permesso di modificare le commesse.
-- 2. commessa_generale_riepilogo: la generale dice il suo stato.
-- 3. generale_piano_numeri (fotografie di fine mese): da chiusa, la stima è il registrato.
--
-- Idempotente.

create or replace function public.commessa_generale_chiusura(p_generale_id uuid, p_chiusa boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
begin
  if auth.uid() is null or v_azienda is null or public.utente_bloccato()
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di modificare questa commessa.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.commesse_generali g join public.orders o on o.id = g.order_id
                  where g.order_id = p_generale_id and o.deleted_at is null) then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;
  update public.orders
     set status = case when p_chiusa then 'completato' else 'in_corso' end,
         updated_at = now()
   where id = p_generale_id
     and status is distinct from case when p_chiusa then 'completato' else 'in_corso' end;
end;
$$;

comment on function public.commessa_generale_chiusura(uuid, boolean) is
  'Chiude o riapre una commessa generale: da chiusa il piano non prevede più nulla «a finire». 20290402110000.';

revoke all on function public.commessa_generale_chiusura(uuid, boolean) from public, anon;
grant execute on function public.commessa_generale_chiusura(uuid, boolean) to authenticated, service_role;

do $migrazione$
declare
  definizione text := pg_get_functiondef('public.commessa_generale_riepilogo(uuid)'::regprocedure);
  vecchio constant text := '''avanzamento'', o.percentuale_avanzamento,';
  nuovo constant text := '''avanzamento'', o.percentuale_avanzamento, ''stato'', o.status,';
begin
  if position('''stato'', o.status' in definizione) > 0 then
    return;
  end if;
  if position(vecchio in definizione) = 0 then
    raise exception 'commessa_generale_riepilogo: manca l''avanzamento della generale (20290401120000)';
  end if;
  execute replace(definizione, vecchio, nuovo);
end
$migrazione$;

do $migrazione$
declare
  definizione text := pg_get_functiondef('public.generale_piano_numeri(uuid,boolean,boolean)'::regprocedure);
  dichiarazioni_vecchie constant text := '  n record;
begin';
  dichiarazioni_nuove constant text := '  n record;
  -- Operazione chiusa: niente più «a finire», la stima è il registrato (20290402110000).
  v_chiusa boolean := exists (select 1 from public.orders o where o.id = p_generale_id
                               and o.status in (''completato'', ''completed'', ''chiuso''));
begin';
  stima_vecchia constant text := 'coalesce(rv.reale, 0) + coalesce(w.a_finire, greatest(w.importo - coalesce(rv.reale, 0), 0)) as stima';
  stima_nuova constant text := 'coalesce(rv.reale, 0) + case when v_chiusa then 0 else coalesce(w.a_finire, greatest(w.importo - coalesce(rv.reale, 0), 0)) end as stima';
begin
  if position('v_chiusa' in definizione) > 0 then
    return;
  end if;
  if position(dichiarazioni_vecchie in definizione) = 0 or position(stima_vecchia in definizione) = 0 then
    raise exception 'generale_piano_numeri: non trovo le parti da cambiare';
  end if;
  execute replace(replace(definizione, dichiarazioni_vecchie, dichiarazioni_nuove), stima_vecchia, stima_nuova);
end
$migrazione$;
