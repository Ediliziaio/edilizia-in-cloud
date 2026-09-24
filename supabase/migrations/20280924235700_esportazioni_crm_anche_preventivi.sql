-- Esportazioni del CRM: anche l'elenco dei preventivi passa da «Esporta
-- Clienti» e dal registro (24/09/2026, decisione di Florin).
--
-- Con 20280924224500_esportazioni_crm_permesso_e_registro l'elenco dei
-- preventivi era rimasto fuori di proposito (numero, nome del cliente e
-- totale, senza email né telefono). Florin: «sì, blocca anche i preventivi».
-- La funzione è la stessa: cambia solo l'elenco delle esportazioni ammesse,
-- che si allunga di 'preventivi'.

create or replace function public.registra_esportazione_crm(
  p_company_id uuid,
  p_oggetto text,
  p_formato text,
  p_righe integer,
  p_filtri jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _uid uuid := auth.uid();
  _filtri jsonb := coalesce(p_filtri, '{}'::jsonb);
  _id uuid;
begin
  if _uid is null then
    raise exception 'Per esportare serve un utente collegato' using errcode = '42501';
  end if;
  if public.utente_bloccato() then
    raise exception 'Utente bloccato' using errcode = '42501';
  end if;
  if p_company_id is null then
    raise exception 'Azienda mancante' using errcode = '22023';
  end if;
  -- Super admin e amministratori dell'azienda sì; lo staff solo con la
  -- colonna accesa sulla riga di QUELL'azienda.
  if not public.has_permission_for_company(_uid, 'can_export_clients', p_company_id) then
    raise exception 'Non hai il permesso «Esporta Clienti» in questa azienda' using errcode = '42501';
  end if;
  if p_oggetto is null or p_oggetto not in (
    'contatti', 'opportunita', 'clienti', 'contatti_sms', 'destinatari_campagna',
    'opportunita_ferme', 'lead_migliori', 'archivio_azienda', 'preventivi'
  ) then
    raise exception 'Esportazione sconosciuta: %', coalesce(p_oggetto, 'nessuna') using errcode = '22023';
  end if;
  if p_formato is null or p_formato not in ('csv', 'xlsx', 'pdf', 'zip') then
    raise exception 'Formato sconosciuto: %', coalesce(p_formato, 'nessuno') using errcode = '22023';
  end if;

  if jsonb_typeof(_filtri) <> 'object' then
    _filtri := jsonb_build_object('valore', _filtri);
  end if;
  -- I filtri dicono COSA è uscito; non devono riempire il registro. Oltre
  -- 16 kB se ne tiene solo la misura.
  if octet_length(_filtri::text) > 16384 then
    _filtri := jsonb_build_object('troppo_lunghi', true, 'byte', octet_length(_filtri::text));
  end if;

  insert into public.user_audit_log (company_id, actor_id, action, details, is_impersonated)
  values (
    p_company_id,
    _uid,
    'crm_exported',
    jsonb_build_object(
      'oggetto', p_oggetto,
      'formato', p_formato,
      'righe', greatest(coalesce(p_righe, 0), 0),
      'filtri', _filtri
    ),
    exists (
      select 1 from public.active_impersonations ai
      where ai.admin_user_id = _uid and ai.expires_at > now()
    )
  )
  returning id into _id;

  return _id;
end;
$$;

revoke all on function public.registra_esportazione_crm(uuid, text, text, integer, jsonb) from public, anon;
grant execute on function public.registra_esportazione_crm(uuid, text, text, integer, jsonb) to authenticated;
