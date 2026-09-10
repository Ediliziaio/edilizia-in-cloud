-- L'email che non parte per crediti finiti non la sa nessuno.
--
-- Il 2 settembre l'email con il link per firmare un preventivo non è partita:
-- «Insufficient credits». L'unica traccia è una riga in `email_delivery_log`,
-- che nessuno guarda. Dal lato azienda sembra tutto a posto: il preventivo
-- risulta inviato e il cliente non lo riceve mai.
--
-- Da qui in avanti, quando un invio si ferma per borsellino vuoto, chi
-- amministra l'azienda riceve un avviso in campanella — uno al giorno, non uno
-- per email respinta.
--
-- Nota: i solleciti della piattaforma (dunning, prova scaduta) non passano di
-- qui, li paga la piattaforma: addebitarli a chi è in arretrato significava non
-- poterlo avvisare proprio quando serviva.

CREATE OR REPLACE FUNCTION public.avvisa_crediti_email_esauriti(
  p_company_id uuid,
  p_dettaglio text DEFAULT NULL::text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gia_avvisato BOOLEAN;
  v_quanti INTEGER := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.notifications n
     WHERE n.company_id = p_company_id
       AND n.type = 'email_crediti'
       AND n.created_at > now() - interval '24 hours'
  ) INTO v_gia_avvisato;
  IF v_gia_avvisato THEN
    RETURN 0;
  END IF;

  INSERT INTO public.notifications (
    company_id, user_id, type, title, body, entity_type, entity_id, action_url
  )
  SELECT
    p_company_id,
    p.id,
    'email_crediti',
    'Email non inviate: credito esaurito',
    'Il credito email è finito, così l''ultimo invio si è fermato'
      || COALESCE(' (' || left(p_dettaglio, 80) || ')', '')
      || '. Finché non lo ricarichi, le email che superano il piano non partono — comprese quelle per far firmare i preventivi.',
    'email_credits',
    NULL,
    '/azienda/impostazioni/crediti'
  FROM public.profiles p
  WHERE p.company_id = p_company_id
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = p.id AND ur.role = 'company_admin'::public.app_role
    );

  GET DIAGNOSTICS v_quanti = ROW_COUNT;
  RETURN v_quanti;
END;
$function$;

REVOKE ALL ON FUNCTION public.avvisa_crediti_email_esauriti(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avvisa_crediti_email_esauriti(uuid, text) TO service_role;
