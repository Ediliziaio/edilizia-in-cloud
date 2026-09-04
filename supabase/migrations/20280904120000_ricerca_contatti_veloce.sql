-- Ondata 1.1 — la ricerca contatti, e la ragione vera per cui era lenta
--
-- L'audit attribuiva i 3.898 ms alla forma `company_id IN (SELECT unnest(...))`
-- nelle policy. Misurando, non è così: quella sottoquery il pianificatore la
-- risolve come SubPlan *hashed* e la valuta UNA VOLTA (6 ms per l'intera
-- query, non per riga). Ho provato a riscriverla in `= ANY(funzione())` e ho
-- ottenuto il contrario: una chiamata di funzione nuda dentro un qual finisce
-- nel Filter ed è eseguita una volta per riga — 90.381 chiamate, timeout. È
-- stata ripristinata la forma originale.
--
-- La causa vera si vede confrontando lo STESSO SELECT con e senza RLS:
--
--   con RLS (ruolo authenticated)   Seq Scan · Rows Removed by Filter: 90381 · 311 ms
--   senza RLS (proprietario)        BitmapOr sui 4 indici trigram ·           0,98 ms
--
-- Gli indici trigram funzionano: non vengono usati. Il perché è nel catalogo:
--     SELECT proleakproof FROM pg_proc WHERE proname = 'texticlike';  -> false
-- ILIKE non è leakproof, e PostgreSQL non spinge un qual non leakproof sotto la
-- barriera di sicurezza che la RLS costruisce. Non potendo diventare condizione
-- d'indice, la ricerca testuale si riduce a una scansione completa. Nessuna
-- riscrittura di policy può cambiarlo: finché il filtro testuale sta sopra la
-- barriera, resta un filtro riga per riga.
--
-- La cura è dare alla ricerca un percorso dove la barriera non serve, perché il
-- confine aziendale è applicato esplicitamente: una funzione SECURITY DEFINER
-- che ripete la stessa condizione delle policy — non una più larga — e
-- all'interno usa `company_id = ANY(array)`, leakproof e quindi indicizzabile,
-- insieme all'ILIKE sui trigram.
--
--   Piano ottenuto: BitmapAnd( indice azienda, BitmapOr(5 indici trigram) )
--   Misurato:  ricerca "ross"  1.280 ms -> 2,8 ms      elenco -> 1,3 ms

-- Le aziende di cui posso vedere i contatti. NULL = super admin, cioè tutte.
-- Ricalca l'unione delle quattro policy su marketing_contacts.
--
-- Le tre autorizzazioni si leggono in una query sola: passare da
-- aziende_con_permesso (515 µs a chiamata, per via del lookup su
-- information_schema e dell'EXECUTE dinamico) costava ~50 ms contro gli 0,7 ms
-- della ricerca vera. I nomi delle colonne sono espliciti invece che dinamici:
-- sono gli stessi che le policy citano, quindi se una sparisse questa funzione
-- fallirebbe forte — meglio di un permesso silenziosamente vuoto.
CREATE OR REPLACE FUNCTION public.mc_aziende_visibili()
RETURNS uuid[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_out uuid[];
BEGIN
  IF v_uid IS NULL THEN RETURN '{}'::uuid[]; END IF;
  IF public.has_role(v_uid, 'super_admin'::public.app_role) THEN
    RETURN NULL;                              -- nessun limite
  END IF;

  SELECT coalesce(array_agg(DISTINCT c), '{}'::uuid[]) INTO v_out
  FROM (
    SELECT sp.company_id AS c
    FROM public.staff_permissions sp
    WHERE sp.user_id = v_uid
      AND (coalesce(sp.can_view_marketing_contacts, false)
        OR coalesce(sp.can_view_orders, false)
        OR coalesce(sp.can_edit_marketing_contacts, false))
    UNION ALL
    SELECT mca.company_id
    FROM public.multi_company_access mca
    WHERE mca.user_id = v_uid
      AND mca.status = 'active'
      AND (mca.expires_at IS NULL OR mca.expires_at > now())
      AND mca.access_role::text = 'company_admin'
    UNION ALL
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = v_uid
      AND p.company_id IS NOT NULL
      AND public.has_role(v_uid, 'company_admin'::public.app_role)
  ) s
  WHERE c IS NOT NULL;

  RETURN v_out;
END;
$function$;

REVOKE ALL ON FUNCTION public.mc_aziende_visibili() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mc_aziende_visibili() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.marketing_contacts_cerca(
  p_query      text    DEFAULT NULL,
  p_company_id uuid    DEFAULT NULL,
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, company_id uuid, first_name text, last_name text,
  email text, phone text, stato text, tipo text,
  assigned_to uuid, lead_score integer, created_at timestamptz,
  totale bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aziende  uuid[];
  v_solo     boolean;
  v_uid      uuid := auth.uid();
  v_pattern  text;
  v_limit    integer := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset   integer := greatest(coalesce(p_offset, 0), 0);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  v_aziende := public.mc_aziende_visibili();
  v_solo    := public.solo_assegnati_attivo();

  -- Se chiedi una singola azienda, deve essere fra le tue: stesso errore per
  -- "non esiste" e "non è tua", per non rivelare quale delle due.
  IF p_company_id IS NOT NULL
     AND v_aziende IS NOT NULL
     AND NOT (p_company_id = ANY(v_aziende)) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  v_pattern := CASE
    WHEN coalesce(btrim(p_query), '') = '' THEN NULL
    ELSE '%' || btrim(p_query) || '%'
  END;

  RETURN QUERY
  SELECT mc.id, mc.company_id, mc.first_name, mc.last_name,
         mc.email, mc.phone, mc.stato, mc.tipo,
         mc.assigned_to, mc.lead_score, mc.created_at,
         count(*) OVER ()::bigint AS totale
  FROM public.marketing_contacts mc
  WHERE (v_aziende IS NULL OR mc.company_id = ANY(v_aziende))
    AND (p_company_id IS NULL OR mc.company_id = p_company_id)
    AND (NOT v_solo OR mc.assigned_to = v_uid)
    AND mc.deleted_at IS NULL
    AND (
      v_pattern IS NULL
      OR mc.first_name ILIKE v_pattern
      OR mc.last_name  ILIKE v_pattern
      OR mc.email      ILIKE v_pattern
      OR mc.phone      ILIKE v_pattern
      OR (coalesce(mc.first_name,'') || ' ' || coalesce(mc.last_name,'')) ILIKE v_pattern
    )
  ORDER BY mc.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

COMMENT ON FUNCTION public.marketing_contacts_cerca(text, uuid, integer, integer) IS
  'Ricerca contatti. SECURITY DEFINER di proposito: la RLS impedisce di usare '
  'gli indici trigram perché ILIKE non è leakproof. Il confine aziendale è '
  'applicato qui esplicitamente, con la stessa condizione delle policy.';

REVOKE ALL ON FUNCTION public.marketing_contacts_cerca(text, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_contacts_cerca(text, uuid, integer, integer) TO authenticated, service_role;
