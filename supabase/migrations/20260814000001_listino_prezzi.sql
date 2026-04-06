-- ============================================================
-- MODULO LISTINO PREZZI MANUTENZIONE
-- tipi_impianto + tipi_intervento + listino_prezzi + override
-- ============================================================

-- 1. Tipi impianto (personalizzabili per azienda)
CREATE TABLE IF NOT EXISTS public.tipi_impianto (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  icona      TEXT DEFAULT 'wrench',
  ordine     INTEGER DEFAULT 0,
  attivo     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tipi intervento
CREATE TABLE IF NOT EXISTS public.tipi_intervento (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome               TEXT NOT NULL,
  categoria          TEXT DEFAULT 'manutenzione_ordinaria'
    CHECK (categoria IN ('manutenzione_ordinaria','manutenzione_straordinaria','guasto','installazione','sopralluogo')),
  durata_stimata_h   NUMERIC(4,2),
  ordine             INTEGER DEFAULT 0,
  attivo             BOOLEAN DEFAULT true,
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- 3. Listino prezzi (matrice tipo_impianto x tipo_intervento)
CREATE TABLE IF NOT EXISTS public.listino_prezzi (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo_impianto_id    UUID NOT NULL REFERENCES public.tipi_impianto(id) ON DELETE CASCADE,
  tipo_intervento_id  UUID NOT NULL REFERENCES public.tipi_intervento(id) ON DELETE CASCADE,
  prezzo_base         NUMERIC(10,2) NOT NULL DEFAULT 0,
  iva_percentuale     INTEGER DEFAULT 22 CHECK (iva_percentuale IN (0,4,10,22)),
  unita               TEXT DEFAULT 'intervento' CHECK (unita IN ('intervento','ora','mq','ml','pz')),
  note                TEXT,
  valido_dal          DATE,
  valido_al           DATE,
  attivo              BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, tipo_impianto_id, tipo_intervento_id)
);

-- 4. Override per cliente specifico
CREATE TABLE IF NOT EXISTS public.listino_override_cliente (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cliente_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  listino_prezzo_id   UUID NOT NULL REFERENCES public.listino_prezzi(id) ON DELETE CASCADE,
  prezzo_override     NUMERIC(10,2),
  sconto_percentuale  NUMERIC(5,2),
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- 5. RLS
ALTER TABLE public.tipi_impianto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipi_intervento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listino_prezzi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listino_override_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY tipi_impianto_company ON public.tipi_impianto
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY tipi_intervento_company ON public.tipi_intervento
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY listino_prezzi_company ON public.listino_prezzi
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY listino_override_company ON public.listino_override_cliente
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- 6. Indici performance
CREATE INDEX IF NOT EXISTS idx_tipi_impianto_company ON public.tipi_impianto(company_id);
CREATE INDEX IF NOT EXISTS idx_tipi_intervento_company ON public.tipi_intervento(company_id);
CREATE INDEX IF NOT EXISTS idx_listino_company ON public.listino_prezzi(company_id);
CREATE INDEX IF NOT EXISTS idx_listino_tipo_impianto ON public.listino_prezzi(tipo_impianto_id);
CREATE INDEX IF NOT EXISTS idx_listino_tipo_intervento ON public.listino_prezzi(tipo_intervento_id);

-- 7. Funzione lookup prezzo
CREATE OR REPLACE FUNCTION public.get_prezzo_intervento(
  p_company_id UUID,
  p_tipo_impianto_id UUID,
  p_tipo_intervento_id UUID,
  p_cliente_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_listino RECORD;
  v_override RECORD;
  v_prezzo NUMERIC;
  v_da_override BOOLEAN := false;
BEGIN
  -- Cerca tariffa base
  SELECT * INTO v_listino
  FROM public.listino_prezzi
  WHERE company_id = p_company_id
    AND tipo_impianto_id = p_tipo_impianto_id
    AND tipo_intervento_id = p_tipo_intervento_id
    AND attivo = true
    AND (valido_al IS NULL OR valido_al >= CURRENT_DATE)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_prezzo := v_listino.prezzo_base;

  -- Cerca override cliente
  IF p_cliente_id IS NOT NULL THEN
    SELECT * INTO v_override
    FROM public.listino_override_cliente
    WHERE company_id = p_company_id
      AND cliente_id = p_cliente_id
      AND listino_prezzo_id = v_listino.id
    LIMIT 1;

    IF FOUND THEN
      IF v_override.prezzo_override IS NOT NULL THEN
        v_prezzo := v_override.prezzo_override;
        v_da_override := true;
      ELSIF v_override.sconto_percentuale IS NOT NULL THEN
        v_prezzo := v_listino.prezzo_base * (1 - v_override.sconto_percentuale / 100);
        v_da_override := true;
      END IF;
    END IF;
  END IF;

  RETURN json_build_object(
    'prezzo', v_prezzo,
    'prezzo_base', v_listino.prezzo_base,
    'iva', v_listino.iva_percentuale,
    'unita', v_listino.unita,
    'note', v_listino.note,
    'da_override', v_da_override
  );
END;
$$;
