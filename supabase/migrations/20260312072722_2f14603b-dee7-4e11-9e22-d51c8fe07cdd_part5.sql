CREATE INDEX IF NOT EXISTS idx_subscription_invoices_stripe ON public.subscription_invoices(stripe_invoice_id);
