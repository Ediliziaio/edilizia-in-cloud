-- L'operaio subappaltatore vede gli interventi mandati alla sua ditta (28/09/2026).
--
-- Fino a ieri campo_miei_interventi mostrava un intervento solo se assegnato
-- alla persona (assigned_to) o a una squadra INTERNA (campo_mie_squadre, che
-- filtra kind='interna' e chiede un profilo del Personale). Un subappaltatore
-- non ha profilo HR e la sua squadra è ESTERNA: così un intervento mandato alla
-- sua squadra non gli arrivava mai nell'app di cantiere.
--
-- Aggiungiamo il ramo delle squadre esterne, con lo stesso criterio già usato
-- da campo_mia_giornata per riconoscere la ditta: l'utente è il leader della
-- squadra (external_teams.leader_user_id) o il titolare del subappaltatore
-- collegato (subappaltatori.user_id). Nessun cambio per gli operai interni.

-- ── Aiuto: le squadre ESTERNE di cui sono la ditta (o il leader) ─────────────
create or replace function public.campo_mie_squadre_esterne()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
    from public.external_teams t
    left join public.subappaltatori s
           on s.id = t.subappaltatore_id and coalesce(s.is_active, true)
   where t.is_active
     and t.kind is distinct from 'interna'
     and auth.uid() in (t.leader_user_id, s.user_id)
$$;
comment on function public.campo_mie_squadre_esterne() is
  'Le squadre esterne (subappalto) che fanno capo all''utente: leader_user_id o subappaltatori.user_id. Usata da campo_miei_interventi per far vedere al subappaltatore gli interventi mandati alla sua ditta.';
revoke all on function public.campo_mie_squadre_esterne() from public, anon, authenticated;

-- ── campo_miei_interventi: aggiungo il ramo della squadra esterna ────────────
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
         or (t.squadra_id is not null and t.squadra_id in (select public.campo_mie_squadre_esterne()))
       )
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.campo_miei_interventi(date, integer) from public, anon;
grant execute on function public.campo_miei_interventi(date, integer) to authenticated;
