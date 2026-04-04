-- ============================================================
-- MODULO 4 — MANUTENZIONE PROGRAMMATA
-- impianti_cliente + contratti_manutenzione + piani + esecuzioni
-- ============================================================

-- 1. Scheda impianto cliente
CREATE TABLE IF NOT EXISTS public.impianti_cliente (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id            UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  tipo_impianto       TEXT NOT NULL,
  marca               TEXT,
  modello             TEXT,
  matricola           TEXT,
  data_installazione  DATE,
  garanzia_scadenza   DATE,
  note_tecniche       TEXT,
  foto_urls           TEXT[] DEFAULT '{}',
  attivo              BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- 2. Contratti manutenzione (genera MRR)
CREATE TABLE IF NOT EXISTS public.contratti_manutenzione (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  impianto_id         UUID NOT NULL REFERENCES public.impianti_cliente(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome_contratto      TEXT NOT NULL,
  tipo_fatturazione   TEXT DEFAULT 'annuale'
    CHECK (tipo_fatturazione IN ('mensile','trimestrale','semestrale','annuale')),
  importo_canone      NUMERIC(10,2) NOT NULL DEFAULT 0,
  data_inizio         DATE NOT NULL,
  data_scadenza       DATE,
  rinnovo_automatico  BOOLEAN DEFAULT true,
  stato               TEXT DEFAULT 'attivo'
    CHECK (stato IN ('attivo','sospeso','terminato')),
  note                TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- 3. Piano interventi manutenzione
CREATE TABLE IF NOT EXISTS public.piani_manutenzione (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contratto_id        UUID NOT NULL REFERENCES public.contratti_manutenzione(id) ON DELETE CASCADE,
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  titolo              TEXT NOT NULL,
  frequenza_tipo      TEXT NOT NULL
    CHECK (frequenza_tipo IN ('mensile','trimestrale','semestrale','annuale','personalizzata')),
  frequenza_giorni    INTEGER,
  checklist_attivita  JSONB DEFAULT '[]',
  prossima_scadenza   DATE,
  ultima_esecuzione   DATE,
  tecnico_preferito   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  attivo              BOOLEAN DEFAULT true
);

-- 4. Esecuzioni manutenzione (storico interventi)
CREATE TABLE IF NOT EXISTS public.esecuzioni_manutenzione (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  piano_id            UUID NOT NULL REFERENCES public.piani_manutenzione(id) ON DELETE CASCADE,
  rapportino_id       UUID REFERENCES public.rapportini_intervento(id) ON DELETE SET NULL,
  ticket_id           UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  data_esecuzione     DATE NOT NULL,
  tecnico_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  esito               TEXT DEFAULT 'ok'
    CHECK (esito IN ('ok','anomalia_rilevata','rinviata')),
  note                TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- 5. RLS
ALTER TABLE public.impianti_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratti_manutenzione ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.piani_manutenzione ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esecuzioni_manutenzione ENABLE ROW LEVEL SECURITY;

CREATE POLICY imp_company ON public.impianti_cliente
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY contratti_company ON public.contratti_manutenzione
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY piani_company ON public.piani_manutenzione
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY esecuzioni_company ON public.esecuzioni_manutenzione
  USING (piano_id IN (
    SELECT id FROM public.piani_manutenzione
    WHERE company_id = public.get_my_company_id()
  ));

-- 6. Indici
CREATE INDEX IF NOT EXISTS idx_impianti_customer     ON public.impianti_cliente(customer_id);
CREATE INDEX IF NOT EXISTS idx_impianti_company      ON public.impianti_cliente(company_id);
CREATE INDEX IF NOT EXISTS idx_contratti_impianto    ON public.contratti_manutenzione(impianto_id);
CREATE INDEX IF NOT EXISTS idx_piani_contratto       ON public.piani_manutenzione(contratto_id);
CREATE INDEX IF NOT EXISTS idx_piani_scadenza        ON public.piani_manutenzione(prossima_scadenza);
CREATE INDEX IF NOT EXISTS idx_esecuzioni_piano      ON public.esecuzioni_manutenzione(piano_id);
