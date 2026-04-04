-- ============================================================
-- MODULO 1 — ASSISTENZA & INTERVENTI
-- Estende tickets + crea rapportini_intervento + scorte_furgone
-- ============================================================

-- 1. Aggiungi colonne alla tabella tickets esistente
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS tipo                       TEXT DEFAULT 'supporto'
                                                       CHECK (tipo IN ('supporto','intervento','emergenza')),
  ADD COLUMN IF NOT EXISTS indirizzo_intervento        TEXT,
  ADD COLUMN IF NOT EXISTS data_intervento_prevista    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_intervento_effettiva   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS durata_ore                  NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS note_tecnico                TEXT;

-- 2. Tabella rapportini_intervento
CREATE TABLE IF NOT EXISTS public.rapportini_intervento (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_id       UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  tecnico_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  numero          INTEGER NOT NULL,
  data_intervento TIMESTAMPTZ NOT NULL DEFAULT now(),
  descrizione     TEXT NOT NULL,
  ore_lavoro      NUMERIC(4,2) DEFAULT 0,
  materiali_usati JSONB DEFAULT '[]',
  foto_urls       TEXT[] DEFAULT '{}',
  firma_cliente   TEXT,
  firmato_da      TEXT,
  firmato_il      TIMESTAMPTZ,
  stato           TEXT DEFAULT 'bozza' CHECK (stato IN ('bozza','firmato','fatturato')),
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 3. Scorte furgone (magazzino mobile per tecnico)
CREATE TABLE IF NOT EXISTS public.scorte_furgone (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tecnico_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  descrizione     TEXT NOT NULL,
  quantita        NUMERIC(10,2) DEFAULT 0,
  quantita_minima NUMERIC(10,2) DEFAULT 1,
  unita_misura    TEXT DEFAULT 'pz',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 4. Storage bucket per foto rapportini
INSERT INTO storage.buckets (id, name, public)
VALUES ('rapportini', 'rapportini', false)
ON CONFLICT (id) DO NOTHING;

-- 5. RLS
ALTER TABLE public.rapportini_intervento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scorte_furgone ENABLE ROW LEVEL SECURITY;

CREATE POLICY rapportini_company ON public.rapportini_intervento
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY scorte_company ON public.scorte_furgone
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- Storage RLS per rapportini
CREATE POLICY rapportini_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'rapportini');

CREATE POLICY rapportini_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rapportini');

-- 6. Indici
CREATE INDEX IF NOT EXISTS idx_rapportini_ticket  ON public.rapportini_intervento(ticket_id);
CREATE INDEX IF NOT EXISTS idx_rapportini_tecnico ON public.rapportini_intervento(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_scorte_tecnico     ON public.scorte_furgone(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tipo       ON public.tickets(tipo);
