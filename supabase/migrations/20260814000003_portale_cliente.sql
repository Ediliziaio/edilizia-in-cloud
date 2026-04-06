-- ============================================================
-- MODULO PORTALE CLIENTE
-- Token magic link + richieste + approvazioni + notifiche
-- ============================================================

-- Abilita pgcrypto per gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Token accesso portale (magic link)
CREATE TABLE IF NOT EXISTS public.portale_clienti_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  ultimo_accesso TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. Richieste intervento dal portale
CREATE TABLE IF NOT EXISTS public.portale_richieste (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cliente_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  impianto_id UUID REFERENCES public.impianti_cliente(id) ON DELETE SET NULL,
  tipo        TEXT NOT NULL DEFAULT 'intervento'
    CHECK (tipo IN ('intervento','manutenzione','sopralluogo','emergenza')),
  descrizione TEXT NOT NULL,
  urgenza     TEXT NOT NULL DEFAULT 'normale'
    CHECK (urgenza IN ('normale','urgente','emergenza')),
  foto_urls   TEXT[] DEFAULT '{}',
  stato       TEXT NOT NULL DEFAULT 'inviata'
    CHECK (stato IN ('inviata','in_lavorazione','preventivo_inviato','approvata','rifiutata','completata')),
  ticket_id   UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  note_ufficio TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 3. Approvazioni preventivi dal portale
CREATE TABLE IF NOT EXISTS public.portale_approvazioni (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cliente_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  richiesta_id   UUID REFERENCES public.portale_richieste(id) ON DELETE SET NULL,
  quote_id       UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  esito          TEXT NOT NULL CHECK (esito IN ('approvato','modifiche_richieste','rifiutato')),
  note_cliente   TEXT,
  firma_data     TEXT,
  firmato_at     TIMESTAMPTZ DEFAULT now(),
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- 4. Notifiche portale
CREATE TABLE IF NOT EXISTS public.notifiche_portale (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cliente_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('nuova_richiesta','stato_aggiornato','preventivo_pronto','intervento_completato')),
  titolo      TEXT NOT NULL,
  corpo       TEXT,
  letta       BOOLEAN DEFAULT false,
  link        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 5. RLS (lettura via token — politiche più aperte per portale pubblico)
ALTER TABLE public.portale_clienti_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portale_richieste ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portale_approvazioni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifiche_portale ENABLE ROW LEVEL SECURITY;

-- I token sono letti con SECURITY DEFINER dalla funzione di validazione
CREATE POLICY portale_tokens_company ON public.portale_clienti_tokens
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- Le richieste: admin vede tutte, cliente vede le sue
CREATE POLICY portale_richieste_company ON public.portale_richieste
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY portale_approvazioni_company ON public.portale_approvazioni
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY notifiche_portale_company ON public.notifiche_portale
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- 6. Funzione validazione token (SECURITY DEFINER per accesso senza auth)
CREATE OR REPLACE FUNCTION public.valida_portale_token(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record RECORD;
BEGIN
  SELECT t.*, p.first_name, p.last_name, p.email, c.name AS company_name
  INTO v_record
  FROM public.portale_clienti_tokens t
  JOIN public.profiles p ON p.id = t.cliente_id
  JOIN public.companies c ON c.id = t.company_id
  WHERE t.token = p_token
    AND t.expires_at > now();

  IF NOT FOUND THEN
    RETURN json_build_object('valido', false, 'motivo', 'Token non valido o scaduto');
  END IF;

  -- Aggiorna ultimo accesso
  UPDATE public.portale_clienti_tokens
  SET ultimo_accesso = now()
  WHERE token = p_token;

  RETURN json_build_object(
    'valido', true,
    'cliente_id', v_record.cliente_id,
    'company_id', v_record.company_id,
    'first_name', v_record.first_name,
    'last_name', v_record.last_name,
    'email', v_record.email,
    'company_name', v_record.company_name,
    'expires_at', v_record.expires_at
  );
END;
$$;

-- 7. Trigger updated_at per portale_richieste
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER portale_richieste_updated_at
  BEFORE UPDATE ON public.portale_richieste
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. Indici
CREATE INDEX IF NOT EXISTS idx_portale_tokens_token ON public.portale_clienti_tokens(token);
CREATE INDEX IF NOT EXISTS idx_portale_tokens_cliente ON public.portale_clienti_tokens(cliente_id);
CREATE INDEX IF NOT EXISTS idx_portale_richieste_cliente ON public.portale_richieste(cliente_id);
CREATE INDEX IF NOT EXISTS idx_portale_richieste_company ON public.portale_richieste(company_id);
CREATE INDEX IF NOT EXISTS idx_portale_richieste_stato ON public.portale_richieste(stato);
CREATE INDEX IF NOT EXISTS idx_notifiche_portale_cliente ON public.notifiche_portale(cliente_id);
CREATE INDEX IF NOT EXISTS idx_notifiche_portale_letta ON public.notifiche_portale(letta);
