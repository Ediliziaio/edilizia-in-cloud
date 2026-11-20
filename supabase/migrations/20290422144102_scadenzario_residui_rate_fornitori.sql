-- Rate fornitori e CSV leggono il residuo al netto dei movimenti in prima nota.
-- La ripartizione segue lo stesso ordine di scadenzario_fonti.
create or replace function public.scadenzario_rate_fornitori(p_company_id uuid)
returns table (
  id uuid, numero integer, scadenza date, importo numeric, metodo text, stato text,
  pagata_il date, updated_at timestamptz, residuo numeric, fattura_id uuid, numero_fattura text, fornitore text
)
language sql stable security invoker
set search_path = ''
as $$
  with permesso as (
    select public.ai_is_service_role()
        or public.user_can_read_accountant_company(p_company_id)
        or public.has_role(auth.uid(), 'super_admin'::public.app_role)
        or (p_company_id = public.get_my_company_id() and (
          public.e_amministratore_di(p_company_id)
          or public.has_permission(auth.uid(), 'can_view_prima_nota')
        )) as legge_prima_nota
  ), rate as (
    select r.id, r.numero, nullif(r.scadenza, date '9999-12-31') as scadenza, r.importo, r.metodo, r.stato,
      r.pagata_il, r.updated_at, r.fattura_ricevuta_id, r.company_cost_id, c.supplier_id, c.is_paid,
      coalesce(sum(r.importo) filter (where r.stato = 'pagata') over (partition by r.company_cost_id), 0) as chiuse,
      coalesce(sum(r.importo) filter (where r.stato <> 'pagata') over (
        partition by r.company_cost_id order by nullif(r.scadenza, date '9999-12-31') nulls last, r.numero, r.id
        rows between unbounded preceding and 1 preceding
      ), 0) as precedenti
    from public.rate_fornitori r
    join public.company_costs c on c.id = r.company_cost_id and c.company_id = r.company_id
    where r.company_id = p_company_id and r.stato <> 'stornata' and c.annullato_il is null
  ), pagamenti as (
    select p.cost_id, sum(case when p.direction = 'uscita' then p.amount else -p.amount end) as versato
    from public.prima_nota_entries p cross join permesso
    where permesso.legge_prima_nota and p.company_id = p_company_id and p.cost_id in (select r.company_cost_id from rate r)
    group by p.cost_id
  )
  select r.id, r.numero, r.scadenza, r.importo, r.metodo,
    case when r.is_paid and r.stato not in ('da_bloccare', 'richiamata') then 'pagata' else r.stato end,
    r.pagata_il, r.updated_at,
    case when r.is_paid or r.stato = 'pagata' then 0
         when r.importo is null or not coalesce(permesso.legge_prima_nota, false) then null
         else round(greatest(0, r.importo - greatest(0, coalesce(p.versato, 0) - r.chiuse - r.precedenti)), 2)
    end,
    f.id, f.numero_fattura, coalesce(nullif(f.cedente_ragione_sociale, ''), s.name)
  from rate r cross join permesso
  left join pagamenti p on p.cost_id = r.company_cost_id
  left join public.fatture_ricevute f on f.id = r.fattura_ricevuta_id and f.company_id = p_company_id
  left join public.suppliers s on s.id = r.supplier_id and s.company_id = p_company_id;
$$;

revoke all on function public.scadenzario_rate_fornitori(uuid) from public, anon;
grant execute on function public.scadenzario_rate_fornitori(uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
