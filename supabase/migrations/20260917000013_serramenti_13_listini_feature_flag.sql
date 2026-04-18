-- Preventivatore Verticalizzato Serramentisti — FASE 12 (Listini Avanzati)
--
-- STEP 0: Registra il feature flag 'listini_serramenti_avanzati' nel sistema
-- esistente platform_feature_flags. Tutto il modulo nuovo (catalogo tipologie,
-- fornitori, linee prodotto, editor matrice, import Excel/PDF, assi colore/vetro,
-- sconto+ricarico, escalator) è gated da questo flag.
--
-- Default: false (opt-in). Gli amministratori piattaforma attivano per le
-- aziende del vertical serramentista via override.
--
-- Idempotente (ON CONFLICT DO UPDATE).

INSERT INTO public.platform_feature_flags (
  key, name, description, category, is_beta, default_value,
  plans_included, icon, sort_order
) VALUES (
  'listini_serramenti_avanzati',
  'Listini Serramenti Avanzati',
  'Catalogo tipologie infissi (finestre, porte, scorrevoli), gestione fornitori con sconto+ricarico, assi configurativi (colore, vetro, telaio, profilo), editor matrice e import Excel/PDF. Collegato solo alla generazione preventivi del vertical serramentista, non tocca altre funzionalità.',
  'marketing',
  true,
  false,
  ARRAY[]::text[],
  'blinds',
  120
) ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  is_beta     = EXCLUDED.is_beta,
  icon        = EXCLUDED.icon;

COMMENT ON COLUMN public.platform_feature_flags.key IS
  'Feature flag chiave. Nuovo: listini_serramenti_avanzati (vertical serramentista).';
