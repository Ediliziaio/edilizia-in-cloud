-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- La piattaforma è il fornitore dei crediti: non deve addebitare crediti a
-- se stessa quando fa email/SMS/WhatsApp marketing dai propri strumenti admin
-- verso i propri lead. Usa il meccanismo standard company_billing_overrides
-- (is_free) — lo stesso che i super_admin usano per concedere servizi gratuiti.
INSERT INTO public.company_billing_overrides (company_id, service, is_enabled, is_free, override_notes)
SELECT '00000000-0000-0000-0000-000000000001', s, true, true,
       'Piattaforma: servizio gratuito (è il fornitore stesso dei crediti)'
FROM unnest(ARRAY['email','sms','whatsapp','ai_agents']) AS s
ON CONFLICT (company_id, service) DO UPDATE SET
  is_free = true,
  is_enabled = true,
  updated_at = now();
