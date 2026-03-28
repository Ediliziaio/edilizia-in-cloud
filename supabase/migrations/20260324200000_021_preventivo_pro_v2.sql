-- ━━━ BLOCCO E: IMPOSTAZIONI PREVENTIVO ━━━
-- Una riga per company (UNIQUE company_id). Creata al primo accesso (upsert).
CREATE TABLE IF NOT EXISTS public.preventivo_impostazioni (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Visibilità margini per i commerciali (non admin)
  visibilita_margini TEXT DEFAULT 'nessuno'
    CHECK (visibilita_margini IN ('tutti','nessuno','sopra_soglia','solo_semaforo')),
  soglia_margine_visibile NUMERIC(5,2) DEFAULT 20,
  -- Margini target per categoria (JSONB: {"categoria_nome": percentuale})
  margini_target_categorie JSONB DEFAULT '{}',
  margine_target_default NUMERIC(5,2) DEFAULT 25,
  overhead_percentuale NUMERIC(5,2) DEFAULT 8,  -- spese generali applicate a tutto
  -- Comportamento automatico nel preventivo
  aggiungi_posa_automatica    BOOLEAN DEFAULT true,
  chiedi_piano_installazione  BOOLEAN DEFAULT true,
  chiedi_smaltimento          BOOLEAN DEFAULT true,
  chiedi_trasporto            BOOLEAN DEFAULT false,
  -- Opzioni PDF (override per singolo preventivo possibile in P03)
  pdf_mostra_prezzi_per_riga  BOOLEAN DEFAULT true,
  pdf_mostra_solo_totale      BOOLEAN DEFAULT false,
  pdf_mostra_sconti           BOOLEAN DEFAULT false,
  pdf_mostra_immagini         BOOLEAN DEFAULT true,
  pdf_includi_schede_tecniche BOOLEAN DEFAULT false,
  -- Firma digitale
  firma_digitale_abilitata BOOLEAN DEFAULT true,
  firma_richiede_nome      BOOLEAN DEFAULT true,
  UNIQUE (company_id)
);
