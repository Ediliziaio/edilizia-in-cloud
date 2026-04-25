-- ============================================================================
-- Modulo Finanziamenti — Phase A MVP
-- ----------------------------------------------------------------------------
-- Crea le 3 tabelle base per la gestione delle tabelle finanziarie aziendali:
--   1. eic_finanziarie               — anagrafica finanziarie per azienda
--   2. eic_tabelle_finanziamento     — header di una tabella (prodotto/condizione)
--   3. eic_tabelle_finanziamento_righe — righe importo × durata con rate, TAN, TAEG, ICC
--
-- Modello dati derivato dalla tabella reale "Fiditalia OKNOPLAST TAN 8.75"
-- (condizione 255891, dealer KEBei): 14 colonne per riga, ~880 righe tipiche.
--
-- RLS: tenant per company_id via public.get_effective_company_id().
-- Storage bucket "finanziamenti-tabelle" per archivio PDF/CSV originali.
-- ============================================================================

-- ─── 1. Anagrafica finanziarie (per azienda) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.eic_finanziarie (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,                 -- 'Fiditalia', 'Findomestic', 'Compass'
  ragione_sociale TEXT,
  partita_iva     TEXT,
  logo_url        TEXT,                          -- URL pubblico o path Storage
  email_pratiche  TEXT,                          -- email a cui inviare pratiche (opzionale)
  telefono        TEXT,
  note            TEXT,
  attiva          BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT eic_finanziarie_nome_company_unique UNIQUE (company_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_eic_finanziarie_company
  ON public.eic_finanziarie (company_id) WHERE attiva = true;

COMMENT ON TABLE public.eic_finanziarie IS
  'Anagrafica finanziarie per azienda (Fiditalia, Findomestic, Compass...). Ogni azienda gestisce le proprie.';

-- ─── 2. Header tabella finanziamento ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.eic_tabelle_finanziamento (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  finanziaria_id      UUID NOT NULL REFERENCES public.eic_finanziarie(id) ON DELETE RESTRICT,
  -- Identificativi commerciali
  nome_prodotto       TEXT NOT NULL,             -- 'OKNOPLAST TAN 8.75'
  codice_condizione   TEXT,                      -- '255891'
  subtariffa_default  TEXT,                      -- 'GT57T' (fallback per righe)
  tan_base            NUMERIC(5,3),              -- 8.750 (informativo)
  -- Allegati
  pdf_url             TEXT,                      -- path Storage 'finanziamenti-tabelle'
  pdf_filename        TEXT,
  csv_url             TEXT,                      -- path Storage CSV originale importato
  csv_filename        TEXT,
  -- Validità
  data_decorrenza     DATE,
  data_scadenza       DATE,
  attiva              BOOLEAN NOT NULL DEFAULT true,
  note                TEXT,
  -- Cache aggregati (aggiornati da trigger su righe)
  righe_count         INTEGER NOT NULL DEFAULT 0,
  importo_min         NUMERIC(12,2),
  importo_max         NUMERIC(12,2),
  durate_disponibili  INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  -- Audit
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eic_tabelle_company_attiva
  ON public.eic_tabelle_finanziamento (company_id, attiva);
CREATE INDEX IF NOT EXISTS idx_eic_tabelle_finanziaria
  ON public.eic_tabelle_finanziamento (finanziaria_id);

COMMENT ON TABLE public.eic_tabelle_finanziamento IS
  'Header di una tabella finanziaria: prodotto + condizione + range importi/durate disponibili.';

-- ─── 3. Righe tabella (lookup importo × durata) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.eic_tabelle_finanziamento_righe (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabella_id               UUID NOT NULL REFERENCES public.eic_tabelle_finanziamento(id) ON DELETE CASCADE,
  company_id               UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Identificazione
  subtariffa               TEXT,
  -- Importi (colonne 2-4 del PDF Fiditalia)
  importo_erogato          NUMERIC(12,2) NOT NULL,
  spese_istruttoria        NUMERIC(10,2) NOT NULL DEFAULT 0,
  importo_totale_credito   NUMERIC(12,2) NOT NULL,
  -- Piano (colonne 5-7)
  numero_rate              INTEGER NOT NULL,
  durata_mesi              INTEGER NOT NULL,
  prima_rata_giorni        INTEGER NOT NULL DEFAULT 30,
  -- Costi rata (colonne 8-9)
  importo_rata             NUMERIC(10,2) NOT NULL,
  spese_incasso_rata       NUMERIC(8,2) NOT NULL DEFAULT 0,
  -- Esiti finanziari (colonne 10-11)
  interessi_cliente        NUMERIC(12,2) NOT NULL,
  importo_totale_dovuto    NUMERIC(12,2) NOT NULL,
  -- Tassi (colonne 12-14)
  tan                      NUMERIC(6,3) NOT NULL,
  taeg                     NUMERIC(6,3) NOT NULL,
  icc                      NUMERIC(6,3),
  -- Provvigione dealer (colonna 15)
  provvigione_dealer       NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT eic_righe_unique_lookup UNIQUE (tabella_id, importo_erogato, numero_rate),
  CONSTRAINT eic_righe_numero_rate_positivo CHECK (numero_rate > 0),
  CONSTRAINT eic_righe_importo_positivo CHECK (importo_erogato > 0),
  CONSTRAINT eic_righe_rata_positiva CHECK (importo_rata > 0)
);

CREATE INDEX IF NOT EXISTS idx_eic_righe_lookup
  ON public.eic_tabelle_finanziamento_righe (tabella_id, importo_erogato, numero_rate);
CREATE INDEX IF NOT EXISTS idx_eic_righe_company
  ON public.eic_tabelle_finanziamento_righe (company_id);

COMMENT ON TABLE public.eic_tabelle_finanziamento_righe IS
  'Righe di lookup: dato un importo erogato e un numero di rate, restituisce rata, TAN, TAEG, ICC, provvigione.';

-- ─── 4. Trigger updated_at ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'eic_set_updated_at'
  ) THEN
    CREATE OR REPLACE FUNCTION public.eic_set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $func$;
  END IF;
END$$;

DROP TRIGGER IF EXISTS trg_eic_finanziarie_updated_at ON public.eic_finanziarie;
CREATE TRIGGER trg_eic_finanziarie_updated_at
  BEFORE UPDATE ON public.eic_finanziarie
  FOR EACH ROW EXECUTE FUNCTION public.eic_set_updated_at();

DROP TRIGGER IF EXISTS trg_eic_tabelle_updated_at ON public.eic_tabelle_finanziamento;
CREATE TRIGGER trg_eic_tabelle_updated_at
  BEFORE UPDATE ON public.eic_tabelle_finanziamento
  FOR EACH ROW EXECUTE FUNCTION public.eic_set_updated_at();

-- ─── 5. Trigger di ricalcolo aggregati su righe ─────────────────────────────
-- Ogni insert/update/delete su righe ricalcola il count, min/max importo e
-- l'array durate_disponibili sull'header. Costo: O(n) per la singola tabella.
CREATE OR REPLACE FUNCTION public.eic_refresh_tabella_aggregates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tabella_id UUID;
BEGIN
  v_tabella_id := COALESCE(NEW.tabella_id, OLD.tabella_id);

  UPDATE public.eic_tabelle_finanziamento t
  SET
    righe_count = (SELECT COUNT(*) FROM public.eic_tabelle_finanziamento_righe r WHERE r.tabella_id = v_tabella_id),
    importo_min = (SELECT MIN(importo_erogato) FROM public.eic_tabelle_finanziamento_righe r WHERE r.tabella_id = v_tabella_id),
    importo_max = (SELECT MAX(importo_erogato) FROM public.eic_tabelle_finanziamento_righe r WHERE r.tabella_id = v_tabella_id),
    durate_disponibili = COALESCE(
      (SELECT ARRAY_AGG(DISTINCT numero_rate ORDER BY numero_rate)
       FROM public.eic_tabelle_finanziamento_righe r
       WHERE r.tabella_id = v_tabella_id),
      ARRAY[]::INTEGER[]
    ),
    updated_at = now()
  WHERE t.id = v_tabella_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_eic_righe_aggregates ON public.eic_tabelle_finanziamento_righe;
CREATE TRIGGER trg_eic_righe_aggregates
  AFTER INSERT OR UPDATE OR DELETE ON public.eic_tabelle_finanziamento_righe
  FOR EACH ROW EXECUTE FUNCTION public.eic_refresh_tabella_aggregates();

-- ─── 6. RLS Policies ────────────────────────────────────────────────────────
ALTER TABLE public.eic_finanziarie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eic_tabelle_finanziamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eic_tabelle_finanziamento_righe ENABLE ROW LEVEL SECURITY;

-- eic_finanziarie: company tenant
DROP POLICY IF EXISTS "co_eic_finanziarie_all" ON public.eic_finanziarie;
CREATE POLICY "co_eic_finanziarie_all"
  ON public.eic_finanziarie
  FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id())
  WITH CHECK (company_id = public.get_effective_company_id());

-- eic_tabelle_finanziamento: company tenant
DROP POLICY IF EXISTS "co_eic_tabelle_all" ON public.eic_tabelle_finanziamento;
CREATE POLICY "co_eic_tabelle_all"
  ON public.eic_tabelle_finanziamento
  FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id())
  WITH CHECK (company_id = public.get_effective_company_id());

-- eic_tabelle_finanziamento_righe: company tenant + tabella deve essere della stessa company
DROP POLICY IF EXISTS "co_eic_righe_all" ON public.eic_tabelle_finanziamento_righe;
CREATE POLICY "co_eic_righe_all"
  ON public.eic_tabelle_finanziamento_righe
  FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id())
  WITH CHECK (
    company_id = public.get_effective_company_id()
    AND EXISTS (
      SELECT 1 FROM public.eic_tabelle_finanziamento t
      WHERE t.id = tabella_id
        AND t.company_id = public.get_effective_company_id()
    )
  );

-- ─── 7. Storage bucket per PDF/CSV allegati ─────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'finanziamenti-tabelle',
  'finanziamenti-tabelle',
  false,
  20971520,  -- 20 MB
  ARRAY[
    'application/pdf',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS: oggetti dentro `<company_id>/...` accessibili solo dalla company
DROP POLICY IF EXISTS "fin_tabelle_select" ON storage.objects;
CREATE POLICY "fin_tabelle_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'finanziamenti-tabelle'
    AND (storage.foldername(name))[1] = public.get_effective_company_id()::text
  );

DROP POLICY IF EXISTS "fin_tabelle_insert" ON storage.objects;
CREATE POLICY "fin_tabelle_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'finanziamenti-tabelle'
    AND (storage.foldername(name))[1] = public.get_effective_company_id()::text
  );

DROP POLICY IF EXISTS "fin_tabelle_update" ON storage.objects;
CREATE POLICY "fin_tabelle_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'finanziamenti-tabelle'
    AND (storage.foldername(name))[1] = public.get_effective_company_id()::text
  );

DROP POLICY IF EXISTS "fin_tabelle_delete" ON storage.objects;
CREATE POLICY "fin_tabelle_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'finanziamenti-tabelle'
    AND (storage.foldername(name))[1] = public.get_effective_company_id()::text
  );
