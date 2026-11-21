-- Per preventivi e progetti FV cointestati la firma e la chiusura si confermano insieme.
create or replace function public.fea_registra_firma_congiunta(
  p_richiesta uuid, p_sessione_hash text, p_scadenza timestamptz, p_firma jsonb
) returns table (completo boolean, chiude boolean, firmati int, richiesti int, nomi text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_gruppo uuid;
  v_richiesta public.signature_requests%rowtype;
  v_prova public.signature_requests%rowtype;
  v_esito record;
  v_source text;
  v_modulo text[];
  v_tabella text;
  v_aggiornati int;
begin
  select r.gruppo_firma_id into v_gruppo from public.signature_requests r where r.id = p_richiesta;
  if v_gruppo is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('fea_gruppo:' || v_gruppo::text, 0));

  v_prova := jsonb_populate_record(null::public.signature_requests, p_firma);
  update public.signature_requests r set
    status = 'signed',
    signed_at = v_prova.signed_at,
    firma_ip = v_prova.firma_ip,
    firma_user_agent = v_prova.firma_user_agent,
    firma_lat = v_prova.firma_lat,
    firma_lng = v_prova.firma_lng,
    documento_hash_firma = v_prova.documento_hash_firma,
    firmatario_id = v_prova.firmatario_id,
    clausole_approvate = v_prova.clausole_approvate,
    clausole_approvate_ts = v_prova.clausole_approvate_ts,
    b2c_recesso = v_prova.b2c_recesso,
    b2c_recesso_ts = v_prova.b2c_recesso_ts,
    b2c_clausole = v_prova.b2c_clausole,
    sessione_firma_hash = null,
    sessione_firma_scadenza = null
  where r.id = p_richiesta and r.gruppo_firma_id = v_gruppo and r.status = 'otp_verified'
    and r.sessione_firma_hash = p_sessione_hash and r.sessione_firma_scadenza > clock_timestamp()
    and r.expires_at = p_scadenza and r.expires_at > clock_timestamp()
  returning r.* into v_richiesta;
  if not found then return; end if;

  if not coalesce(
    (v_richiesta.tipo_documento = 'quote' and v_richiesta.quote_id is not null)
    or (v_richiesta.tipo_documento = 'fv' and v_richiesta.fv_progetto_id is not null), false
  ) or exists (
    select 1 from public.signature_requests r where r.gruppo_firma_id = v_gruppo
      and (r.company_id is distinct from v_richiesta.company_id
        or r.tipo_documento is distinct from v_richiesta.tipo_documento
        or r.quote_id is distinct from v_richiesta.quote_id
        or r.fv_progetto_id is distinct from v_richiesta.fv_progetto_id)
  ) then
    raise exception 'Documenti del gruppo di firma incoerenti.';
  end if;

  select * into strict v_esito from public.fea_gruppo_dopo_firma(p_richiesta);
  if v_esito.chiude then
    if v_richiesta.quote_id is not null then
      update public.quotes q set status = 'accettata', signed_at = v_prova.signed_at,
        signed_by_name = coalesce(v_esito.nomi, v_richiesta.signer_name), updated_at = v_prova.signed_at
      where q.id = v_richiesta.quote_id and q.company_id = v_richiesta.company_id
      returning q.source into v_source;
      if not found then raise exception 'Preventivo collegato non aggiornato.'; end if;

      v_modulo := regexp_match(v_source, '^modulo:([a-z]+):([0-9a-f-]{36})$');
      v_tabella := case v_modulo[1]
        when 'rst' then 'rst_progetti' when 'bagni' then 'bgn_progetti' when 'tetti' then 'tet_progetti'
        when 'clm' then 'clm_progetti' when 'ele' then 'ele_progetti' when 'idr' then 'idr_progetti'
        when 'pav' then 'pav_progetti' when 'pis' then 'pis_progetti' when 'sr' then 'sr_progetti'
      end;
      if v_tabella is not null then
        execute format('update public.%I set stato = ''accettato''%s where id = $1 and company_id = $2', v_tabella,
          case when v_tabella = 'sr_progetti' then ', firmato_il = $3' else '' end)
        using v_modulo[2]::uuid, v_richiesta.company_id, v_prova.signed_at;
        get diagnostics v_aggiornati = row_count;
        if v_aggiornati <> 1 then raise exception 'Progetto operativo collegato non aggiornato.'; end if;
      end if;
    end if;

    if v_richiesta.fv_progetto_id is not null then
      update public.fv_progetti p set stato = 'firmato', firmato_il = v_prova.signed_at
      where p.id = v_richiesta.fv_progetto_id and p.company_id = v_richiesta.company_id;
      if not found then raise exception 'Progetto fotovoltaico collegato non aggiornato.'; end if;
    end if;
  end if;
  return query select v_esito.completo, v_esito.chiude, v_esito.firmati, v_esito.richiesti, v_esito.nomi;
end;
$$;
revoke all on function public.fea_registra_firma_congiunta(uuid,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.fea_registra_firma_congiunta(uuid,text,timestamptz,jsonb) to service_role;
notify pgrst, 'reload schema';
