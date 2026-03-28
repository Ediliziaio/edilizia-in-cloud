-- Migrate existing messaging_beta_enabled data
INSERT INTO public.platform_feature_flags (key, name, description, category, is_beta, default_value, plans_included, icon, sort_order) VALUES
  ('ai_agents', 'Agenti AI', 'Assistenti AI per automazione task e conversazioni', 'addon', false, true, '{enterprise}', 'Bot', 1),
  ('whatsapp', 'WhatsApp Business', 'Invio messaggi WhatsApp ai contatti', 'addon', false, true, '{pro,enterprise}', 'MessageCircle', 2),
  ('reporting_advanced', 'Reporting Avanzato', 'Report personalizzati e dashboard avanzate', 'addon', false, false, '{enterprise}', 'BarChart3', 3),
  ('messaging_beta', 'Messaggistica', 'Modulo di messaggistica con AI per conversazioni', 'beta', true, false, '{}', 'MessageSquare', 4),
  ('ai_agents_internal', 'Agenti AI Gestione Interna', 'AI per gestione ordini e magazzino', 'beta', true, false, '{}', 'Cpu', 5),
  ('email_marketing', 'Email Marketing', 'Campagne email automatizzate', 'addon', false, true, '{pro,enterprise}', 'Mail', 6),
  ('automations', 'Automazioni Marketing', 'Workflow automatizzati per il CRM', 'core', false, true, '{base,pro,enterprise}', 'Zap', 7);
