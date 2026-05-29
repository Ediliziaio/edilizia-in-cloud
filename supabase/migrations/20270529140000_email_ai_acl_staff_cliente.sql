-- ════════════════════════════════════════════════════════════════════════════
-- MP-EMAIL-AI · Decisioni Florin (MP-00 §6) — ACL staff interno + entità cliente
-- ────────────────────────────────────────────────────────────────────────────
-- Decisione (a) VISIBILITÀ: casella aziendale condivisa (user_id IS NULL) visibile
--   allo STAFF INTERNO = super_admin + company_admin + worker. customer/subcontractor
--   (e ogni altro ruolo, es. accountant) ESCLUSI. Email personali (user_id) sempre
--   solo al proprietario. Whitelist, non blacklist.
-- Decisione (b) ENTITÀ CLIENTE: i clienti vivono in `anagrafiche_native`
--   (tipo cliente|entrambi). Il view risolve il nome cliente da lì.
-- Decisione (c) EMBEDDING: OpenAI text-embedding-3-small confermato → nessuna modifica.
--
-- FIX SICUREZZA: le RPC MP-04 (SECURITY DEFINER) filtravano solo per company_id +
--   is_personale, quindi restituivano (1) le email personali di ALTRI utenti e
--   (2) la casella condivisa anche a ruoli esterni. Ora rispettano la stessa
--   visibilità della RLS tabella + decisione staff interno.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Helper "staff interno" (whitelist). SECURITY DEFINER per leggere user_roles.
--    NB: 'worker' è la scelta esplicita di Florin (MP-00 §6a). Oggi NESSUN utente ha
--    il ruolo 'worker' → l'effetto attuale = solo admin (status quo, sicuro). Se in
--    futuro si vorranno includere company_staff/employee/salesperson, aggiungerli qui.
CREATE OR REPLACE FUNCTION public.is_email_staff_interno()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(auth.uid())
      OR public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'worker'::public.app_role);
$$;
GRANT EXECUTE ON FUNCTION public.is_email_staff_interno() TO authenticated, service_role;

-- 2. RLS tabella email_inbox: casella condivisa ora include i worker (staff interno).
--    Le email personali (user_id) restano private al proprietario. Solo SELECT cambia.
DROP POLICY IF EXISTS "email_inbox_select" ON public.email_inbox;
CREATE POLICY "email_inbox_select" ON public.email_inbox
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      user_id IS NULL
      AND company_id = public.get_my_company_id()
      AND public.is_email_staff_interno()
    )
  );

-- 3. RPC MP-04: stessa visibilità della RLS (proprie OR condivise+staff), mai personali altrui.
CREATE OR REPLACE FUNCTION public.email_semantic_search(p_query_embedding vector(1536), p_limit int DEFAULT 20)
RETURNS TABLE (email_id uuid, thread_id uuid, subject text, from_email text, received_at timestamptz, categoria text, score numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company_id uuid; v_staff boolean;
BEGIN
  v_company_id := public.get_effective_company_id();
  IF v_company_id IS NULL THEN RETURN; END IF;
  v_staff := public.is_email_staff_interno();
  RETURN QUERY
  SELECT e.id, e.thread_id, e.subject, e.from_email, e.received_at,
         COALESCE(e.categoria::text, e.ai_category, 'altro'),
         ROUND((1 - (e.embedding <=> p_query_embedding))::numeric, 4)
  FROM public.email_inbox e
  WHERE e.company_id = v_company_id AND e.embedding IS NOT NULL AND e.is_personale = false AND e.is_trashed = false
    AND (e.user_id = auth.uid() OR (e.user_id IS NULL AND v_staff))
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT LEAST(p_limit, 50);
END $$;
GRANT EXECUTE ON FUNCTION public.email_semantic_search(vector, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.email_structured_search(p_entita_nome text DEFAULT NULL, p_categoria text DEFAULT NULL, p_da date DEFAULT NULL, p_a date DEFAULT NULL, p_limit int DEFAULT 50)
RETURNS TABLE (email_id uuid, thread_id uuid, subject text, from_email text, received_at timestamptz, categoria text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company_id uuid; v_staff boolean;
BEGIN
  v_company_id := public.get_effective_company_id();
  IF v_company_id IS NULL THEN RETURN; END IF;
  v_staff := public.is_email_staff_interno();
  RETURN QUERY
  SELECT e.id, e.thread_id, e.subject, e.from_email, e.received_at, COALESCE(e.categoria::text, e.ai_category, 'altro')
  FROM public.email_inbox e
  WHERE e.company_id = v_company_id AND e.is_trashed = false AND e.is_personale = false
    AND (e.user_id = auth.uid() OR (e.user_id IS NULL AND v_staff))
    AND (p_entita_nome IS NULL OR e.from_email ILIKE '%'||p_entita_nome||'%' OR e.from_name ILIKE '%'||p_entita_nome||'%' OR e.subject ILIKE '%'||p_entita_nome||'%')
    AND (p_categoria IS NULL OR e.categoria::text = p_categoria OR e.ai_category = p_categoria)
    AND (p_da IS NULL OR e.received_at >= p_da)
    AND (p_a IS NULL OR e.received_at < (p_a + 1))
  ORDER BY e.received_at DESC
  LIMIT LEAST(p_limit, 100);
END $$;
GRANT EXECUTE ON FUNCTION public.email_structured_search(text, text, date, date, int) TO authenticated, service_role;
-- (anon resta revocato dal precedente hardening — CREATE OR REPLACE non ripristina grant.)

-- 4. View classificata: aggiunge il nome cliente da anagrafiche_native (decisione b).
--    Resta security_invoker = true (rispetta la RLS di chi interroga).
CREATE OR REPLACE VIEW public.v_email_inbox_classified
WITH (security_invoker = true) AS
SELECT
  e.*,
  COALESCE(e.categoria::text, e.ai_category, 'altro') AS categoria_ui,
  CASE e.entita_tipo
    WHEN 'fornitore' THEN (SELECT s.name FROM public.suppliers s WHERE s.id = e.entita_id AND s.company_id = e.company_id)
    WHEN 'operaio'   THEN (SELECT trim(concat_ws(' ', emp.first_name, emp.last_name)) FROM public.employees emp WHERE emp.id = e.entita_id AND emp.company_id = e.company_id)
    WHEN 'cliente'   THEN (SELECT COALESCE(NULLIF(trim(a.ragione_sociale), ''), trim(concat_ws(' ', a.nome, a.cognome))) FROM public.anagrafiche_native a WHERE a.id = e.entita_id AND a.company_id = e.company_id)
    ELSE NULL
  END AS entita_nome
FROM public.email_inbox e;
GRANT SELECT ON public.v_email_inbox_classified TO authenticated;

COMMENT ON FUNCTION public.is_email_staff_interno() IS 'MP-EMAIL-AI §6(a): staff interno = super_admin|company_admin|worker. Whitelist per visibilità casella condivisa.';
