-- Fascicolo subappaltatori: anagrafica estesa, documenti e pagamenti SAL.

-- Compatibilità catena migrazioni pulita:
-- questa migration 202605 collega il fascicolo sicurezza alla tabella campo
-- `subappaltatori` e alle tabelle operative SAL, ma le migration formali
-- arrivano più avanti (202608/202609). Anticipiamo solo lo schema base,
-- senza creare policy con nomi futuri, così le migration successive restano
-- libere di applicare RLS/indici ufficiali senza collisioni.
CREATE TABLE IF NOT EXISTS public.subappaltatori (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ragione_sociale TEXT NOT NULL,
  responsabile TEXT,
  telefono TEXT,
  email TEXT,
  piva TEXT,
  indirizzo TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subappaltatori ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.contratti_subappalto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subappaltatore_id UUID NOT NULL REFERENCES public.subappaltatori_sicurezza(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  numero_contratto TEXT,
  descrizione_lavori TEXT NOT NULL,
  importo_contrattuale NUMERIC(12,2) NOT NULL DEFAULT 0,
  ritenuta_garanzia_pct NUMERIC(5,2) DEFAULT 5.00,
  data_inizio DATE,
  data_fine_prevista DATE,
  data_fine_effettiva DATE,
  stato TEXT DEFAULT 'attivo'
    CHECK (stato IN ('bozza','attivo','completato','risolto','sospeso')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sal_subappaltatori (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contratto_id UUID NOT NULL REFERENCES public.contratti_subappalto(id) ON DELETE CASCADE,
  subappaltatore_id UUID NOT NULL REFERENCES public.subappaltatori_sicurezza(id),
  order_id UUID NOT NULL REFERENCES public.orders(id),
  numero_sal INTEGER NOT NULL DEFAULT 1,
  data_emissione DATE NOT NULL DEFAULT CURRENT_DATE,
  importo_lordo NUMERIC(12,2) NOT NULL DEFAULT 0,
  ritenuta_pct NUMERIC(5,2) DEFAULT 5.00,
  ritenuta_importo NUMERIC(12,2) GENERATED ALWAYS AS
    (ROUND(importo_lordo * ritenuta_pct / 100, 2)) STORED,
  importo_netto NUMERIC(12,2) GENERATED ALWAYS AS
    (importo_lordo - ROUND(importo_lordo * ritenuta_pct / 100, 2)) STORED,
  stato TEXT DEFAULT 'ricevuto'
    CHECK (stato IN ('ricevuto','verificato','pagato','contestato')),
  data_pagamento DATE,
  note TEXT,
  attachment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ritenute_garanzia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contratto_id UUID NOT NULL REFERENCES public.contratti_subappalto(id) ON DELETE CASCADE,
  sal_id UUID NOT NULL REFERENCES public.sal_subappaltatori(id) ON DELETE CASCADE,
  importo NUMERIC(12,2) NOT NULL,
  stato TEXT DEFAULT 'trattenuta'
    CHECK (stato IN ('trattenuta','svincolata','persa')),
  data_svincolo_prevista DATE,
  data_svincolo_effettiva DATE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documenti_subappaltatore (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subappaltatore_id UUID NOT NULL REFERENCES public.subappaltatori_sicurezza(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL
    CHECK (tipo IN ('durc','visura_camerale','attestazione_soa','dvr',
                    'polizza_rc','iso_certificazione','altro')),
  nome_file TEXT,
  url TEXT NOT NULL,
  data_rilascio DATE,
  data_scadenza DATE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.contratti_subappalto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sal_subappaltatori ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ritenute_garanzia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documenti_subappaltatore ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.subappaltatori_sicurezza
  ADD COLUMN IF NOT EXISTS piva text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS pec text,
  ADD COLUMN IF NOT EXISTS indirizzo text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS campo_subappaltatore_id uuid REFERENCES public.subappaltatori(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subappaltatori_sicurezza_campo
  ON public.subappaltatori_sicurezza(campo_subappaltatore_id);

ALTER TABLE public.sal_subappaltatori
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_reference text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('subappaltatori-documenti', 'subappaltatori-documenti', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "subappaltatori_documenti_company_read" ON storage.objects;
CREATE POLICY "subappaltatori_documenti_company_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'subappaltatori-documenti'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "subappaltatori_documenti_company_write" ON storage.objects;
CREATE POLICY "subappaltatori_documenti_company_write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'subappaltatori-documenti'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "subappaltatori_documenti_company_update" ON storage.objects;
CREATE POLICY "subappaltatori_documenti_company_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'subappaltatori-documenti'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'subappaltatori-documenti'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "subappaltatori_documenti_company_delete" ON storage.objects;
CREATE POLICY "subappaltatori_documenti_company_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'subappaltatori-documenti'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

DROP VIEW IF EXISTS public.v_subappaltatori_dashboard;

CREATE VIEW public.v_subappaltatori_dashboard AS
SELECT
  ss.id,
  ss.company_id,
  ss.order_id,
  ss.ragione_sociale,
  ss.tipo_lavori,
  ss.responsabile,
  ss.telefono,
  ss.piva,
  ss.email,
  ss.pec,
  ss.indirizzo,
  ss.note,
  ss.campo_subappaltatore_id,
  sc.user_id AS campo_user_id,
  sc.user_email AS campo_user_email,
  COALESCE(sc.is_active, false) AS campo_is_active,
  ss.durc_scadenza,
  cs.id AS contratto_id,
  cs.importo_contrattuale,
  cs.ritenuta_garanzia_pct,
  cs.stato AS stato_contratto,
  COALESCE(SUM(sal.importo_lordo), 0) AS totale_sal_lordo,
  COALESCE(SUM(sal.importo_netto), 0) AS totale_sal_netto,
  COALESCE(SUM(rg.importo) FILTER (WHERE rg.stato = 'trattenuta'), 0) AS ritenute_in_corso,
  COALESCE(SUM(rg.importo) FILTER (WHERE rg.stato = 'svincolata'), 0) AS ritenute_svincolate,
  COALESCE(cs.importo_contrattuale, 0) - COALESCE(SUM(sal.importo_lordo), 0) AS residuo_contrattuale
FROM public.subappaltatori_sicurezza ss
LEFT JOIN public.subappaltatori sc ON sc.id = ss.campo_subappaltatore_id
LEFT JOIN public.contratti_subappalto cs ON cs.subappaltatore_id = ss.id
LEFT JOIN public.sal_subappaltatori sal ON sal.contratto_id = cs.id
LEFT JOIN public.ritenute_garanzia rg ON rg.contratto_id = cs.id
GROUP BY ss.id, cs.id, sc.user_id, sc.user_email, sc.is_active;
