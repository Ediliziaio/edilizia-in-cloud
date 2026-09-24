-- Esportazioni del CRM: le fa solo chi ha «Esporta Clienti», e ognuna resta
-- scritta nel registro (24/09/2026).
--
-- Il permesso «Esporta Clienti» (staff_permissions.can_export_clients) c'era
-- nella schermata dei permessi, ma nessun bottone lo guardava: contatti,
-- opportunità e clienti si scaricavano dal browser a pagine da mille righe, e
-- dell'esportazione restava solo `limit=1000` negli edge_logs. A BeMade i due
-- operatori del call center avevano il permesso spento, e uno dei due (che vede
-- tutta l'azienda) poteva comunque portarsi via tutti i contatti e tutte le
-- opportunità.
--
-- registra_esportazione_crm() è il passaggio obbligato prima di consegnare il
-- file: controlla il permesso sull'azienda dei dati e scrive in user_audit_log
-- una riga «crm_exported» con chi, cosa, formato, quante righe e con quali
-- filtri. Se non risponde, l'app non consegna il file.
--
-- La policy di inserimento del registro ora pretende actor_id = auth.uid():
-- prima chiunque in azienda poteva scrivere righe a nome di un collega, e un
-- registro delle esportazioni falsificabile non prova niente. Tutti gli
-- inserimenti dell'app usano già l'utente della sessione; le funzioni SECURITY
-- DEFINER (cambia_ruolo_utente, imposta_ruolo_aggiuntivo, questa) e le
-- funzioni edge col service role non passano dalla policy.

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
    'opportunita_ferme', 'lead_migliori', 'archivio_azienda'
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

comment on function public.registra_esportazione_crm(uuid, text, text, integer, jsonb) is
  'Da chiamare prima di consegnare un file di contatti, clienti o opportunità: controlla «Esporta Clienti» (can_export_clients) sull''azienda e scrive crm_exported in user_audit_log. Senza risposta, niente file.';

drop policy if exists user_audit_log_insert on public.user_audit_log;
create policy user_audit_log_insert on public.user_audit_log
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and (
      company_id = get_my_company_id()
      or has_role((select auth.uid()), 'super_admin'::app_role)
    )
  );
