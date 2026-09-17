-- Funzioni con un nome di colonna ambiguo: fallivano a OGNI chiamata.
--
-- In una funzione plpgsql con RETURNS TABLE(id …, name …) le colonne del
-- risultato sono anche variabili: «SELECT id FROM order_statuses» non sa se
-- «id» è la colonna o la variabile e Postgres si ferma con 42702. Il 17/09/2026
-- Suntech (e ogni altra azienda) non riusciva a salvare gli stati ordine: il
-- toast diceva solo «Impossibile salvare le modifiche».
--
-- Trovate tutte con plpgsql_check su public: stati ordine, CE mensile del
-- Controllo di Gestione, punti della mappa CRM, abbinamento DDT a fornitore e
-- a ordine d'acquisto, statistiche email AI. In tutte il riferimento ambiguo
-- intende la colonna: «#variable_conflict use_column» lo dice a Postgres, il
-- resto del corpo è identico.
--
-- save_order_statuses in più apre il salvataggio a chi ha il permesso
-- «Configurazione Ordini · Modifica» su quella azienda, non solo all'admin.

CREATE OR REPLACE FUNCTION public.save_order_statuses(p_company_id uuid, p_statuses jsonb)
 RETURNS TABLE(id uuid, company_id uuid, name text, icon text, color text, "position" integer, is_default boolean, is_support_phase boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_user_id UUID;
  v_is_super_admin BOOLEAN;
  v_existing_support_id UUID;
  v_payload_support_present BOOLEAN;
  v_incoming_ids UUID[];
  v_orphan_status_id UUID;
  v_orphan_name TEXT;
  v_in_use INTEGER;
BEGIN
  -- Autorizzazione: super admin, oppure chi può modificare la configurazione
  -- ordini di QUELLA azienda (amministratore, accesso multi-azienda da admin,
  -- staff con «Configurazione Ordini · Modifica»). Prima bastava essere
  -- company_admin di un'azienda qualsiasi con profilo sulla stessa: lo staff
  -- col permesso veniva rifiutato e l'admin multi-azienda pure.
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_user_id AND ur.role = 'super_admin'
  ) INTO v_is_super_admin;

  IF NOT v_is_super_admin
     AND NOT (p_company_id = ANY (public.aziende_con_permesso('can_edit_settings_orders'))) THEN
    RAISE EXCEPTION 'forbidden: non puoi modificare gli stati ordine di questa azienda';
  END IF;

  -- Validazione payload
  IF p_statuses IS NULL OR jsonb_typeof(p_statuses) <> 'array' THEN
    RAISE EXCEPTION 'invalid_payload: p_statuses must be a JSON array';
  END IF;

  IF jsonb_array_length(p_statuses) < 2 THEN
    RAISE EXCEPTION 'invalid_payload: almeno 2 stati richiesti';
  END IF;

  -- La fase Assistenza non può essere rimossa se già esiste
  SELECT id INTO v_existing_support_id
  FROM public.order_statuses
  WHERE company_id = p_company_id AND is_support_phase = TRUE
  LIMIT 1;

  IF v_existing_support_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_statuses) AS elem
      WHERE (elem->>'id')::uuid IS NOT DISTINCT FROM v_existing_support_id
         OR COALESCE((elem->>'is_support_phase')::boolean, FALSE) = TRUE
    ) INTO v_payload_support_present;

    IF NOT v_payload_support_present THEN
      RAISE EXCEPTION 'support_phase_required: la fase Assistenza non può essere rimossa';
    END IF;
  END IF;

  -- Step 1: UPSERT stati dal payload
  WITH incoming AS (
    SELECT
      CASE
        WHEN elem->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (elem->>'id')::uuid
        ELSE NULL
      END AS row_id,
      COALESCE(NULLIF(trim(elem->>'name'), ''), 'Stato') AS row_name,
      COALESCE(NULLIF(elem->>'icon', ''), 'Circle') AS row_icon,
      COALESCE(NULLIF(elem->>'color', ''), '#2563EB') AS row_color,
      COALESCE((elem->>'position')::integer, ord::integer - 1) AS row_position,
      COALESCE((elem->>'is_support_phase')::boolean, FALSE) AS row_support,
      (ord = 1) AS row_is_default
    FROM jsonb_array_elements(p_statuses) WITH ORDINALITY AS arr(elem, ord)
  ),
  upserted_existing AS (
    UPDATE public.order_statuses os
    SET name = i.row_name,
        icon = i.row_icon,
        color = i.row_color,
        position = i.row_position,
        is_default = i.row_is_default,
        -- is_support_phase: se c'era già TRUE lo manteniamo; non lo togliamo mai qui
        is_support_phase = (os.is_support_phase OR i.row_support)
    FROM incoming i
    WHERE os.id = i.row_id AND os.company_id = p_company_id
    RETURNING os.id
  ),
  inserted_new AS (
    INSERT INTO public.order_statuses
      (company_id, name, icon, color, position, is_default, is_support_phase)
    SELECT
      p_company_id, i.row_name, i.row_icon, i.row_color,
      i.row_position, i.row_is_default, i.row_support
    FROM incoming i
    WHERE i.row_id IS NULL
    RETURNING id
  )
  SELECT array_agg(aid) INTO v_incoming_ids
  FROM (
    SELECT id AS aid FROM upserted_existing
    UNION ALL
    SELECT id FROM inserted_new
  ) t;

  -- Step 2: DELETE solo gli stati rimossi dal payload (verificando non siano in uso)
  FOR v_orphan_status_id, v_orphan_name IN
    SELECT os.id, os.name
    FROM public.order_statuses os
    WHERE os.company_id = p_company_id
      AND os.id <> ALL(COALESCE(v_incoming_ids, ARRAY[]::uuid[]))
      AND os.is_support_phase = FALSE  -- doppia protezione
  LOOP
    SELECT COUNT(*) INTO v_in_use
    FROM public.orders o
    WHERE o.current_status_id = v_orphan_status_id;

    IF v_in_use > 0 THEN
      RAISE EXCEPTION 'status_in_use: lo stato "%" è associato a % ordine/i e non può essere eliminato',
        v_orphan_name, v_in_use;
    END IF;

    -- Sicuro eliminare: nessun ordine collegato. History CASCADE via FK se
    -- ci sono righe residue (accettabile: lo stato è stato rimosso
    -- intenzionalmente e non è referenziato da nessun ordine attivo).
    DELETE FROM public.order_statuses WHERE id = v_orphan_status_id;
  END LOOP;

  -- Step 3: restituisci lista aggiornata
  RETURN QUERY
    SELECT os.id, os.company_id, os.name, os.icon, os.color,
           os.position, os.is_default, os.is_support_phase, os.created_at
    FROM public.order_statuses os
    WHERE os.company_id = p_company_id
    ORDER BY os.position;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cg_get_ce_mensile(p_company_id uuid DEFAULT NULL::uuid, p_anno integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
 RETURNS TABLE(mese integer, ricavi numeric, ricavi_cum numeric, costi_var numeric, costi_var_cum numeric, costi_fissi numeric, costi_fissi_cum numeric, costi_totali_cum numeric, bep_cum numeric, raggiunto boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_company_id uuid;
  v_bep numeric;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id non risolvibile';
  END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  SELECT (public.cg_get_bep(v_company_id, p_anno) ->> 'bep_fatturato_minimo')::numeric INTO v_bep;

  RETURN QUERY
  WITH mesi AS (SELECT generate_series(1,12) AS m),
  agg AS (
    SELECT m.m AS mese,
      COALESCE((SELECT sum(importo_imponibile) FROM public.v_cg_ricavi_classificati
                 WHERE company_id = v_company_id AND anno = p_anno AND mese = m.m), 0) AS ric,
      COALESCE((SELECT sum(importo) FROM public.v_cg_costi_classificati
                 WHERE company_id = v_company_id AND anno = p_anno AND mese = m.m AND tipo = 'V'), 0) AS cv,
      COALESCE((SELECT sum(importo) FROM public.v_cg_costi_classificati
                 WHERE company_id = v_company_id AND anno = p_anno AND mese = m.m AND tipo = 'F'), 0) AS cf
    FROM mesi m
  )
  SELECT a.mese,
         a.ric,
         sum(a.ric) OVER (ORDER BY a.mese) AS ricavi_cum,
         a.cv,
         sum(a.cv)  OVER (ORDER BY a.mese) AS costi_var_cum,
         a.cf,
         sum(a.cf)  OVER (ORDER BY a.mese) AS costi_fissi_cum,
         sum(a.cv + a.cf) OVER (ORDER BY a.mese) AS costi_totali_cum,
         v_bep AS bep_cum,
         (sum(a.ric) OVER (ORDER BY a.mese)) >= COALESCE(v_bep, 0) AS raggiunto
  FROM agg a
  ORDER BY a.mese;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_map_points_bbox(p_company uuid, p_min_lat double precision, p_min_lng double precision, p_max_lat double precision, p_max_lng double precision, p_limit integer DEFAULT 2000)
 RETURNS TABLE(id text, tipo text, nome text, categoria text, stato text, temperatura text, fatturato numeric, email text, telefono text, citta text, provincia text, regione text, indirizzo text, lat double precision, lng double precision, precise boolean, attivita jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  if not public.is_super_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  return query
  with cli as (
    select contact_id from public.aedix_service_clients where contact_id is not null
    union
    select contact_id from public.marketing_opportunities where contact_id is not null and status = 'won'
  ),
  base as (
    select ('comp-'||c.id) as id, 'cliente' as tipo,
           coalesce(c.business_name, c.name, 'Azienda') as nome, c.vertical as categoria, c.status as stato, null::text as temperatura,
           null::numeric as fatturato, c.email, c.phone as telefono,
           coalesce(c.operational_city, c.legal_city) as citta,
           coalesce(c.operational_province, c.legal_province) as provincia, c.region as regione, null::text as indirizzo,
           coalesce(c.operational_lat, cc.lat, pc.lat) as blat,
           coalesce(c.operational_lng, cc.lng, pc.lng) as blng,
           (c.operational_lat is not null) as precise,
           (c.operational_lat is null and cc.lat is not null) as cap_level,
           '{}'::jsonb as attivita
    from public.companies c
    left join public.crm_cap_centroids cc on cc.cap = coalesce(c.operational_postal_code, c.legal_postal_code)
      and (coalesce(c.operational_province, c.legal_province) is null or cc.sigla = upper(coalesce(c.operational_province, c.legal_province)))
    left join public.crm_province_centroids pc on pc.sigla = upper(coalesce(c.operational_province, c.legal_province))
    where c.is_platform_admin_company is not true
    union all
    select ('mkt-'||m.id),
           case when cl.contact_id is not null
                  or m.contact_type in ('client','cliente','customer')
                  or lower(coalesce(m.stato,'')) like 'client%'
                then 'cliente' else 'prospect' end,
           coalesce(m.company_name, nullif(trim(coalesce(m.first_name,'')||' '||coalesce(m.last_name,'')),''), 'Contatto'),
           (m.tags)[1], m.stato, m.ai_score_tier,
           m.fatturato, m.email, m.phone, m.city, m.province, m.region, m.address,
           coalesce(m.lat, cc.lat, pc.lat), coalesce(m.lng, cc.lng, pc.lng),
           (m.lat is not null), (m.lat is null and cc.lat is not null),
           coalesce((select jsonb_object_agg(x.at, x.c)
                     from (select activity_type as at, count(*) as c
                           from public.marketing_contact_activities a
                           where a.contact_id = m.id group by 1) x), '{}'::jsonb)
    from public.marketing_contacts m
    left join cli cl on cl.contact_id = m.id
    left join public.crm_cap_centroids cc on cc.cap = m.postal_code
      and (m.province is null or cc.sigla = upper(m.province))
    left join public.crm_province_centroids pc on pc.sigla = upper(m.province)
    where m.company_id = p_company
  ),
  j as (
    select b.*,
      case when b.precise then 0.0 when b.cap_level then 0.012 else 0.045 end as r_max,
      (((hashtext(b.id) % 10000) + 10000) % 10000) / 10000.0 as h_ang,
      (((hashtext(b.id||'r') % 10000) + 10000) % 10000) / 10000.0 as h_rad
    from base b
    where b.blat is not null and b.blng is not null
  ),
  jj as (
    select id, tipo, nome, categoria, stato, temperatura, fatturato, email, telefono, citta, provincia, regione, indirizzo, precise, attivita,
      blat + sqrt(h_rad) * r_max * cos(2*pi()*h_ang) as lat,
      blng + sqrt(h_rad) * r_max * sin(2*pi()*h_ang) / greatest(cos(radians(blat)), 0.3) as lng
    from j
  )
  select id, tipo, nome, categoria, stato, temperatura, fatturato, email, telefono, citta, provincia, regione, indirizzo, lat, lng, precise, attivita
  from jj
  where lat between p_min_lat and p_max_lat and lng between p_min_lng and p_max_lng
  limit p_limit;
end; $function$;

CREATE OR REPLACE FUNCTION public.ddt_find_purchase_order_candidates(p_company_id uuid, p_supplier_id uuid, p_ddt_total_eur numeric DEFAULT NULL::numeric, p_ddt_date date DEFAULT NULL::date)
 RETURNS TABLE(purchase_order_id uuid, oda_number text, status text, issue_date date, expected_delivery_date date, total_eur numeric, amount_match_score numeric, date_match_score numeric, order_id uuid, order_description text, customer_id uuid, combined_score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN QUERY

  WITH base AS (
    SELECT
      po.id,
      po.oda_number,
      po.status,
      po.issue_date,
      po.expected_delivery_date,
      po.total::numeric AS total_eur,
      po.order_id,
      o.description AS order_description,
      o.customer_id,
      -- Importo: 1 se entro ±5%, 0.5 se entro ±15%, 0 altrimenti
      CASE
        WHEN p_ddt_total_eur IS NULL OR po.total IS NULL OR po.total = 0 THEN NULL
        WHEN abs(po.total::numeric - p_ddt_total_eur) / GREATEST(po.total::numeric, 1) <= 0.05 THEN 1.0
        WHEN abs(po.total::numeric - p_ddt_total_eur) / GREATEST(po.total::numeric, 1) <= 0.15 THEN 0.5
        ELSE 0.0
      END::numeric AS amount_match,
      -- Date: 1 se DDT entro ±15gg da expected_delivery (o issue se manca)
      CASE
        WHEN p_ddt_date IS NULL THEN NULL
        WHEN coalesce(po.expected_delivery_date, po.issue_date) IS NULL THEN NULL
        WHEN abs(p_ddt_date - coalesce(po.expected_delivery_date, po.issue_date)) <= 15 THEN 1.0
        WHEN abs(p_ddt_date - coalesce(po.expected_delivery_date, po.issue_date)) <= 60 THEN 0.5
        ELSE 0.0
      END::numeric AS date_match
    FROM public.purchase_orders po
    LEFT JOIN public.orders o ON o.id = po.order_id
    WHERE po.company_id = p_company_id
      AND po.supplier_id = p_supplier_id
      AND po.status IN ('inviato', 'confermato', 'parziale')
  )
  SELECT
    id, oda_number, status, issue_date, expected_delivery_date, total_eur,
    amount_match, date_match,
    order_id, order_description, customer_id,
    -- Combined: pesi 0.5/0.3/0.2 su (status, amount, date). Status open = 0.6 base.
    (0.6
      + 0.25 * coalesce(amount_match, 0.5)
      + 0.15 * coalesce(date_match, 0.5))::numeric AS combined_score
  FROM base
  ORDER BY combined_score DESC
  LIMIT 5
;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ddt_find_supplier_candidates(p_company_id uuid, p_vat_number text, p_name text)
 RETURNS TABLE(supplier_id uuid, supplier_name text, vat_number text, match_kind text, score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN QUERY

  WITH exact_vat AS (
    SELECT s.id, s.name, s.vat_number, 'vat_exact'::text AS kind, 1.0::numeric AS score
    FROM public.suppliers s
    WHERE s.company_id = p_company_id
      AND p_vat_number IS NOT NULL
      AND length(trim(p_vat_number)) >= 6
      AND regexp_replace(coalesce(s.vat_number, ''), '\s', '', 'g') =
          regexp_replace(p_vat_number, '\s', '', 'g')
  ),
  fuzzy AS (
    SELECT s.id, s.name, s.vat_number,
           CASE
             WHEN s.name ILIKE '%' || p_name || '%' THEN 'name_ilike'
             ELSE 'name_fuzzy'
           END AS kind,
           GREATEST(
             similarity(lower(s.name), lower(coalesce(p_name, ''))),
             CASE WHEN s.name ILIKE '%' || p_name || '%' THEN 0.85 ELSE 0 END
           )::numeric AS score
    FROM public.suppliers s
    WHERE s.company_id = p_company_id
      AND p_name IS NOT NULL
      AND length(trim(p_name)) >= 3
      AND s.id NOT IN (SELECT id FROM exact_vat)
      AND (
        s.name ILIKE '%' || p_name || '%'
        OR similarity(lower(s.name), lower(p_name)) > 0.4
      )
  )
  SELECT id, name, vat_number, kind, score FROM exact_vat
  UNION ALL
  SELECT id, name, vat_number, kind, score FROM fuzzy
  ORDER BY score DESC
  LIMIT 5
;
END;
$function$;

CREATE OR REPLACE FUNCTION public.email_ai_cascade_stats(p_days integer DEFAULT 30)
 RETURNS TABLE(totale bigint, da_regola bigint, da_haiku bigint, da_manuale bigint, da_rivedere bigint, non_classificate bigint, perc_l1 numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.get_effective_company_id();
  RETURN QUERY
  SELECT
    count(*)::bigint AS totale,
    count(*) FILTER (WHERE classificato_da = 'regola')::bigint AS da_regola,
    count(*) FILTER (WHERE classificato_da = 'haiku')::bigint AS da_haiku,
    count(*) FILTER (WHERE classificato_da = 'manuale')::bigint AS da_manuale,
    count(*) FILTER (WHERE da_rivedere = true)::bigint AS da_rivedere,
    count(*) FILTER (WHERE categoria IS NULL)::bigint AS non_classificate,
    CASE WHEN count(*) > 0
      THEN ROUND(100.0 * count(*) FILTER (WHERE classificato_da = 'regola') / count(*), 1)
      ELSE 0
    END AS perc_l1
  FROM public.email_inbox
  WHERE company_id = v_company_id
    AND received_at > now() - (p_days || ' days')::interval;
END $function$;
