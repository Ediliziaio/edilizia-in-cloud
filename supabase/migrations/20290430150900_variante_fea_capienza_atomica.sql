-- La firma OTP usa lo stesso ordine di lock della registrazione su carta:
-- prima la commessa, poi la variante. Il saldo è letto sotto quel lock.
create or replace function public.odv_approva_da_firma_fea(p_request uuid)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare
  r public.signature_requests%rowtype;
  o public.orders%rowtype;
  v public.ordini_variazione%rowtype;
  v_saldo numeric;
begin
  select * into r from public.signature_requests where id = p_request;
  if not found or r.odv_id is null or r.tipo_documento is distinct from 'odv'
     or r.status is distinct from 'signed' or r.signed_at is null then
    return false;
  end if;

  select commessa.* into o from public.orders commessa
    join public.ordini_variazione variante
      on variante.order_id = commessa.id and variante.company_id = commessa.company_id
   where variante.id = r.odv_id and variante.company_id = r.company_id
     and (r.order_id is null or commessa.id = r.order_id) and commessa.deleted_at is null
   for update of commessa;
  if not found then return false; end if;

  select * into v from public.ordini_variazione
   where id = r.odv_id and order_id = o.id and company_id = o.company_id for update;
  if not found then return false; end if;
  if v.status = 'approvato' then
    return v.approval_channel is not distinct from 'online' and v.firmato_il is not distinct from r.signed_at;
  end if;
  if v.status <> 'in_attesa' then return false; end if;

  select o.total_amount + coalesce(sum(impatto_economico), 0) into v_saldo
    from public.ordini_variazione
   where order_id = o.id and company_id = o.company_id and status = 'approvato';
  if v_saldo + v.impatto_economico < 0 then
    raise exception using errcode = 'PVA01', message = 'La riduzione supera il residuo del contratto.';
  end if;

  update public.ordini_variazione
     set status = 'approvato', approval_channel = 'online',
         firmato_da = coalesce(nullif(btrim(r.signer_name), ''), firmato_da),
         firmato_il = r.signed_at, approval_recorded_at = now(),
         approved_document_hash = coalesce(r.documento_hash_firma, r.documento_hash, approved_document_hash),
         link_revoked_at = coalesce(link_revoked_at, now())
   where id = v.id;
  return true;
end;
$$;
revoke all on function public.odv_approva_da_firma_fea(uuid) from public, anon, authenticated;
grant execute on function public.odv_approva_da_firma_fea(uuid) to service_role;

-- La richiesta di firma e la variante si confermano nella stessa transazione.
create or replace function public.fea_registra_firma_variante(
  p_richiesta uuid, p_sessione_hash text, p_scadenza timestamptz, p_firma jsonb
) returns boolean language plpgsql security invoker set search_path = ''
as $$
declare
  v_prova public.signature_requests%rowtype := jsonb_populate_record(null::public.signature_requests, p_firma);
  v_commessa uuid;
  v_variante uuid;
  v_azienda uuid;
begin
  -- Prende il lock prima della scrittura della firma, i cui trigger possono
  -- già prendere un lock sulla commessa.
  select o.id, v.id, v.company_id into v_commessa, v_variante, v_azienda
    from public.signature_requests r
    join public.ordini_variazione v on v.id = r.odv_id and v.company_id = r.company_id
    join public.orders o on o.id = v.order_id and o.company_id = v.company_id
   where r.id = p_richiesta and r.tipo_documento = 'odv'
     and r.status = 'otp_verified' and r.sessione_firma_hash = p_sessione_hash
     and (r.order_id is null or r.order_id = o.id) and o.deleted_at is null
   for update of o;
  if not found then return false; end if;

  perform 1 from public.ordini_variazione v
   where v.id = v_variante and v.order_id = v_commessa and v.company_id = v_azienda
     and v.status = 'in_attesa'
   for update;
  if not found then
    raise exception using errcode = 'PVA02', message = 'La variante non è più da firmare.';
  end if;

  update public.signature_requests r set
    status = 'signed',
    signed_at = v_prova.signed_at,
    firma_ip = v_prova.firma_ip,
    firma_user_agent = v_prova.firma_user_agent,
    firma_lat = v_prova.firma_lat,
    firma_lng = v_prova.firma_lng,
    documento_hash_firma = coalesce(v_prova.documento_hash_firma, r.documento_hash_firma),
    firmatario_id = coalesce(v_prova.firmatario_id, r.firmatario_id),
    clausole_approvate = coalesce(v_prova.clausole_approvate, r.clausole_approvate),
    clausole_approvate_ts = coalesce(v_prova.clausole_approvate_ts, r.clausole_approvate_ts),
    b2c_recesso = coalesce(v_prova.b2c_recesso, r.b2c_recesso),
    b2c_recesso_ts = coalesce(v_prova.b2c_recesso_ts, r.b2c_recesso_ts),
    b2c_clausole = coalesce(v_prova.b2c_clausole, r.b2c_clausole),
    sessione_firma_hash = null,
    sessione_firma_scadenza = null
  where r.id = p_richiesta and r.tipo_documento = 'odv' and r.odv_id = v_variante
    and r.company_id = v_azienda and (r.order_id is null or r.order_id = v_commessa)
    and r.gruppo_firma_id is null and r.status = 'otp_verified'
    and r.sessione_firma_hash = p_sessione_hash and r.sessione_firma_scadenza > clock_timestamp()
    and r.expires_at = p_scadenza and r.expires_at > clock_timestamp()
    and v_prova.signed_at is not null;
  if not found then return false; end if;

  if not public.odv_approva_da_firma_fea(p_richiesta) then
    raise exception using errcode = 'PVA02', message = 'La variante non è più da firmare.';
  end if;
  return true;
end;
$$;
revoke all on function public.fea_registra_firma_variante(uuid,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.fea_registra_firma_variante(uuid,text,timestamptz,jsonb) to service_role;
notify pgrst, 'reload schema';
