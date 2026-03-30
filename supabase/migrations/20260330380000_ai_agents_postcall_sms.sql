-- P1-06: SMS post-call configuration
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS sms_postcall_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_postcall_trigger TEXT DEFAULT 'missed_call'
    CHECK (sms_postcall_trigger IN ('missed_call', 'appointment_created', 'always')),
  ADD COLUMN IF NOT EXISTS sms_postcall_template TEXT DEFAULT
    'Ciao {nome}, abbiamo tentato di chiamarti. Richiamaci al più presto o prenota un appuntamento.';

COMMENT ON COLUMN public.ai_agents.sms_postcall_enabled IS 'Abilita SMS post-chiamata via Telnyx';
COMMENT ON COLUMN public.ai_agents.sms_postcall_trigger IS 'Quando inviare l''SMS: missed_call, appointment_created, always';
COMMENT ON COLUMN public.ai_agents.sms_postcall_template IS 'Template SMS (variabili: {nome}, {data}, {ora})';
