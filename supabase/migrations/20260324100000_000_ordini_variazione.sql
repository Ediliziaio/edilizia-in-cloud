-- Ordini di Variazione (OdV)
CREATE TABLE public.ordini_variazione (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  numero_odv INTEGER NOT NULL,
  titolo TEXT NOT NULL,
  descrizione TEXT NOT NULL,
  motivazione TEXT,
  impatto_economico DECIMAL(10,2) NOT NULL DEFAULT 0,
  impatto_giorni INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_attesa' CHECK (status IN ('in_attesa','approvato','rifiutato','annullato')),
  richiesto_da TEXT,
  richiesto_il TIMESTAMPTZ DEFAULT now(),
  firma_cliente TEXT,
  firmato_da TEXT,
  firmato_il TIMESTAMPTZ,
  firma_token TEXT UNIQUE,
  note_interne TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, numero_odv)
);
