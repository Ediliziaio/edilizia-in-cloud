-- Backfill companies.vertical_key (sistema moderno business_verticals) dalle
-- aziende che hanno solo il `vertical` legacy. Senza questo, le aziende
-- pre-rewire onboarding non ricevono la personalizzazione moderna
-- (personas / KB / render del catalogo via useBusinessVertical).
--
-- Mappa legacy → vertical_key (tutte le key di destinazione esistono in
-- business_verticals → FK companies_vertical_fk soddisfatta).
-- Idempotente: tocca solo le righe con vertical_key ancora NULL.
UPDATE public.companies
SET vertical_key = CASE vertical
  WHEN 'serramentista'    THEN 'serramentisti'
  WHEN 'tetti'            THEN 'tettisti'
  WHEN 'bagno'            THEN 'bagnisti'
  WHEN 'ristrutturazione' THEN 'ristrutturatori_interni'
  WHEN 'fotovoltaico'     THEN 'fotovoltaico'
  WHEN 'tende_da_sole'    THEN 'pergolisti'
  WHEN 'vetrate'          THEN 'serramentisti'
  WHEN 'generico'         THEN 'edili_generaliste'
  WHEN 'clima'            THEN 'edili_generaliste'
  WHEN 'caldaie'          THEN 'edili_generaliste'
  ELSE 'edili_generaliste'
END
WHERE coalesce(is_platform_admin_company, false) = false
  AND vertical IS NOT NULL
  AND vertical_key IS NULL;
