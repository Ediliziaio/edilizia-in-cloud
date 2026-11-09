-- Il rapportino coi soldi: per ogni persona ore, costo orario, costo, vendita,
-- ricavo e margine. Solo per chi vede i costi: il filtro sta qui dentro.
-- Rapportino approvato: il costo e' quello registrato allora, non la tariffa di oggi.
-- La vendita viene dalle tariffe del contratto, con l'eccezione per cantiere.
create or replace function public.rapportino_quadro_economico(p_rapportino_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
declare
  v_r public.campo_rapportini%rowtype;
  v_ord record;
  v_persone jsonb;
begin
  select * into v_r from public.campo_rapportini where id = p_rapportino_id;
  if not found then return null; end if;
  if public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(v_r.order_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_costs', v_r.company_id) then
    raise exception 'Non hai il permesso di vedere i costi' using errcode = '42501';
  end if;
  select o.order_type, o.valorizzazione into v_ord from public.orders o where o.id = v_r.order_id;

  with pres as (
    select case when p->>'employee_id' ~* '^[0-9a-f-]{36}$' then (p->>'employee_id')::uuid end as emp,
           nullif(btrim(p->>'nome'), '') as nome,
           (p->>'subappaltatore_id') is not null as ditta,
           case when p->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' then replace(p->>'ore', ',', '.')::numeric else 0 end as ore
      from jsonb_array_elements(public.campo_presenze_effettive(v_r)) p
  ), persone as (
    select emp, min(nome) as nome, bool_or(ditta) as ditta, sum(ore) as ore
      from pres group by emp, case when emp is null then nome end
  ), registrato as (
    select (s->>'employee_id')::uuid as emp, sum((s->>'costo')::numeric) as costo
      from jsonb_array_elements(case when v_r.costo_registrato_at is not null and jsonb_typeof(v_r.presenze_registrate) = 'array'
                                     then v_r.presenze_registrate else '[]'::jsonb end) s
     where s->>'employee_id' is not null
     group by 1
  ), vendita as (
    select c.employee_id as emp, min(t.unita_misura) as unita, sum(c.quantita) as quantita,
           max(coalesce(tc.prezzo_unitario, t.prezzo_unitario)) as prezzo,
           round(sum(c.quantita * coalesce(tc.prezzo_unitario, t.prezzo_unitario) * (1 + c.maggiorazione_pct / 100.0)), 2) as ricavo
      from public.appalto_righe_da_rapportino_calcola(p_rapportino_id) c
      join public.appalto_tariffe t on t.id = c.tariffa_id
      left join public.appalto_tariffe_commessa tc on tc.order_id = v_r.order_id and tc.tariffa_id = c.tariffa_id
     where c.motivo is null
     group by c.employee_id
  ), righe as (
    select p.emp, coalesce(nullif(btrim(concat_ws(' ', e.first_name, e.last_name)), ''), p.nome, 'Senza nome') as nome,
           p.ditta, p.ore,
           case when p.emp is not null then public.costo_orario_calcolato(p.emp) end as costo_orario,
           case when r.emp is not null then r.costo
                when p.emp is not null then round(p.ore * public.costo_orario_calcolato(p.emp), 2) end as costo,
           v.unita, v.quantita, v.prezzo, v.ricavo
      from persone p
      left join public.employees e on e.id = p.emp and e.company_id = v_r.company_id
      left join registrato r on r.emp = p.emp
      left join vendita v on v.emp is not distinct from p.emp and p.emp is not null
     where p.ore > 0
  )
  select coalesce(jsonb_agg(to_jsonb(righe) order by nome), '[]'::jsonb) into v_persone from righe;

  return jsonb_build_object(
    'persone', v_persone,
    'appalto', v_ord.order_type is not distinct from 'appaltatore_lavoro',
    'a_corpo', v_ord.valorizzazione is not distinct from 'a_corpo',
    'registrato', v_r.costo_registrato_at is not null
  );
end;
$$;
revoke all on function public.rapportino_quadro_economico(uuid) from public, anon;
grant execute on function public.rapportino_quadro_economico(uuid) to authenticated;
