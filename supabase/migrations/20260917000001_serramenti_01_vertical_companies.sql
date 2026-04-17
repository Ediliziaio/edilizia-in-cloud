-- Preventivatore Verticalizzato Serramentisti — FASE 1.1
-- Introduce il concetto di "vertical" sul livello company.
--
-- Decisione architetturale (vedi FASE0_PREVENTIVATORE_SERRAMENTI_ANALISI.md §2.1):
-- il masterprompt prescrive una colonna TEXT dedicata (9 valori) che non coincide
-- con l'enum `company_sector` esistente (8 valori con semantica parziale). Si crea
-- quindi un campo nuovo `vertical` a coesistenza: `sector` resta come è per non
-- rompere codice/viste che già lo leggono.
--
-- Idempotente (IF NOT EXISTS / IF NOT EXISTS sul CHECK via DO block).

-- 1. Colonne nuove
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS vertical TEXT,
  ADD COLUMN IF NOT EXISTS verticals_secondari TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarding_vertical_completed BOOLEAN NOT NULL DEFAULT false;

-- 2. CHECK constraint sul dominio dei valori ammessi (solo 'serramentista' e
--    'generico' sono effettivamente attivabili in UI per FASE 1; gli altri
--    sono "coming soon" ma il DB li accetta già per non dover rifare un ALTER
--    in FASE successive).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companies_vertical_check'
      AND conrelid = 'public.companies'::regclass
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_vertical_check
      CHECK (vertical IS NULL OR vertical IN (
        'serramentista',
        'tetti',
        'bagno',
        'ristrutturazione',
        'tende_da_sole',
        'vetrate',
        'caldaie',
        'clima',
        'generico'
      ));
  END IF;
END$$;

-- 3. Default per aziende esistenti: vertical = 'generico' + onboarding gia'
--    completato (non vogliamo forzare tenant live nel flusso di scelta vertical).
UPDATE public.companies
SET vertical = 'generico',
    onboarding_vertical_completed = true
WHERE vertical IS NULL;

-- 4. Indice parziale per query di filtraggio (es. dashboards/stats)
CREATE INDEX IF NOT EXISTS idx_companies_vertical
  ON public.companies(vertical)
  WHERE vertical IS NOT NULL;

-- 5. Commenti esplicativi per i prossimi manutentori
COMMENT ON COLUMN public.companies.vertical IS
  'Settore verticale primario dell''azienda. Guida la verticalizzazione di UI/AI/listini. ''generico'' = nessuna specializzazione.';
COMMENT ON COLUMN public.companies.verticals_secondari IS
  'Vertical aggiuntivi attivi sull''azienda (multi-vertical). Array di TEXT coerenti con i valori ammessi in vertical.';
COMMENT ON COLUMN public.companies.onboarding_vertical_completed IS
  'TRUE quando l''utente ha confermato la scelta del vertical nel flow di onboarding. Gate per il redirect forzato a /azienda/onboarding/vertical.';
