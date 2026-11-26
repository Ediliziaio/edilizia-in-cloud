-- Interventi dal telefono → rapportini d'intervento (26/11/2026). Il rapportino d'intervento esisteva già
-- (rapportini_intervento: scheda assistenza «Rapportini», storico dell'impianto, «Chiusura intervento» dell'ufficio,
-- area tecnico): «Intervento finito» ora scrive lì, con numero, ore, foto e firma, invece di tenere un registro a
-- parte. campo_interventi_esiti resta solo per l'ora di arrivo e di fine della visita.
-- Il rapporto scritto dall'ufficio passa dalla «Chiusura intervento» che c'è già: tolta la funzione doppia.

drop function if exists public.ufficio_intervento_rapporto_salva(uuid, uuid, timestamptz, numeric, text, text);
drop function if exists public.campo_intervento_chiudi(uuid, text, numeric, text, text[], text, text, text);

create or replace function public.campo_intervento_chiudi(
  p_ticket uuid, p_note text, p_ore numeric, p_materiali text, p_foto text[],
  p_firma_path text, p_firma_nome text, p_senza_firma_motivo text, p_firma_png text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.tickets; v_firma text; v_stato text; v_prefisso text; v_foto text; v_nome text; v_riga uuid; v_numero int;
        v_descr text;
begin
  if auth.uid() is null or not private.campo_intervento_mio(p_ticket) then
    raise exception using errcode = '42501', message = 'Questo intervento non è assegnato a te.';
  end if;
  select * into t from public.tickets where id = p_ticket for update;
  if t.status in ('chiuso', 'annullato', 'preventivo_rifiutato') then
    raise exception using errcode = '22023', message = 'Questo intervento è già chiuso.';
  end if;
  select coalesce(a.intervento_firma, 'facoltativa'), coalesce(a.intervento_stato_fine, 'risolto')
    into v_firma, v_stato from public.campo_avvisi_azienda a where a.company_id = t.company_id;
  v_firma := coalesce(v_firma, 'facoltativa'); v_stato := coalesce(v_stato, 'risolto');
  if v_firma = 'obbligatoria' and nullif(btrim(coalesce(p_firma_path, '')), '') is null then
    raise exception using errcode = '22023', message = 'La tua azienda chiede la firma del cliente per chiudere.';
  end if;
  if p_ore is not null and (p_ore < 0 or p_ore > 24) then raise exception using errcode = '22023', message = 'Ore non valide.'; end if;
  if p_firma_png is not null and (left(p_firma_png, 22) <> 'data:image/png;base64,' or length(p_firma_png) > 200000) then
    raise exception using errcode = '22023', message = 'Firma non valida.';
  end if;
  v_prefisso := auth.uid()::text || '/interventi/' || p_ticket::text || '/';
  foreach v_foto in array coalesce(p_foto, '{}') || coalesce(array[nullif(p_firma_path, '')], '{}') loop
    if v_foto is not null and left(v_foto, length(v_prefisso)) <> v_prefisso then
      raise exception using errcode = '22023', message = 'File non valido.';
    end if;
  end loop;
  if cardinality(coalesce(p_foto, '{}')) > 20 then raise exception using errcode = '22023', message = 'Al massimo 20 foto.'; end if;

  -- La visita (arrivo e fine).
  select x.id into v_riga from public.campo_interventi_esiti x
   where x.ticket_id = p_ticket and x.user_id = auth.uid() and x.finito_at is null order by x.created_at desc limit 1;
  if v_riga is null then
    insert into public.campo_interventi_esiti (company_id, ticket_id, user_id, iniziato_at) values (t.company_id, p_ticket, auth.uid(), now())
    returning id into v_riga;
  end if;
  update public.campo_interventi_esiti set finito_at = now(),
    note = nullif(left(btrim(coalesce(p_note, '')), 4000), ''), ore = p_ore,
    materiali = nullif(left(btrim(coalesce(p_materiali, '')), 2000), ''), foto = coalesce(p_foto, '{}'),
    firma_path = nullif(p_firma_path, ''), firma_nome = nullif(left(btrim(coalesce(p_firma_nome, '')), 200), ''),
    senza_firma_motivo = nullif(left(btrim(coalesce(p_senza_firma_motivo, '')), 500), '')
  where id = v_riga;

  -- Il rapportino d'intervento, quello che vede l'ufficio (numero progressivo per richiesta).
  select coalesce(max(r.numero), 0) + 1 into v_numero from public.rapportini_intervento r where r.ticket_id = p_ticket;
  v_descr := coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Intervento eseguito')
    || case when nullif(btrim(coalesce(p_materiali, '')), '') is not null then E'\nMateriale usato: ' || btrim(p_materiali) else '' end;
  insert into public.rapportini_intervento (company_id, ticket_id, tecnico_id, numero, data_intervento, descrizione,
    ore_lavoro, ore_lavoro_effettive, materiali_usati, foto_urls, firma_cliente, firmato_da, firmato_il, stato, impianto_id, note)
  values (t.company_id, p_ticket, auth.uid(), v_numero, now(), left(v_descr, 6000), p_ore, p_ore, '[]'::jsonb,
    coalesce((select array_agg('campo-foto/' || f) from unnest(coalesce(p_foto, '{}')) f), '{}'),
    p_firma_png, case when p_firma_png is not null then nullif(left(btrim(coalesce(p_firma_nome, '')), 200), '') end,
    case when p_firma_png is not null then now() end,
    case when p_firma_png is not null then 'firmato' else 'bozza' end, t.impianto_id,
    case when p_firma_png is null and nullif(btrim(coalesce(p_senza_firma_motivo, '')), '') is not null then 'Senza firma: ' || btrim(p_senza_firma_motivo) end);

  update public.tickets set
    status = v_stato::ticket_status,
    data_intervento_effettiva = coalesce(data_intervento_effettiva, now()),
    ore_effettive = coalesce(ore_effettive, 0) + coalesce(p_ore, 0),
    note_tecnico = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note_tecnico)
  where id = p_ticket;

  select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') into v_nome from public.profiles p where p.id = auth.uid();
  if t.created_by is not null and t.created_by <> auth.uid() then
    perform public.campo_notifica(t.company_id, t.created_by, 'intervento_finito', 'Intervento finito',
      concat_ws(' · ', coalesce(nullif(btrim(t.titolo), ''), t.subject), v_nome), 'ticket', p_ticket,
      '/azienda/assistenza/' || p_ticket::text);
  end if;
  return jsonb_build_object('ok', true, 'stato', v_stato, 'numero', v_numero);
end $$;
revoke all on function public.campo_intervento_chiudi(uuid, text, numeric, text, text[], text, text, text, text) from public, anon;
grant execute on function public.campo_intervento_chiudi(uuid, text, numeric, text, text[], text, text, text, text) to authenticated;

-- I rapportini dell'intervento per il tecnico: tutti quelli della richiesta (suoi, dei colleghi, dell'ufficio).
create or replace function public.campo_intervento_rapporti(p_ticket uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not private.campo_intervento_mio(p_ticket) then
    raise exception using errcode = '42501', message = 'Questo intervento non è assegnato a te.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'numero', r.numero, 'chi', nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
      'mio', r.tecnico_id = auth.uid(), 'quando', r.data_intervento, 'descrizione', r.descrizione,
      'ore', coalesce(r.ore_lavoro_effettive, r.ore_lavoro),
      'foto', coalesce(cardinality(r.foto_urls), 0) + coalesce(cardinality(r.foto_chiusura), 0),
      'firmato', r.firma_cliente is not null or r.firma_tecnico_url is not null, 'firmato_da', r.firmato_da
    ) order by r.data_intervento desc nulls last, r.numero desc)
    from public.rapportini_intervento r left join public.profiles p on p.id = r.tecnico_id
    where r.ticket_id = p_ticket
  ), '[]'::jsonb);
end $$;
revoke all on function public.campo_intervento_rapporti(uuid) from public, anon;
grant execute on function public.campo_intervento_rapporti(uuid) to authenticated;
