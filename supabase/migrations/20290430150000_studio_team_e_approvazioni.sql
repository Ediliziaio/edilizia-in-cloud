CREATE TABLE IF NOT EXISTS public.studio_team_inviti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.accountant_firms(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS studio_team_inviti_attivi_email
  ON public.studio_team_inviti(firm_id,email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
ALTER TABLE public.studio_team_inviti ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_team_inviti FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.studio_puo_invitare_team(p_studio uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT NOT (SELECT public.utente_bloccato()) AND EXISTS (
    SELECT 1 FROM public.accountant_firm_members m JOIN public.accountant_firms f ON f.id=m.firm_id
    WHERE m.firm_id=p_studio AND m.user_id=(SELECT auth.uid()) AND m.status='active'
      AND m.role IN ('owner','admin') AND f.status='active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.studio_lista_inviti_team(p_studio uuid)
RETURNS TABLE(id uuid,email text,expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT i.id,i.email,i.expires_at FROM public.studio_team_inviti i
  WHERE i.firm_id=p_studio AND i.accepted_at IS NULL AND i.revoked_at IS NULL
    AND public.studio_puo_invitare_team(p_studio)
  ORDER BY i.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.studio_crea_invito_team(p_studio uuid,p_email text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
BEGIN
  IF NOT public.studio_puo_invitare_team(p_studio) THEN
    RAISE EXCEPTION 'Solo il titolare o un amministratore può invitare collaboratori.' USING ERRCODE='42501';
  END IF;
  IF length(v_email)>254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Inserisci un indirizzo email valido.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.accountant_firm_members m JOIN auth.users u ON u.id=m.user_id
    WHERE m.firm_id=p_studio AND lower(u.email)=v_email AND m.status='active'
  ) THEN
    RAISE EXCEPTION 'Questo utente fa già parte dello studio.';
  END IF;

  INSERT INTO public.studio_team_inviti(firm_id,email,token_hash)
  VALUES(p_studio,v_email,sha256(convert_to(v_token,'UTF8')))
  ON CONFLICT (firm_id,email) WHERE accepted_at IS NULL AND revoked_at IS NULL
  DO UPDATE SET token_hash=excluded.token_hash,created_at=now(),expires_at=now()+interval '7 days';
  RETURN v_token;
END;
$function$;

CREATE OR REPLACE FUNCTION public.studio_revoca_invito_team(p_studio uuid,p_invito uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.studio_puo_invitare_team(p_studio) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dello studio.' USING ERRCODE='42501';
  END IF;
  UPDATE public.studio_team_inviti SET revoked_at=now()
    WHERE firm_id=p_studio AND id=p_invito AND accepted_at IS NULL AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invito non più disponibile.'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.studio_accetta_invito_team(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_invito public.studio_team_inviti;
  v_email text;
BEGIN
  IF v_user IS NULL OR public.utente_bloccato() THEN
    RAISE EXCEPTION 'Accedi con l’email a cui è stato inviato l’invito.' USING ERRCODE='42501';
  END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id=v_user AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL OR p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invito non valido o email da confermare.' USING ERRCODE='42501';
  END IF;

  SELECT i.* INTO v_invito FROM public.studio_team_inviti i
  WHERE i.token_hash=sha256(convert_to(p_token,'UTF8')) AND i.email=v_email
    AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()
  FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.accountant_firms WHERE id=v_invito.firm_id AND status='active') THEN
    RAISE EXCEPTION 'Invito scaduto, già usato o associato a un’altra email.' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.profiles(id,email,first_name,last_name)
  VALUES (v_user,v_email,split_part(v_email,'@',1),'') ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.accountant_firm_members(firm_id,user_id,role,status,accepted_at)
  VALUES(v_invito.firm_id,v_user,'collaborator','active',now())
  ON CONFLICT (firm_id,user_id) DO UPDATE SET status='active',accepted_at=now()
    WHERE accountant_firm_members.role='collaborator' AND accountant_firm_members.status IN ('invited','suspended');
  IF NOT FOUND AND NOT EXISTS (
    SELECT 1 FROM public.accountant_firm_members WHERE firm_id=v_invito.firm_id AND user_id=v_user AND status='active'
  ) THEN
    RAISE EXCEPTION 'Il tuo accesso precedente va riattivato dallo studio.';
  END IF;
  INSERT INTO public.user_roles(user_id,role) VALUES(v_user,'accountant')
    ON CONFLICT(user_id,role) DO NOTHING;
  UPDATE public.studio_team_inviti SET accepted_at=now() WHERE id=v_invito.id;
  RETURN v_invito.firm_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.studio_puo_invitare_team(uuid), public.studio_lista_inviti_team(uuid),
  public.studio_crea_invito_team(uuid,text), public.studio_revoca_invito_team(uuid,uuid),
  public.studio_accetta_invito_team(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_puo_invitare_team(uuid), public.studio_lista_inviti_team(uuid),
  public.studio_crea_invito_team(uuid,text), public.studio_revoca_invito_team(uuid,uuid),
  public.studio_accetta_invito_team(text) TO authenticated;

-- Le transizioni e l'applicazione dei campi passano per le due funzioni.
DROP POLICY IF EXISTS change_req_accountant_insert ON public.accountant_change_requests;
DROP POLICY IF EXISTS change_req_company_admin_decide ON public.accountant_change_requests;
DROP POLICY IF EXISTS studio_richieste_lettura_responsabile ON public.accountant_change_requests;
CREATE POLICY studio_richieste_lettura_responsabile ON public.accountant_change_requests
FOR SELECT TO authenticated
USING (public.can_manage_company_people(company_id));

CREATE OR REPLACE FUNCTION public.studio_invia_richiesta(
  p_studio uuid,p_azienda uuid,p_commessa uuid,p_testo text,p_motivo text,p_precedente text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_testo text := btrim(coalesce(p_testo,''));
  v_motivo text := nullif(btrim(coalesce(p_motivo,'')),'');
  v_commessa public.orders;
  v_id uuid;
BEGIN
  IF v_user IS NULL OR public.utente_bloccato() OR NOT EXISTS(
    SELECT 1 FROM public.accountant_company_access a
    JOIN public.accountant_firm_members m ON m.firm_id=a.firm_id
    JOIN public.accountant_firms f ON f.id=a.firm_id
    WHERE a.firm_id=p_studio AND a.company_id=p_azienda AND a.status='active' AND a.access_mode='approval_required'
      AND m.user_id=v_user AND m.status='active' AND m.role IN('owner','admin','collaborator') AND f.status='active'
  ) THEN
    RAISE EXCEPTION 'Per proporre una modifica serve una delega attiva Con approvazione.' USING ERRCODE='42501';
  END IF;
  IF length(v_testo)<3 OR length(v_testo)>3000 OR length(v_motivo)>1000 THEN
    RAISE EXCEPTION 'Controlla la descrizione della proposta e la motivazione.' USING ERRCODE='22023';
  END IF;

  IF p_commessa IS NOT NULL THEN
    SELECT * INTO v_commessa FROM public.orders WHERE id=p_commessa AND company_id=p_azienda AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Commessa non disponibile.' USING ERRCODE='42501'; END IF;
    IF v_commessa.description IS DISTINCT FROM p_precedente THEN
      RAISE EXCEPTION 'La descrizione è cambiata. Ricarica la commessa e riprova.';
    END IF;
    IF v_commessa.description=v_testo THEN RAISE EXCEPTION 'La descrizione è uguale a quella già presente.'; END IF;
  END IF;

  INSERT INTO public.accountant_change_requests(company_id,requested_by,firm_id,resource_type,resource_id,operation,payload)
  VALUES(p_azienda,v_user,p_studio,CASE WHEN p_commessa IS NULL THEN 'proposta' ELSE 'commessa_descrizione' END,
    p_commessa,'update',
    jsonb_strip_nulls(jsonb_build_object('description',v_testo,'motivo',v_motivo,
      'precedente',v_commessa.description,'commessa',v_commessa.order_code)))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.studio_decidi_richiesta(p_id uuid,p_decisione text,p_nota text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_r public.accountant_change_requests;
BEGIN
  IF v_user IS NULL OR public.utente_bloccato() OR p_decisione IS NULL
     OR p_decisione NOT IN('approved','rejected') OR length(coalesce(p_nota,''))>1000 THEN
    RAISE EXCEPTION 'Decisione non valida o accesso non autorizzato.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_r FROM public.accountant_change_requests
  WHERE id=p_id AND public.can_manage_company_people(company_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Richiesta non disponibile.' USING ERRCODE='42501'; END IF;
  IF v_r.status <> 'pending' OR v_r.expires_at <= now() THEN
    RAISE EXCEPTION 'Richiesta già gestita o scaduta.';
  END IF;
  IF p_decisione='approved' AND v_r.requested_by=v_user THEN
    RAISE EXCEPTION 'La proposta deve essere approvata da un altro responsabile dell’azienda.';
  END IF;

  IF p_decisione='approved' AND v_r.resource_type IN ('proposta','commessa_descrizione') AND NOT EXISTS(
    SELECT 1 FROM public.accountant_company_access a
    JOIN public.accountant_firm_members m ON m.firm_id=a.firm_id
    JOIN public.accountant_firms f ON f.id=a.firm_id
    WHERE a.firm_id=v_r.firm_id AND a.company_id=v_r.company_id AND a.status='active' AND a.access_mode='approval_required'
      AND m.user_id=v_r.requested_by AND m.status='active' AND m.role IN('owner','admin','collaborator') AND f.status='active'
  ) THEN
    RAISE EXCEPTION 'La delega è cambiata. Puoi rifiutare questa richiesta.';
  END IF;

  IF p_decisione='approved' AND v_r.resource_type='commessa_descrizione' THEN
    IF v_r.operation<>'update' OR length(coalesce(v_r.payload->>'description','')) NOT BETWEEN 3 AND 3000 THEN
      RAISE EXCEPTION 'Descrizione proposta non valida.';
    END IF;
    UPDATE public.orders SET description=v_r.payload->>'description'
    WHERE id=v_r.resource_id AND company_id=v_r.company_id AND deleted_at IS NULL
      AND description IS NOT DISTINCT FROM (v_r.payload->>'precedente');
    IF NOT FOUND THEN RAISE EXCEPTION 'La commessa è cambiata. Chiedi una nuova proposta.'; END IF;
  END IF;

  UPDATE public.accountant_change_requests
  SET status=p_decisione,decided_by=v_user,decided_at=now(),decision_note=nullif(btrim(coalesce(p_nota,'')),'')
  WHERE id=v_r.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.studio_invia_richiesta(uuid,uuid,uuid,text,text,text), public.studio_decidi_richiesta(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_invia_richiesta(uuid,uuid,uuid,text,text,text), public.studio_decidi_richiesta(uuid,text,text) TO authenticated;
