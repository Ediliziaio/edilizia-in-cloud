-- FIX-04: Business hours for outbound calls
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS orario_apertura TIME DEFAULT '08:00:00',
  ADD COLUMN IF NOT EXISTS orario_chiusura TIME DEFAULT '20:00:00',
  ADD COLUMN IF NOT EXISTS giorni_attivi INTEGER[] DEFAULT '{1,2,3,4,5}'::INTEGER[],
  ADD COLUMN IF NOT EXISTS business_hours_enabled BOOLEAN DEFAULT false;

-- giorni_attivi: 0=domenica, 1=lunedì, ..., 6=sabato (ISO: 1=lunedì, 7=domenica)
-- Default: lun-ven (1-5)

COMMENT ON COLUMN public.ai_agents.orario_apertura IS 'Orario inizio disponibilità chiamate (ora locale IT)';
COMMENT ON COLUMN public.ai_agents.orario_chiusura IS 'Orario fine disponibilità chiamate (ora locale IT)';
COMMENT ON COLUMN public.ai_agents.giorni_attivi IS 'Giorni settimana attivi: 0=dom, 1=lun, ..., 6=sab';
COMMENT ON COLUMN public.ai_agents.business_hours_enabled IS 'Se true, controlla gli orari prima di avviare chiamate in uscita';
