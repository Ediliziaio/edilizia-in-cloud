-- La coda Campo riusa gli stessi identificativi anche se si perde la risposta della RPC.
drop function public.campo_timbra_cambio_luogo(uuid, uuid, timestamptz, double precision, double precision, numeric, text);

create function public.campo_timbra_cambio_luogo(
  p_order_id uuid default null,
  p_sede_id uuid default null,
  p_quando timestamptz default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy numeric default null,
  p_note text default null,
  p_id_uscita uuid default null,
  p_id_entrata uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_profilo uuid;
  v_ultimo record;
  v_apertura record;
  v_t timestamptz;
  v_t_uscita timestamptz;
  v_hr_uscita uuid;
  v_hr_entrata uuid;
  v_esito text;
  v_dist numeric;
  v_rif_tipo text;
  v_rif_id uuid;
  v_esito_uscita text;
  v_sede_apertura uuid;
  v_ordine_codice text;
begin
  if v_uid is null then
    raise exception using errcode = 'P0001', message = 'Sessione scaduta: accedi di nuovo.';
  end if;
  select company_id into v_company from public.profiles where id = v_uid;
  if v_company is null then
    raise exception using errcode = 'P0001', message = 'Il tuo profilo non è collegato a un''azienda: avvisa l''ufficio.';
  end if;
  if (p_order_id is null) = (p_sede_id is null) then
    raise exception using errcode = 'P0001', message = 'Scegli dove sei: un cantiere oppure la sede.';
  end if;

  -- Una persona alla volta: due tocchi ravvicinati non si accavallano
  perform pg_advisory_xact_lock(hashtextextended('campo_cambio_luogo:' || v_uid::text, 0));

  if (p_id_uscita is null) <> (p_id_entrata is null) or
     (p_id_uscita is not null and p_id_uscita = p_id_entrata) then
    raise exception 'Identificativi del cambio luogo non validi' using errcode = '22023';
  end if;

  if p_id_entrata is not null then
    select e.timestamp_evento, e.posizione_esito into v_t, v_esito
      from public.campo_timbrature e
      join public.campo_timbrature u
        on u.id = p_id_uscita and u.user_id = e.user_id and u.company_id = e.company_id
       and u.tipo = 'uscita' and u.timestamp_evento = e.timestamp_evento - interval '1 millisecond'
     where e.id = p_id_entrata and e.user_id = v_uid and e.company_id = v_company
       and e.tipo = 'entrata'
       and e.order_id is not distinct from p_order_id
       and e.sede_id is not distinct from p_sede_id;
    if found then
      return jsonb_build_object('ok', true, 'quando', v_t, 'posizione', v_esito);
    end if;
  end if;

  if p_order_id is not null then
    select order_code into v_ordine_codice from public.orders
     where id = p_order_id and company_id = v_company and deleted_at is null;
    if not found then
      raise exception using errcode = 'P0001', message = 'Questo cantiere non è disponibile.';
    end if;
  elsif not exists (select 1 from public.hr_sedi s
                     where s.id = p_sede_id and s.company_id = v_company and s.attiva is not false) then
    raise exception using errcode = 'P0001', message = 'Questa sede non è disponibile.';
  end if;

  -- Dove sei adesso: l'ultimo evento delle ultime 24 ore
  select * into v_ultimo
    from public.campo_timbrature
   where user_id = v_uid and company_id = v_company
     and timestamp_evento > now() - interval '24 hours' and timestamp_evento <= now() + interval '5 minutes'
   order by timestamp_evento desc, created_at desc
   limit 1;
  if not found or v_ultimo.tipo = 'uscita' then
    raise exception using errcode = 'P0001', message = 'Non risulti in servizio: inizia prima la giornata.';
  end if;
  if v_ultimo.tipo = 'pausa_inizio' then
    raise exception using errcode = 'P0001', message = 'Sei in pausa: termina prima la pausa.';
  end if;

  -- Il luogo del tratto aperto è quello dell'ultima entrata
  select * into v_apertura
    from public.campo_timbrature
   where user_id = v_uid and company_id = v_company and tipo = 'entrata'
     and timestamp_evento <= v_ultimo.timestamp_evento
   order by timestamp_evento desc, created_at desc
   limit 1;
  if found and ((p_order_id is not null and v_apertura.order_id is not distinct from p_order_id)
                or (p_sede_id is not null and v_apertura.order_id is null and v_apertura.in_sede
                    and v_apertura.sede_id is not distinct from p_sede_id)) then
    raise exception using errcode = 'P0001', message = 'Sei già qui: tocca un altro posto per cambiare.';
  end if;
  v_sede_apertura := case when found and v_apertura.in_sede then v_apertura.sede_id else null end;

  -- L'orario lo dà il telefono (come per ogni timbratura), purché sia credibile
  v_t := coalesce(p_quando, now());
  if abs(extract(epoch from (v_t - now()))) > 300 then
    v_t := now();
  end if;
  v_t := greatest(v_t, v_ultimo.timestamp_evento + interval '2 milliseconds');
  v_t_uscita := v_t - interval '1 millisecond';

  v_profilo := public.hr_profilo_da_user(v_uid, v_company);

  if v_profilo is not null then
    insert into public.hr_timbrature (company_id, profilo_id, tipo, "timestamp", fonte, note, order_id, sede_id)
    values (v_company, v_profilo, 'uscita', v_t_uscita, 'app', 'Cambio luogo',
            v_apertura.order_id, v_sede_apertura)
    returning id, posizione_esito into v_hr_uscita, v_esito_uscita;

    insert into public.hr_timbrature (company_id, profilo_id, tipo, "timestamp", lat, lng, fonte, note, order_id, sede_id)
    values (v_company, v_profilo, 'entrata', v_t, p_lat, p_lng, 'app',
            coalesce(p_note, case when p_order_id is not null then 'Cantiere: ' || coalesce(v_ordine_codice, p_order_id::text) end),
            p_order_id, p_sede_id)
    returning id, posizione_esito, distanza_mt, riferimento_tipo, riferimento_id
      into v_hr_entrata, v_esito, v_dist, v_rif_tipo, v_rif_id;
  end if;

  insert into public.campo_timbrature (id, company_id, user_id, order_id, tipo, timestamp_evento, fonte, note,
                                       hr_timbratura_id, sede_id, in_sede, posizione_esito)
  values (coalesce(p_id_uscita, gen_random_uuid()), v_company, v_uid, v_apertura.order_id, 'uscita', v_t_uscita, 'app', 'Cambio luogo',
          v_hr_uscita, v_sede_apertura, coalesce(v_apertura.in_sede, false), v_esito_uscita);

  insert into public.campo_timbrature (id, company_id, user_id, order_id, tipo, timestamp_evento, gps_lat, gps_lng, gps_accuracy,
                                       fonte, note, hr_timbratura_id, sede_id, in_sede,
                                       riferimento_tipo, riferimento_id, posizione_esito, distanza_mt)
  values (coalesce(p_id_entrata, gen_random_uuid()), v_company, v_uid, p_order_id, 'entrata', v_t, p_lat, p_lng, p_accuracy, 'app',
          coalesce(p_note, case when p_order_id is not null then 'Cantiere: ' || coalesce(v_ordine_codice, p_order_id::text) end),
          v_hr_entrata, p_sede_id, p_sede_id is not null,
          v_rif_tipo, v_rif_id, v_esito, v_dist);

  return jsonb_build_object('ok', true, 'quando', v_t, 'posizione', v_esito);
end;
$$;
revoke all on function public.campo_timbra_cambio_luogo(uuid, uuid, timestamptz, double precision, double precision, numeric, text, uuid, uuid) from public, anon;
grant execute on function public.campo_timbra_cambio_luogo(uuid, uuid, timestamptz, double precision, double precision, numeric, text, uuid, uuid) to authenticated;
