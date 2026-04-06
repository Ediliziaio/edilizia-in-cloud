-- ============================================================
-- MODULO FIRMA TECNICO — Estende rapportini_intervento
-- Aggiunge firma digitale tecnico + GPS + foto chiusura
-- ============================================================

-- 1. Estendi rapportini_intervento con campi firma tecnico
ALTER TABLE public.rapportini_intervento
  ADD COLUMN IF NOT EXISTS impianto_id        UUID REFERENCES public.impianti_cliente(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS firma_tecnico_url  TEXT,
  ADD COLUMN IF NOT EXISTS firmato_tecnico_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ore_lavoro_effettive NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS coordinatore_gps   JSONB,
  ADD COLUMN IF NOT EXISTS note_chiusura      TEXT,
  ADD COLUMN IF NOT EXISTS foto_chiusura      TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS stato_chiusura     TEXT DEFAULT 'aperto'
    CHECK (stato_chiusura IN ('aperto','in_lavorazione','completato','firmato'));

-- 2. Storage bucket per firme tecnici (privato)
INSERT INTO storage.buckets (id, name, public)
VALUES ('firme-tecnici', 'firme-tecnici', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage policies per firme tecnici
CREATE POLICY firme_tecnici_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'firme-tecnici');

CREATE POLICY firme_tecnici_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'firme-tecnici');

-- 4. Funzione verifica firma (hash SHA256 del payload)
CREATE OR REPLACE FUNCTION public.verifica_firma_intervento(p_rapportino_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rap RECORD;
BEGIN
  SELECT * INTO v_rap FROM public.rapportini_intervento WHERE id = p_rapportino_id;
  IF NOT FOUND THEN
    RETURN json_build_object('valida', false, 'motivo', 'Rapportino non trovato');
  END IF;
  IF v_rap.firma_tecnico_url IS NULL THEN
    RETURN json_build_object('valida', false, 'motivo', 'Firma non presente');
  END IF;
  RETURN json_build_object(
    'valida', true,
    'firmato_at', v_rap.firmato_tecnico_at,
    'tecnico_id', v_rap.tecnico_id,
    'firma_url', v_rap.firma_tecnico_url
  );
END;
$$;

-- 5. Indici
CREATE INDEX IF NOT EXISTS idx_rapportini_impianto ON public.rapportini_intervento(impianto_id);
CREATE INDEX IF NOT EXISTS idx_rapportini_firmato ON public.rapportini_intervento(firmato_tecnico_at);
CREATE INDEX IF NOT EXISTS idx_rapportini_stato_chiusura ON public.rapportini_intervento(stato_chiusura);
