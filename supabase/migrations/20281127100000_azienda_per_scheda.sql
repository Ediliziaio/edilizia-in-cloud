-- Ogni scheda lavora sulla sua azienda.
--
-- Prima l'azienda stava solo in una riga per utente (active_impersonations,
-- active_company_selection): una finestra cambiava quella delle altre, e dopo le
-- 2 ore dell'accesso il super admin restava senza azienda. Elenchi vuoti, e alcune
-- scritture sull'azienda sbagliata (docs/azienda-schermata-server.md).
--
-- Ora la scheda dichiara la sua azienda con l'header x-azienda-scheda. Vale solo
-- se l'utente può già arrivarci con i percorsi esistenti: super admin, azienda del
-- profilo, accesso multi-azienda attivo. Non basta una delega da commercialista,
-- che il ramo della selezione non ha mai accettato: qui aprirebbe ogni tabella.
-- L'header lo sceglie chi chiama: da quando la funzione è applicata vale per
-- chiunque lo mandi, anche se la nostra app non lo manda ancora.
--
-- Header assente o malformato: si legge la riga, come prima.
-- Header ben formato ma NON ammesso: nessuna azienda (uuid tutto zeri), mai la
-- riga. La riga darebbe un'altra azienda a una scheda che crede di stare su questa,
-- e le funzioni senza parametro azienda ci scriverebbero (provato con
-- costo_personale_parametri_salva: titolare con accesso revocato, riga scritta
-- sulla sua azienda di casa). NULL non si può usare: has_permission con azienda
-- NULL ricade sul ruolo «in un'azienda qualsiasi».
--
-- La riga di accesso vale solo per chi è ancora super admin: prima un super admin
-- revocato restava dentro l'azienda fino alla scadenza, fino a 2 ore.
--
-- Provato in transazione annullata, 30 casi con utenti veri. Devono continuare a
-- funzionare: profilo proprio, titolare sui suoi utenti, multi-azienda attivo,
-- super admin con e senza header, service role, commercialista senza header.
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.get_effective_company_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scheda text;
  v_azienda uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    v_scheda := nullif(current_setting('request.headers', true), '')::json ->> 'x-azienda-scheda';
    IF v_scheda ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_azienda := v_scheda::uuid;
      IF public.has_role(v_uid, 'super_admin'::public.app_role)
         OR v_azienda = (SELECT p.company_id FROM public.profiles p WHERE p.id = v_uid)
         OR EXISTS (
           SELECT 1 FROM public.multi_company_access mca
            WHERE mca.user_id = v_uid
              AND mca.company_id = v_azienda
              AND mca.status = 'active'
              AND (mca.expires_at IS NULL OR mca.expires_at > now())
         ) THEN
        RETURN v_azienda;
      END IF;
      RETURN '00000000-0000-0000-0000-000000000000'::uuid;
    END IF;
  END IF;

  RETURN COALESCE(
    (SELECT ai.target_company_id
       FROM public.active_impersonations ai
      WHERE ai.admin_user_id = v_uid
        AND ai.expires_at > now()
        AND public.has_role(v_uid, 'super_admin'::public.app_role)
      ORDER BY ai.created_at DESC
      LIMIT 1),
    (SELECT acs.company_id
       FROM public.active_company_selection acs
      WHERE acs.user_id = v_uid
        AND (
          acs.company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = v_uid)
          OR EXISTS (
            SELECT 1 FROM public.multi_company_access mca
            WHERE mca.user_id = v_uid
              AND mca.company_id = acs.company_id
              AND mca.status = 'active'
              AND (mca.expires_at IS NULL OR mca.expires_at > now())
          )
        )
      LIMIT 1),
    (SELECT p.company_id FROM public.profiles p WHERE p.id = v_uid)
  );
END;
$function$;

-- Il registro delle esportazioni riconosceva il super admin dentro un'azienda dalla
-- riga di accesso, che ora può essere scaduta o di un'altra scheda: conta il ruolo.
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
    public.has_role(_uid, 'super_admin'::public.app_role)
  )
  returning id into _id;

  return _id;
end;
$$;

revoke all on function public.registra_esportazione_crm(uuid, text, text, integer, jsonb) from public, anon;
grant execute on function public.registra_esportazione_crm(uuid, text, text, integer, jsonb) to authenticated;
