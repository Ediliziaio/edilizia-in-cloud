-- Console clienti marketing: chi segue il cliente, e il diario della settimana.
--
-- Due cose che finora non c'erano.
--
-- 1. Il responsabile del contratto. Oggi i clienti li registra una persona
--    sola, domani saranno diverse: ognuna deve vedere i propri e basta. Il
--    campo commerciale_id esiste già su aedix_service_clients ma è vuoto su
--    tutte le righe e nessuno lo legge. Da qui in avanti è la chiave della
--    visibilità: chi amministra la piattaforma vede tutto, chi segue dei
--    clienti vede solo quelli, chiunque altro non vede niente.
--
-- 2. Il diario della settimana. Il report dice cosa è successo; il diario dice
--    cosa ho capito e cosa faccio. Una riga per cliente e per settimana: i
--    trend notati, la cosa da fare, com'è andata. È quello che serve al
--    controllo per stare addosso al cliente senza rileggersi i numeri da capo,
--    e diventa la base del punto mensile.
--
-- La settimana è sempre il lunedì (date_trunc('week')), ora di Roma.

-- ------------------------------------------------------------------
-- Chi vede cosa
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mkt_vede_tutto()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT (SELECT public.is_super_admin())
      OR coalesce((SELECT auth.jwt() ->> 'role'), '') = 'service_role';
$fn$;

COMMENT ON FUNCTION public.mkt_vede_tutto() IS
  'Vero per chi amministra la piattaforma e per il ruolo di servizio (cron, rapporto del mattino).';

REVOKE ALL ON FUNCTION public.mkt_vede_tutto() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_vede_tutto() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mkt_vede_cliente(p_service_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT (SELECT public.mkt_vede_tutto())
      OR ((SELECT public.is_platform_staff())
          AND EXISTS (
                SELECT 1 FROM public.aedix_service_clients sc
                 WHERE sc.id = p_service_client_id
                   AND sc.commerciale_id = (SELECT auth.uid())
              ));
$fn$;

COMMENT ON FUNCTION public.mkt_vede_cliente(uuid) IS
  'Vero se chi chiama amministra la piattaforma oppure è il responsabile di quel contratto.';

REVOKE ALL ON FUNCTION public.mkt_vede_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_vede_cliente(uuid) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_aedix_service_clients_commerciale
  ON public.aedix_service_clients (commerciale_id)
  WHERE commerciale_id IS NOT NULL;

-- ------------------------------------------------------------------
-- Il diario della settimana
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mkt_diario_settimana (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_client_id uuid NOT NULL REFERENCES public.aedix_service_clients(id) ON DELETE CASCADE,
  settimana         date NOT NULL,
  trend             text,
  cosa_fare         text,
  esito             text,
  chiusa            boolean NOT NULL DEFAULT false,
  scritto_da        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mkt_diario_settimana IS
  'Una riga per cliente e per settimana (lunedì): i trend notati, la cosa da fare, com''è andata.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_diario_cliente_settimana
  ON public.mkt_diario_settimana (service_client_id, settimana);

ALTER TABLE public.mkt_diario_settimana ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diario marketing: solo chi segue il cliente" ON public.mkt_diario_settimana;
CREATE POLICY "diario marketing: solo chi segue il cliente"
  ON public.mkt_diario_settimana
  FOR ALL
  TO authenticated
  USING (public.mkt_vede_cliente(service_client_id))
  WITH CHECK (public.mkt_vede_cliente(service_client_id));

-- ------------------------------------------------------------------
-- Assegnare il responsabile
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_mkt_responsabili()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.nome), '[]'::jsonb)
    FROM (
      SELECT p.id,
             coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email) AS nome,
             p.email,
             (SELECT count(*) FROM public.aedix_service_clients sc WHERE sc.commerciale_id = p.id) AS clienti
        FROM public.profiles p
       WHERE (SELECT public.mkt_vede_tutto())
         AND EXISTS (
               SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = p.id
                  AND ur.role::text IN ('super_admin', 'platform_manager', 'platform_sales',
                                        'platform_support', 'platform_marketing', 'platform_implementation')
             )
    ) x;
$fn$;

COMMENT ON FUNCTION public.admin_mkt_responsabili() IS
  'Chi può seguire un cliente: le persone con un ruolo di piattaforma, con quanti clienti hanno già.';

REVOKE ALL ON FUNCTION public.admin_mkt_responsabili() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mkt_responsabili() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_service_client_responsabile(
  p_service_client_id uuid,
  p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_nome text;
BEGIN
  IF NOT (SELECT public.mkt_vede_tutto()) THEN
    RAISE EXCEPTION 'Il responsabile lo assegna chi amministra la piattaforma' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p_user_id
          AND ur.role::text IN ('super_admin', 'platform_manager', 'platform_sales',
                                'platform_support', 'platform_marketing', 'platform_implementation')
     ) THEN
    RAISE EXCEPTION 'Quella persona non lavora sulla piattaforma: non può seguire un cliente' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), pr.email)
    INTO v_nome
    FROM public.profiles pr
   WHERE pr.id = p_user_id;

  UPDATE public.aedix_service_clients
     SET commerciale_id = p_user_id,
         commerciale    = v_nome,
         updated_at     = now()
   WHERE id = p_service_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contratto non trovato' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('ok', true, 'responsabile_id', p_user_id, 'responsabile_nome', v_nome);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_service_client_responsabile(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_service_client_responsabile(uuid, uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------
-- Scrivere e leggere il diario
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_mkt_diario_salva(
  p_service_client_id uuid,
  p_settimana date DEFAULT NULL,
  p_trend text DEFAULT NULL,
  p_cosa_fare text DEFAULT NULL,
  p_esito text DEFAULT NULL,
  p_chiusa boolean DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_sett date;
  v_riga public.mkt_diario_settimana;
BEGIN
  IF NOT (SELECT public.mkt_vede_cliente(p_service_client_id)) THEN
    RAISE EXCEPTION 'Questo cliente non lo segui tu' USING ERRCODE = '42501';
  END IF;

  v_sett := date_trunc('week', coalesce(p_settimana, (now() AT TIME ZONE 'Europe/Rome')::date))::date;

  -- NULL vuol dire «non toccare questo campo»: la stringa vuota lo svuota.
  INSERT INTO public.mkt_diario_settimana AS d
         (service_client_id, settimana, trend, cosa_fare, esito, chiusa, scritto_da)
  VALUES (p_service_client_id, v_sett,
          nullif(btrim(coalesce(p_trend, '')), ''),
          nullif(btrim(coalesce(p_cosa_fare, '')), ''),
          nullif(btrim(coalesce(p_esito, '')), ''),
          coalesce(p_chiusa, false),
          (SELECT auth.uid()))
  ON CONFLICT (service_client_id, settimana) DO UPDATE
     SET trend      = CASE WHEN p_trend     IS NULL THEN d.trend     ELSE nullif(btrim(p_trend), '') END,
         cosa_fare  = CASE WHEN p_cosa_fare IS NULL THEN d.cosa_fare ELSE nullif(btrim(p_cosa_fare), '') END,
         esito      = CASE WHEN p_esito     IS NULL THEN d.esito     ELSE nullif(btrim(p_esito), '') END,
         chiusa     = coalesce(p_chiusa, d.chiusa),
         scritto_da = coalesce((SELECT auth.uid()), d.scritto_da),
         updated_at = now()
  RETURNING * INTO v_riga;

  RETURN to_jsonb(v_riga);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_mkt_diario_salva(uuid, date, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mkt_diario_salva(uuid, date, text, text, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_mkt_diario_lista(
  p_service_client_id uuid,
  p_quante integer DEFAULT 12)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.settimana DESC), '[]'::jsonb)
    FROM (
      SELECT d.settimana, d.trend, d.cosa_fare, d.esito, d.chiusa, d.updated_at,
             coalesce(nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), pr.email) AS scritto_da_nome
        FROM public.mkt_diario_settimana d
        LEFT JOIN public.profiles pr ON pr.id = d.scritto_da
       WHERE d.service_client_id = p_service_client_id
         AND (SELECT public.mkt_vede_cliente(p_service_client_id))
       ORDER BY d.settimana DESC
       LIMIT greatest(1, least(coalesce(p_quante, 12), 52))
    ) x;
$fn$;

REVOKE ALL ON FUNCTION public.admin_mkt_diario_lista(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mkt_diario_lista(uuid, integer) TO authenticated, service_role;
