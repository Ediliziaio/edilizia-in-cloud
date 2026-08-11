-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Preventivatore FV: sconto (percentuale o importo) + legame componenti ↔ listino.

-- Sconto sul preventivo: tipo ('pct' | 'importo') + valore inserito dal venditore.
-- sconto_eur_applicato è l'importo effettivamente applicato dall'edge dopo il
-- clamp server-side sulle discount_rules (audit di cosa è stato concesso).
ALTER TABLE public.fv_progetti
  ADD COLUMN IF NOT EXISTS sconto_tipo text CHECK (sconto_tipo IN ('pct','importo')),
  ADD COLUMN IF NOT EXISTS sconto_valore numeric,
  ADD COLUMN IF NOT EXISTS sconto_eur_applicato numeric;

-- Provenienza del componente FV dal listino (article_families): serve per
-- l'import bulk anti-duplicato e per risalire alla scheda prodotto originale.
ALTER TABLE public.articoli_native
  ADD COLUMN IF NOT EXISTS listino_family_id uuid REFERENCES public.article_families(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_articoli_native_listino_family
  ON public.articoli_native (company_id, listino_family_id)
  WHERE listino_family_id IS NOT NULL;
