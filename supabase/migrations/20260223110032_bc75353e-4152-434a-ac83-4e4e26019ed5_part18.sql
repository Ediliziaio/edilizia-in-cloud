-- 4. automation_enrollments - Iscrizioni contatto/opportunità
CREATE TABLE IF NOT EXISTS public.automation_enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  flow_version INTEGER NOT NULL DEFAULT 1,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contact', 'opportunity', 'appointment')),
  entity_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'canceled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
