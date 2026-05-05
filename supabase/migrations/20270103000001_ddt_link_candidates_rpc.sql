-- ════════════════════════════════════════════════════════════════════════════
-- TRACK 9 — DDT Link Candidates (Layer 1 + Layer 2)
-- ════════════════════════════════════════════════════════════════════════════
-- RPC che dato un DDT estratto (P.IVA mittente, ragione sociale, importo,
-- numero righe, data) restituisce candidati ranked di:
--   - supplier match (esatto P.IVA / fuzzy ragione sociale)
--   - purchase_orders aperti del supplier (status non chiuso)
--   - eventuale order/commessa associata
--
-- Layer 1 (deterministic): match P.IVA → score 1.0
-- Layer 2 (fuzzy):          match name via pg_trgm similarity → score 0..1
-- Layer 3 (AI):             ranking finale fatto dall'edge function
--
-- Estendibile poi a fattura, polizza, ecc. con altre RPC.
-- ════════════════════════════════════════════════════════════════════════════

-- pg_trgm necessario per fuzzy match. È solitamente già attivo su Supabase.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Trova fornitore candidato dato P.IVA o ragione sociale ──────────────
CREATE OR REPLACE FUNCTION public.ddt_find_supplier_candidates(
  p_company_id uuid,
  p_vat_number text,
  p_name text
)
RETURNS TABLE (
  supplier_id uuid,
  supplier_name text,
  vat_number text,
  match_kind text,         -- 'vat_exact' | 'name_fuzzy' | 'name_ilike'
  score numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.ddt_find_supplier_candidates(uuid, text, text) TO authenticated, service_role;

-- ─── Trova OdA aperti del fornitore + commessa associata ─────────────────
CREATE OR REPLACE FUNCTION public.ddt_find_purchase_order_candidates(
  p_company_id uuid,
  p_supplier_id uuid,
  p_ddt_total_eur numeric DEFAULT NULL,
  p_ddt_date date DEFAULT NULL
)
RETURNS TABLE (
  purchase_order_id uuid,
  oda_number text,
  status text,
  issue_date date,
  expected_delivery_date date,
  total_eur numeric,
  amount_match_score numeric,
  date_match_score numeric,
  order_id uuid,
  order_description text,
  customer_id uuid,
  combined_score numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.ddt_find_purchase_order_candidates(uuid, uuid, numeric, date) TO authenticated, service_role;

-- ─── Helper: fetch policy per tipo doc ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_link_policy(p_doc_type text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'doc_type', p.doc_type,
    'auto_execute_threshold', p.auto_execute_threshold,
    'always_confirm', p.always_confirm,
    'show_alternatives', p.show_alternatives
  )
  FROM public.document_link_policy p
  WHERE p.doc_type = p_doc_type
  UNION ALL
  SELECT jsonb_build_object(
    'doc_type', p_doc_type,
    'auto_execute_threshold', 1.0,
    'always_confirm', true,
    'show_alternatives', true
  )
  WHERE NOT EXISTS (SELECT 1 FROM public.document_link_policy WHERE doc_type = p_doc_type)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_link_policy(text) TO authenticated, service_role;
