-- ============================================================================
-- FIX: Computo Metrico AI — missing policies, indexes, constraints
-- ============================================================================

-- ── Missing indexes on FK columns ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_computo_uploads_quote ON computo_uploads(quote_id);
CREATE INDEX IF NOT EXISTS idx_quotes_computo_upload ON quotes(computo_upload_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_computo_voce ON quote_items(computo_voce_id);
CREATE INDEX IF NOT EXISTS idx_prezzari_company ON prezzari(company_id);

-- ── UPDATE policies: add WITH CHECK to prevent company_id tampering ──────────
DROP POLICY IF EXISTS "computo_uploads_update" ON computo_uploads;
CREATE POLICY "computo_uploads_update" ON computo_uploads FOR UPDATE
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "computo_voci_update" ON computo_voci_estratte;
CREATE POLICY "computo_voci_update" ON computo_voci_estratte FOR UPDATE
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ── Missing prezzari UPDATE/DELETE policies ──────────────────────────────────
CREATE POLICY "prezzari_update" ON prezzari FOR UPDATE
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "prezzari_delete" ON prezzari FOR DELETE
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ── Missing prezzario_voci INSERT/UPDATE/DELETE policies ─────────────────────
CREATE POLICY "prezzario_voci_insert" ON prezzario_voci FOR INSERT
  WITH CHECK (prezzario_id IN (
    SELECT id FROM prezzari WHERE company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "prezzario_voci_update" ON prezzario_voci FOR UPDATE
  USING (prezzario_id IN (
    SELECT id FROM prezzari WHERE company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "prezzario_voci_delete" ON prezzario_voci FOR DELETE
  USING (prezzario_id IN (
    SELECT id FROM prezzari WHERE company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ));

-- ── extraction_method CHECK: add pdf_vision as valid for image file_type ─────
-- The existing CHECK already includes pdf_vision which works for images too.
-- No change needed.

-- ── Fix uploaded_by FK: allow user deletion ──────────────────────────────────
ALTER TABLE computo_uploads ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE computo_uploads DROP CONSTRAINT IF EXISTS computo_uploads_uploaded_by_fkey;
ALTER TABLE computo_uploads ADD CONSTRAINT computo_uploads_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
