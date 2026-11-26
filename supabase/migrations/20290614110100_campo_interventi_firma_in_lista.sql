-- La lista degli interventi dice anche se l'azienda vuole la firma del cliente: il telefono lo mostra prima.
create or replace function public.campo_miei_interventi(p_dal date, p_al date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Accesso richiesto.'; end if;
  if p_al < p_dal or p_al - p_dal > 62 then raise exception using errcode = '22023', message = 'Intervallo non valido.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'titolo', coalesce(nullif(btrim(t.titolo), ''), t.subject), 'descrizione', t.descrizione,
      'tipo', t.tipo, 'tipo_intervento', ti.nome, 'durata_stimata_h', coalesce(t.durata_ore, ti.durata_stimata_h),
      'stato', t.status, 'priorita', coalesce(t.priorita, t.priority::text), 'quando', t.data_intervento_prevista,
      'indirizzo', t.indirizzo_intervento, 'lat', t.lat_intervento, 'lng', t.lng_intervento,
      'order_id', t.order_id, 'order_code', o.order_code,
      'merce_richiesta', t.merce_richiesta, 'merce_stato', t.merce_stato,
      'cliente', case when c.id is null then null else jsonb_build_object(
        'nome', nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''), 'telefono', c.phone) end,
      'impianto', case when i.id is null then null else jsonb_build_object(
        'tipo', i.tipo_impianto, 'marca', i.marca, 'modello', i.modello, 'matricola', i.matricola,
        'installato', i.data_installazione, 'note', i.note_tecniche) end,
      'iniziato_at', e.iniziato_at, 'finito_at', e.finito_at,
      'firma_obbligatoria', coalesce(av.intervento_firma, 'facoltativa') = 'obbligatoria'
    ) order by t.data_intervento_prevista)
    from public.tickets t
    left join public.profiles c on c.id = t.customer_id
    left join public.impianti_cliente i on i.id = t.impianto_id
    left join public.tipi_intervento ti on ti.id = t.tipo_intervento_id
    left join public.orders o on o.id = t.order_id and o.deleted_at is null
    left join public.campo_interventi_esiti e on e.ticket_id = t.id and e.user_id = auth.uid()
    left join public.campo_avvisi_azienda av on av.company_id = t.company_id
    where (t.assigned_to = auth.uid() or t.squadra_id in (select public.campo_mie_squadre()))
      and t.status <> 'annullato'
      and t.data_intervento_prevista is not null
      and (t.data_intervento_prevista at time zone 'Europe/Rome')::date between p_dal and p_al
  ), '[]'::jsonb);
end $$;
revoke all on function public.campo_miei_interventi(date, date) from public, anon;
grant execute on function public.campo_miei_interventi(date, date) to authenticated;
