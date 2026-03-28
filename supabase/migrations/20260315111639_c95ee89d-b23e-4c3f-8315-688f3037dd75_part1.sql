CREATE VIEW public.ai_elevenlabs_config_safe
WITH (security_invoker = true) AS
SELECT
  id,
  company_id,
  CASE 
    WHEN api_key_encrypted IS NOT NULL AND length(api_key_encrypted) > 4 
    THEN '****' || right(api_key_encrypted, 4)
    WHEN api_key_encrypted IS NOT NULL THEN '****'
    ELSE NULL
  END AS api_key_masked,
  api_key_valida,
  piano,
  crediti_rimanenti,
  crediti_totali,
  ultima_verifica,
  creato_il,
  aggiornato_il
FROM public.ai_elevenlabs_config;
