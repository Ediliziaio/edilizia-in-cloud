
ALTER FUNCTION public.attach_attribution_to_contact(uuid, uuid, uuid) SET search_path = public;
ALTER FUNCTION public.calculate_monthly_commissions(integer, integer) SET search_path = public;
ALTER FUNCTION public.calculate_quote_expires_at() SET search_path = public;
ALTER FUNCTION public.enforce_single_default_template() SET search_path = public;
ALTER FUNCTION public.generate_invoice_number(uuid, integer) SET search_path = public;
