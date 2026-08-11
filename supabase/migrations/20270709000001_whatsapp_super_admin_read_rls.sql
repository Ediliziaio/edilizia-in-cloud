-- Lettura super_admin sulle tabelle WhatsApp (bypass RLS cross-company).
--
-- Bug: ai_whatsapp_numbers / whatsapp_messages / wa_meta_templates avevano SOLO
-- una policy di company-isolation (company_id = get_my_company_id()), senza il
-- bypass super_admin già presente sulle altre tabelle. Risultato per il
-- super_admin: il contatore "Numeri attivi" (RPC SECURITY DEFINER) mostrava 1,
-- ma il Centro WhatsApp e il composer (SELECT dirette, filtrate da RLS)
-- leggevano 0 → "Nessun numero collegato" / "Nessun numero WhatsApp attivo",
-- anche con il numero realmente attivo nel DB.
--
-- Fix: policy SELECT additive con is_super_admin() (STABLE SECURITY DEFINER, già
-- usata altrove). Gli utenti normali restano isolati per azienda; il super_admin
-- può leggere cross-company.

DROP POLICY IF EXISTS wa_numbers_super_admin_read ON public.ai_whatsapp_numbers;
CREATE POLICY wa_numbers_super_admin_read ON public.ai_whatsapp_numbers
  FOR SELECT TO public USING (public.is_super_admin());

DROP POLICY IF EXISTS wa_messages_super_admin_read ON public.whatsapp_messages;
CREATE POLICY wa_messages_super_admin_read ON public.whatsapp_messages
  FOR SELECT TO public USING (public.is_super_admin());

DROP POLICY IF EXISTS wa_templates_super_admin_read ON public.wa_meta_templates;
CREATE POLICY wa_templates_super_admin_read ON public.wa_meta_templates
  FOR SELECT TO public USING (public.is_super_admin());
