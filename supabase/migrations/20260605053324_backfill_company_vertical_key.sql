-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

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
