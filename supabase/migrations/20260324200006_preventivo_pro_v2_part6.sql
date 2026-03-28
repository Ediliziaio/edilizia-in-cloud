-- ━━━ BLOCCO C: TARIFFE AZIENDALI ━━━
-- Ogni voce è una tariffa applicabile durante la preventivazione.
-- Il cliente NON vede prezzo_costo — vede solo prezzo_vendita nel PDF.
CREATE TABLE IF NOT EXISTS public.tariffe_aziendali (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'posa',        -- manodopera / montaggio
    'trasporto',   -- trasporto al cantiere
    'tiro_piano',  -- supplemento per piano di installazione
    'smaltimento', -- rimozione materiale vecchio
    'nolo',        -- attrezzatura noleggiata
    'pratica',     -- pratiche burocratiche / permessi
    'altro'
  )),
  nome TEXT NOT NULL,
  descrizione TEXT,
  -- Unità di misura della tariffa
  unita TEXT NOT NULL DEFAULT 'pz' CHECK (unita IN (
    'pz',    -- per pezzo
    'mq',    -- per metro quadro
    'ml',    -- per metro lineare
    'h',     -- per ora
    'piano', -- per piano (tiro al piano)
    'km',    -- per km (trasporto)
    'mc',    -- per metro cubo (smaltimento)
    'fisso'  -- importo fisso per intervento
  )),
  prezzo_costo    NUMERIC(12,4) DEFAULT 0,   -- costo interno (solo admin vede)
  prezzo_vendita  NUMERIC(12,4) DEFAULT 0,   -- prezzo applicato al cliente
  -- A quale categoria di prodotti si applica (NULL = tutte le categorie)
  categoria_prodotto TEXT,
  -- Per tiro_piano: logica a scaglioni
  piano_base              INTEGER       DEFAULT 0,
  prezzo_piano_aggiuntivo NUMERIC(12,4) DEFAULT 0,
  attiva     BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
