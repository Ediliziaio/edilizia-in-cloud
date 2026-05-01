-- Fascicolo subappaltatori: anagrafica estesa, documenti e pagamenti SAL.

ALTER TABLE public.subappaltatori_sicurezza
  ADD COLUMN IF NOT EXISTS piva text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS pec text,
  ADD COLUMN IF NOT EXISTS indirizzo text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS campo_subappaltatore_id uuid REFERENCES public.subappaltatori(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subappaltatori_sicurezza_campo
  ON public.subappaltatori_sicurezza(campo_subappaltatore_id);

ALTER TABLE public.sal_subappaltatori
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_reference text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('subappaltatori-documenti', 'subappaltatori-documenti', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "subappaltatori_documenti_company_read" ON storage.objects;
CREATE POLICY "subappaltatori_documenti_company_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'subappaltatori-documenti'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "subappaltatori_documenti_company_write" ON storage.objects;
CREATE POLICY "subappaltatori_documenti_company_write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'subappaltatori-documenti'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "subappaltatori_documenti_company_update" ON storage.objects;
CREATE POLICY "subappaltatori_documenti_company_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'subappaltatori-documenti'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'subappaltatori-documenti'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "subappaltatori_documenti_company_delete" ON storage.objects;
CREATE POLICY "subappaltatori_documenti_company_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'subappaltatori-documenti'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

DROP VIEW IF EXISTS public.v_subappaltatori_dashboard;

CREATE VIEW public.v_subappaltatori_dashboard AS
SELECT
  ss.id,
  ss.company_id,
  ss.order_id,
  ss.ragione_sociale,
  ss.tipo_lavori,
  ss.responsabile,
  ss.telefono,
  ss.piva,
  ss.email,
  ss.pec,
  ss.indirizzo,
  ss.note,
  ss.campo_subappaltatore_id,
  sc.user_id AS campo_user_id,
  sc.user_email AS campo_user_email,
  COALESCE(sc.is_active, false) AS campo_is_active,
  ss.durc_scadenza,
  cs.id AS contratto_id,
  cs.importo_contrattuale,
  cs.ritenuta_garanzia_pct,
  cs.stato AS stato_contratto,
  COALESCE(SUM(sal.importo_lordo), 0) AS totale_sal_lordo,
  COALESCE(SUM(sal.importo_netto), 0) AS totale_sal_netto,
  COALESCE(SUM(rg.importo) FILTER (WHERE rg.stato = 'trattenuta'), 0) AS ritenute_in_corso,
  COALESCE(SUM(rg.importo) FILTER (WHERE rg.stato = 'svincolata'), 0) AS ritenute_svincolate,
  COALESCE(cs.importo_contrattuale, 0) - COALESCE(SUM(sal.importo_lordo), 0) AS residuo_contrattuale
FROM public.subappaltatori_sicurezza ss
LEFT JOIN public.subappaltatori sc ON sc.id = ss.campo_subappaltatore_id
LEFT JOIN public.contratti_subappalto cs ON cs.subappaltatore_id = ss.id
LEFT JOIN public.sal_subappaltatori sal ON sal.contratto_id = cs.id
LEFT JOIN public.ritenute_garanzia rg ON rg.contratto_id = cs.id
GROUP BY ss.id, cs.id, sc.user_id, sc.user_email, sc.is_active;
