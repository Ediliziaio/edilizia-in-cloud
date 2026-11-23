-- 23/11/2026 — Le fatture ricevute con qualcosa che non torna, in un elenco solo.
-- Gli avvisi c'erano, ma dentro la singola fattura: per trovarli bisognava aprirle tutte. Qui:
--   · bolle citate dalla fattura e non ancora caricate (o non collegate);
--   · bolle tutte caricate, ma il costo diviso fra le commesse in modo diverso da come dicono le bolle.
-- Sola lettura, solo per chi vede i costi. Il piano delle bolle (private.fattura_ddt_piano) si calcola
-- solo per le fatture con tutte le bolle collegate: è la parte costosa, e sono poche.
create or replace function public.fatture_da_sistemare(p_company uuid, p_limite integer default 300)
returns table(fattura_id uuid, numero text, data_fattura date, fornitore text, totale numeric,
              bolle_citate integer, bolle_caricate integer, divisione_da_rifare boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not coalesce(public.user_can_access_company(p_company), false)
     or not coalesce(public.puo_vedere_costi(p_company) or public.e_super_admin_dentro(p_company), false) then
    raise exception 'Non puoi vedere le fatture di questa azienda' using errcode = '42501';
  end if;
  return query
  with conti as (
    select l.fattura_ricevuta_id fid, count(*)::integer citate, count(l.ddt_ricezione_id)::integer caricate
      from public.fattura_ddt l where l.company_id = p_company group by 1
  ), candidate as (
    select f.id, f.numero_fattura, f.data_fattura, coalesce(s.name, f.cedente_ragione_sociale) forn, f.totale_documento,
           k.citate, k.caricate, f.company_cost_id, f.purchase_order_id
      from public.fatture_ricevute f
      join conti k on k.fid = f.id
      left join public.suppliers s on s.id = f.fornitore_id
     where f.company_id = p_company
       and coalesce(f.stato, '') not in ('rifiutata', 'scartata', 'annullata', 'eliminata')
       and not public.e_nota_credito_ricevuta(f.tipo_documento)
  ), valutate as (
    select c.*,
      case when c.citate = c.caricate and c.company_cost_id is not null and c.purchase_order_id is null then (
        select coalesce((p->>'completo')::boolean, false)
               and (p->'costo') is distinct from jsonb_build_object('order_id', cc.order_id, 'allocations', coalesce(cc.allocations, '[]'::jsonb),
                                                                'quota_magazzino', nullif(cc.quota_magazzino, 0), 'quota_magazzino_righe', cc.quota_magazzino_righe)
          from public.company_costs cc, lateral private.fattura_ddt_piano(c.id) p
         where cc.id = c.company_cost_id and cc.purchase_order_id is null and cc.order_external_team_id is null)
      else false end as da_rifare
      from candidate c
  )
  select v.id, v.numero_fattura, v.data_fattura, v.forn, v.totale_documento, v.citate, v.caricate, coalesce(v.da_rifare, false)
    from valutate v
   where v.caricate < v.citate or coalesce(v.da_rifare, false)
   order by v.data_fattura desc nulls last, v.numero_fattura
   limit greatest(1, least(coalesce(p_limite, 300), 1000));
end $$;
revoke all on function public.fatture_da_sistemare(uuid, integer) from public, anon;
grant execute on function public.fatture_da_sistemare(uuid, integer) to authenticated, service_role;
