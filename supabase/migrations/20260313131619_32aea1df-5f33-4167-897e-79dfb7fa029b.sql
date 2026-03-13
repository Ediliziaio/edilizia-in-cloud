
-- automation_rules: unified automation rules table
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descrizione TEXT,
  categoria TEXT NOT NULL DEFAULT 'generale',
  icona TEXT,
  colore TEXT,
  attiva BOOLEAN DEFAULT true,
  is_template BOOLEAN DEFAULT false,
  template_id UUID,
  trigger_tipo TEXT NOT NULL,
  trigger_config JSONB DEFAULT '{}'::jsonb,
  condizioni JSONB DEFAULT '[]'::jsonb,
  azione_tipo TEXT NOT NULL DEFAULT 'crea_task',
  azione_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  azioni_secondarie JSONB DEFAULT '[]'::jsonb,
  esecuzioni_totali INTEGER DEFAULT 0,
  ultima_esecuzione TIMESTAMPTZ,
  ultima_esecuzione_ok BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id)
);

-- automation_log: execution log
CREATE TABLE IF NOT EXISTS public.automation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  trigger_data JSONB,
  esito TEXT NOT NULL,
  errore_msg TEXT,
  risultato JSONB,
  durata_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_automation_rules_company ON public.automation_rules(company_id) WHERE attiva = true;
CREATE INDEX IF NOT EXISTS idx_automation_rules_categoria ON public.automation_rules(company_id, categoria) WHERE attiva = true;
CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger ON public.automation_rules(trigger_tipo) WHERE attiva = true AND is_template = false;
CREATE INDEX IF NOT EXISTS idx_automation_templates ON public.automation_rules(categoria) WHERE is_template = true;
CREATE INDEX IF NOT EXISTS idx_automation_log_rule ON public.automation_log(rule_id, created_at DESC);

-- RLS
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_rules_select" ON public.automation_rules FOR SELECT
USING (
  is_template = true
  OR company_id = public.get_my_company_id()
);

CREATE POLICY "automation_rules_insert" ON public.automation_rules FOR INSERT
WITH CHECK (
  company_id = public.get_my_company_id()
  AND is_template = false
);

CREATE POLICY "automation_rules_update" ON public.automation_rules FOR UPDATE
USING (
  company_id = public.get_my_company_id()
  AND is_template = false
);

CREATE POLICY "automation_rules_delete" ON public.automation_rules FOR DELETE
USING (
  company_id = public.get_my_company_id()
  AND is_template = false
);

CREATE POLICY "automation_log_select" ON public.automation_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.automation_rules ar
    WHERE ar.id = automation_log.rule_id
      AND (ar.is_template = true OR ar.company_id = public.get_my_company_id())
  )
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_automation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_automation_rules_updated_at();

-- RPC: get_automation_counts
CREATE OR REPLACE FUNCTION public.get_automation_counts(p_company_id UUID)
RETURNS TABLE(categoria TEXT, totale BIGINT, attive BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    ar.categoria,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE ar.attiva = true)::BIGINT
  FROM public.automation_rules ar
  WHERE ar.company_id = p_company_id AND ar.is_template = false
  GROUP BY ar.categoria
  ORDER BY ar.categoria;
$$;

-- RPC: get_automation_log_recent
CREATE OR REPLACE FUNCTION public.get_automation_log_recent(p_company_id UUID, p_limit INTEGER DEFAULT 20)
RETURNS TABLE(
  log_id UUID, rule_id UUID, rule_nome TEXT, categoria TEXT,
  esito TEXT, errore_msg TEXT, durata_ms INTEGER, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    al.id, al.rule_id, ar.nome, ar.categoria,
    al.esito, al.errore_msg, al.durata_ms, al.created_at
  FROM public.automation_log al
  JOIN public.automation_rules ar ON ar.id = al.rule_id
  WHERE ar.company_id = p_company_id
  ORDER BY al.created_at DESC
  LIMIT p_limit;
$$;
