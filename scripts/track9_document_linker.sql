-- ════════════════════════════════════════════════════════════════════════════
-- TRACK 9 — Document Linker Foundation
-- ════════════════════════════════════════════════════════════════════════════
-- Tre tabelle complementari per il "cervello che collega":
--   1. entity_attachments (polimorfica): un documento allegato a UN record
--      qualsiasi (purchase_orders, orders, suppliers, ecc.)
--   2. document_link_suggestions: ranking dei candidati che il Linker ha
--      considerato + score, in modo da poter mostrare alternative se l'utente
--      vuole ribaltare l'auto-link
--   3. document_link_policy: policy per tipo doc (auto-execute soglia, sempre
--      conferma, ecc.) — modificabile dal super_admin senza redeploy.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. entity_attachments (polimorfica) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.entity_attachments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Polimorfico: a quale entità è allegato
  entity_table        text NOT NULL,    -- es. 'purchase_orders', 'orders', 'suppliers', 'customers'
  entity_id           uuid NOT NULL,

  -- Riferimento al file fisico
  storage_bucket      text NOT NULL DEFAULT 'documenti-smart',
  storage_path        text NOT NULL,
  file_name           text NOT NULL,
  file_size           bigint,
  mime_type           text,

  -- Classificazione AI (snapshot)
  doc_type            text,
  doc_subtype         text,
  ai_payload          jsonb DEFAULT '{}'::jsonb,

  -- Audit
  attached_by         uuid NOT NULL REFERENCES auth.users(id),
  attached_at         timestamptz NOT NULL DEFAULT now(),
  ai_suggested        boolean NOT NULL DEFAULT false,
  user_confirmed      boolean NOT NULL DEFAULT false,
  link_confidence     numeric(4,3),
  link_reasoning      text,

  -- Soft delete
  deleted_at          timestamptz,
  deleted_by          uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_entity_attachments_entity
  ON public.entity_attachments(entity_table, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entity_attachments_company
  ON public.entity_attachments(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entity_attachments_doc_type
  ON public.entity_attachments(doc_type) WHERE deleted_at IS NULL;

ALTER TABLE public.entity_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_attachments_select" ON public.entity_attachments;
CREATE POLICY "entity_attachments_select"
  ON public.entity_attachments FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR company_id IN (SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "entity_attachments_modify" ON public.entity_attachments;
CREATE POLICY "entity_attachments_modify"
  ON public.entity_attachments FOR ALL TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

COMMENT ON TABLE public.entity_attachments IS
  'Document Linker: polymorphic table to attach a document_uploads to any entity (purchase_orders, orders, suppliers, customers, ...)';

-- ─── 2. document_link_suggestions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_link_suggestions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Riferimento al doc analizzato (può puntare a storage path se non c'è ancora doc_upload)
  storage_bucket      text NOT NULL,
  storage_path        text NOT NULL,
  file_name           text NOT NULL,
  doc_type            text NOT NULL,

  -- Candidato suggerito
  candidate_entity_table  text NOT NULL,
  candidate_entity_id     uuid NOT NULL,
  candidate_label         text NOT NULL,    -- "OdA #PO-2026-0042 — IV Group, €1.220"
  candidate_summary       jsonb DEFAULT '{}'::jsonb,

  -- Scoring layered
  layer1_deterministic_match boolean DEFAULT false,    -- P.IVA / numero univoco
  layer2_fuzzy_score         numeric(4,3),             -- pg_trgm 0-1
  layer3_ai_score            numeric(4,3),             -- AI ranking 0-1
  combined_score             numeric(4,3) NOT NULL,    -- ponderato finale
  reasoning                  text,                     -- spiegazione AI

  -- Esito
  rank                  integer NOT NULL,              -- 1 = top
  user_chosen           boolean DEFAULT false,
  auto_executed         boolean DEFAULT false,
  rejected              boolean DEFAULT false,
  resulting_attachment_id uuid REFERENCES public.entity_attachments(id) ON DELETE SET NULL,

  created_at            timestamptz NOT NULL DEFAULT now(),
  decided_at            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_link_suggestions_company
  ON public.document_link_suggestions(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_suggestions_doc_type
  ON public.document_link_suggestions(doc_type);

ALTER TABLE public.document_link_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "link_suggestions_company" ON public.document_link_suggestions;
CREATE POLICY "link_suggestions_company"
  ON public.document_link_suggestions FOR ALL TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- ─── 3. document_link_policy (per tipo doc) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_link_policy (
  doc_type              text PRIMARY KEY,
  auto_execute_threshold numeric(4,3) DEFAULT 0.90,    -- soglia per auto-link senza chiedere
  always_confirm        boolean NOT NULL DEFAULT false, -- se true, MAI auto: sempre conferma
  show_alternatives     boolean NOT NULL DEFAULT true,
  notes                 text,
  updated_at            timestamptz DEFAULT now(),
  updated_by            uuid REFERENCES auth.users(id)
);

ALTER TABLE public.document_link_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "link_policy_read" ON public.document_link_policy;
CREATE POLICY "link_policy_read"
  ON public.document_link_policy FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "link_policy_admin_write" ON public.document_link_policy;
CREATE POLICY "link_policy_admin_write"
  ON public.document_link_policy FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ─── Seed policy iniziale (decisione utente: Opzione 3 — configurable) ────
INSERT INTO public.document_link_policy (doc_type, auto_execute_threshold, always_confirm, notes) VALUES
  -- AUTO se confidence > 0.9: rischio basso, alto volume
  ('ddt',                   0.90, false, 'DDT auto-link a OdA aperto se P.IVA fornitore esatta + score >= 0.9'),
  ('foto_cantiere',         0.85, false, 'Foto auto-link a cantiere se geo + match nome'),
  ('foto_generale',         0.85, false, 'Foto generica auto-link a soggetto principale se confidente'),
  ('biglietto_visita',      0.92, false, 'Auto-merge contatto se email/tel univoci'),
  ('scheda_tecnica',        0.85, false, 'Auto-link a fornitore + categoria prodotto'),
  ('listino_prezzi',        0.85, false, 'Auto-link a fornitore esistente'),
  ('tabella_finanziamento', 0.85, false, 'Auto-link a preventivo/contratto cliente se importo esatto'),

  -- SEMPRE CONFERMA: effetti contabili/legali
  ('fattura',               0.95, true,  'Sempre conferma — effetti contabili'),
  ('contratto',             0.95, true,  'Sempre conferma — effetti legali'),
  ('polizza_assicurativa',  0.95, true,  'Sempre conferma — effetti legali/assicurativi'),
  ('verbale_collaudo',      0.95, true,  'Sempre conferma — effetti legali su SAL/saldo'),
  ('ricevuta',              0.95, true,  'Sempre conferma — effetti contabili'),
  ('preventivo',            0.95, true,  'Sempre conferma — gestito già da modulo preventivi'),
  ('computo_metrico',       0.95, true,  'Sempre conferma — gestito da computo modal'),

  -- INFORMATIVO: privacy / non-actionable
  ('documento_pa',          0.90, true,  'PA: conferma per dati sensibili'),
  ('documento_identita',    1.00, true,  'Privacy: mai auto-link'),
  ('documento_generico',    0.85, false, 'Generic: auto-link soggetto principale se confidente'),
  ('altro',                 1.00, true,  'Mai auto-link su altro')
ON CONFLICT (doc_type) DO UPDATE SET
  auto_execute_threshold = EXCLUDED.auto_execute_threshold,
  always_confirm = EXCLUDED.always_confirm,
  notes = EXCLUDED.notes,
  updated_at = now();

COMMENT ON TABLE public.document_link_policy IS
  'Policy auto-execute per tipo documento. Modificabile da super_admin senza redeploy.';
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
