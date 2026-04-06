-- ════════════════════════════════════════════════════════════════════════════════
-- FIX RLS: Isolamento dati HR — timbrature, ferie, cedolini, profili
-- Ogni dipendente vede SOLO i propri dati. Admin vedono tutto il team.
-- ════════════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════
-- 1. hr_timbrature
-- ══════════════════════════════════════

-- Rimuovi la policy permissiva FOR ALL (company-wide) — causa RLS GAP via OR
DROP POLICY IF EXISTS "hr_timbrature_own_company" ON public.hr_timbrature;

-- Admin: company_admin e super_admin vedono/gestiscono tutto il team
CREATE POLICY "hr_timbrature_admin"
ON public.hr_timbrature FOR ALL TO authenticated
USING (
  company_id = public.get_my_company_id()
  AND (
    public.has_role(auth.uid(), 'company_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
)
WITH CHECK (
  company_id = public.get_my_company_id()
  AND (
    public.has_role(auth.uid(), 'company_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
);

-- Dipendente: SELECT solo le proprie timbrature
DROP POLICY IF EXISTS "hr_timbrature_self_read" ON public.hr_timbrature;
CREATE POLICY "hr_timbrature_self_read"
ON public.hr_timbrature FOR SELECT TO authenticated
USING (profilo_id IN (
  SELECT id FROM public.hr_profili WHERE user_id = auth.uid()
));

-- Dipendente: INSERT solo per sé stesso
CREATE POLICY "hr_timbrature_self_insert"
ON public.hr_timbrature FOR INSERT TO authenticated
WITH CHECK (profilo_id IN (
  SELECT id FROM public.hr_profili WHERE user_id = auth.uid()
));

-- Dipendente: UPDATE solo le proprie (es. correzioni)
CREATE POLICY "hr_timbrature_self_update"
ON public.hr_timbrature FOR UPDATE TO authenticated
USING (profilo_id IN (
  SELECT id FROM public.hr_profili WHERE user_id = auth.uid()
));


-- ══════════════════════════════════════
-- 2. hr_richieste (ferie, permessi, ROL)
-- ══════════════════════════════════════

-- Rimuovi policy permissiva FOR ALL
DROP POLICY IF EXISTS "hr_richieste_own_company" ON public.hr_richieste;

-- Admin: vede e gestisce tutte le richieste dell'azienda
CREATE POLICY "hr_richieste_admin"
ON public.hr_richieste FOR ALL TO authenticated
USING (
  company_id = public.get_my_company_id()
  AND (
    public.has_role(auth.uid(), 'company_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
)
WITH CHECK (
  company_id = public.get_my_company_id()
  AND (
    public.has_role(auth.uid(), 'company_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
);

-- Dipendente: SELECT solo le proprie richieste
DROP POLICY IF EXISTS "hr_richieste_self" ON public.hr_richieste;
CREATE POLICY "hr_richieste_self_read"
ON public.hr_richieste FOR SELECT TO authenticated
USING (profilo_id IN (
  SELECT id FROM public.hr_profili WHERE user_id = auth.uid()
));

-- Dipendente: INSERT solo per sé stesso
CREATE POLICY "hr_richieste_self_insert"
ON public.hr_richieste FOR INSERT TO authenticated
WITH CHECK (profilo_id IN (
  SELECT id FROM public.hr_profili WHERE user_id = auth.uid()
));

-- Dipendente: UPDATE solo le proprie (es. annulla richiesta propria)
CREATE POLICY "hr_richieste_self_update"
ON public.hr_richieste FOR UPDATE TO authenticated
USING (profilo_id IN (
  SELECT id FROM public.hr_profili WHERE user_id = auth.uid()
));


-- ══════════════════════════════════════
-- 3. cedolini — CRITICO (dati sensibili stipendi)
-- ══════════════════════════════════════

-- Rimuovi policy permissiva: tutti i dipendenti vedevano tutti i cedolini dell'azienda
DROP POLICY IF EXISTS "cedolini_company_access" ON public.cedolini;

-- Admin: può creare, leggere, modificare, eliminare cedolini dell'azienda
CREATE POLICY "cedolini_admin"
ON public.cedolini FOR ALL TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
  )
  AND (
    public.has_role(auth.uid(), 'company_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
)
WITH CHECK (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
  )
  AND (
    public.has_role(auth.uid(), 'company_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
);

-- Dipendente: SELECT solo il proprio cedolino (employee_id = auth.uid() per profili moderni)
CREATE POLICY "cedolini_self_read"
ON public.cedolini FOR SELECT TO authenticated
USING (employee_id = auth.uid());

-- Fallback: employee_id legacy — cerca tramite il record employees collegato al profilo
CREATE POLICY "cedolini_self_read_via_employee"
ON public.cedolini FOR SELECT TO authenticated
USING (employee_id IN (
  SELECT id FROM public.employees WHERE user_id = auth.uid()
));


-- ══════════════════════════════════════
-- 4. hr_profili — restringe INSERT/UPDATE
-- ══════════════════════════════════════
-- La policy own_company FOR ALL consente a qualsiasi dipendente di modificare
-- il profilo di un collega. Restringiamo: admin gestiscono tutto, dipendente
-- può leggere/aggiornare solo il proprio.

DROP POLICY IF EXISTS "hr_profili_own_company" ON public.hr_profili;

-- Admin: gestisce tutti i profili dell'azienda
CREATE POLICY "hr_profili_admin"
ON public.hr_profili FOR ALL TO authenticated
USING (
  company_id = public.get_my_company_id()
  AND (
    public.has_role(auth.uid(), 'company_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
)
WITH CHECK (
  company_id = public.get_my_company_id()
  AND (
    public.has_role(auth.uid(), 'company_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
);

-- Dipendente: SELECT solo il proprio profilo (già era self_read, confermato)
DROP POLICY IF EXISTS "hr_profili_self_read" ON public.hr_profili;
CREATE POLICY "hr_profili_self_read"
ON public.hr_profili FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Dipendente: UPDATE solo il proprio profilo (es. aggiorna IBAN, recapiti)
CREATE POLICY "hr_profili_self_update"
ON public.hr_profili FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
