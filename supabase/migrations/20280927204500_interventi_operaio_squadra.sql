-- Interventi di Assistenza e Manutenzione: chi ci va e quando (26/09/2026,
-- richiesta del founder). Dalla scheda dell'intervento si può mandare un
-- operaio o una squadra, con la data: l'intervento compare nell'app di chi ci
-- va, con indirizzo, note e cosa fare, e nel suo calendario.
--
--   tickets.squadra_id           → la squadra mandata sull'intervento
--   campo_miei_interventi(dal, g) → gli interventi assegnati a me o alla mia
--                                   squadra, con data, indirizzo, note, cliente

alter table public.tickets
  add column if not exists squadra_id uuid references public.external_teams(id) on delete set null;
comment on column public.tickets.squadra_id is
  'Squadra mandata sull''intervento (external_teams interna). Chi ne fa parte lo vede nell''app; assigned_to resta per la persona singola.';
create index if not exists idx_tickets_squadra on public.tickets (squadra_id) where squadra_id is not null;

-- Gli interventi che devo fare io (assegnato a me o alla mia squadra), con la
-- data nel periodo chiesto. Solo i miei: la funzione gira come il servizio ma
-- restituisce esclusivamente le righe dell'utente.
create or replace function public.campo_miei_interventi(p_dal date default null, p_giorni integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_dal date := coalesce(p_dal, (now() at time zone 'Europe/Rome')::date);
  v_al date := coalesce(p_dal, (now() at time zone 'Europe/Rome')::date) + least(greatest(coalesce(p_giorni, 30), 1), 120);
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id,
             'titolo', coalesce(nullif(trim(t.titolo), ''), nullif(trim(t.subject), ''), 'Intervento'),
             'tipo', t.tipo,
             'stato', t.status,
             'data', t.data_intervento_prevista,
             'indirizzo', coalesce(nullif(trim(t.indirizzo_intervento), ''),
                                   nullif(trim(concat_ws(', ', c.address, c.city)), '')),
             'lat', t.lat_intervento,
             'lng', t.lng_intervento,
             'note', t.note_tecnico,
             'cliente', nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''),
             'telefono_cliente', c.phone,
             'order_id', t.order_id,
             'da_squadra', t.squadra_id is not null and (t.assigned_to is distinct from v_uid),
             'squadra', st.name)
           order by t.data_intervento_prevista nulls last, t.created_at)
      from public.tickets t
      left join public.profiles c on c.id = t.customer_id
      left join public.external_teams st on st.id = t.squadra_id
     where t.data_intervento_prevista is not null
       and (t.data_intervento_prevista at time zone 'Europe/Rome')::date between v_dal and v_al
       and coalesce(t.status::text, '') not in ('risolto', 'chiuso', 'annullato', 'preventivo_rifiutato')
       and (
         t.assigned_to = v_uid
         or (t.squadra_id is not null and t.squadra_id in (select public.campo_mie_squadre()))
       )
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.campo_miei_interventi(date, integer) from public, anon;
grant execute on function public.campo_miei_interventi(date, integer) to authenticated;
