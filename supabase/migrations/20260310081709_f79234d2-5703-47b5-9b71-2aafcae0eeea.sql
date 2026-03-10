
-- Fix search_path: get_attribution_report has two overloads
ALTER FUNCTION public.get_attribution_report(uuid, timestamptz, timestamptz, text) SET search_path = public;
ALTER FUNCTION public.get_attribution_report(uuid, timestamptz, timestamptz, text, text) SET search_path = public;
ALTER FUNCTION public.get_cruscotto_stats(uuid, date, date) SET search_path = public;
ALTER FUNCTION public.get_scadenzario(uuid, date, date) SET search_path = public;
ALTER FUNCTION public.increment_referrer_clicks(uuid) SET search_path = public;
ALTER FUNCTION public.is_super_admin(uuid) SET search_path = public;
ALTER FUNCTION public.recalculate_invoice_totals(uuid) SET search_path = public;
ALTER FUNCTION public.set_quote_templates_updated_at() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.trg_recalculate_invoice() SET search_path = public;
ALTER FUNCTION public.trg_update_paid_amount() SET search_path = public;
ALTER FUNCTION public.trigger_set_updated_at() SET search_path = public;
ALTER FUNCTION public.update_referrer_tier(uuid) SET search_path = public;
