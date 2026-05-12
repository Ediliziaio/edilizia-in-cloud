-- ═══════════════════════════════════════════════════════════════════════════
-- Rollback article_variants - usiamo il sistema esistente article_family_axes
-- ═══════════════════════════════════════════════════════════════════════════
-- La migration 20270501000000 ha introdotto una nuova tabella
-- `article_variants` per gestire opzioni prezzo. SCOPERTO DOPO che esisteva
-- gia' un sistema piu' ricco: `article_family_axes` + `article_family_axis_values`
-- (con maggiorazioni: none/percentuale/fisso_pz/fisso_mq/fisso_ml/fisso_mc).
--
-- Per non duplicare il sistema e mantenere coerenza con l'editor "Variabili
-- Prodotto" gia' usato nel FamilyEditor, rollback:
--   - DROP table article_variants
--   - DROP column sr_serramenti_progetto.varianti_selezionate
--   - ADD  column sr_serramenti_progetto.valori_assi jsonb (snapshot
--     selezioni assi: { axis_codice -> value_id })
--
-- Idempotente. Safe perche' nessuna riga ha ancora dati nella nuova tabella
-- (la feature non e' arrivata in produzione).

-- ─── 1) Drop tabella article_variants + indici ────────────────────────────
DROP TABLE IF EXISTS public.article_variants CASCADE;

-- ─── 2) Drop colonna snapshot varianti dal BOM ────────────────────────────
ALTER TABLE public.sr_serramenti_progetto
  DROP COLUMN IF EXISTS varianti_selezionate;

-- ─── 3) Aggiungi colonna valori_assi (selezione assi famiglia) ────────────
-- Mappa { axis_codice -> value_id } salvata come snapshot al momento della
-- scelta dal picker. Se l'azienda modifica le varianti/maggiorazioni dopo,
-- il preventivo gia' creato conserva il prezzo originale.
ALTER TABLE public.sr_serramenti_progetto
  ADD COLUMN IF NOT EXISTS valori_assi JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.sr_serramenti_progetto.valori_assi IS
  'Snapshot delle scelte sugli assi (variabili prodotto) della family al momento del preventivo. Mappa { axis_codice -> axis_value_id }.';

NOTIFY pgrst, 'reload schema';
