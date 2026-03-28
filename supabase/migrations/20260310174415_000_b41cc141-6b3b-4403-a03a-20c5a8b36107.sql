-- Fix Gap D: Add OR UPDATE to payment trigger for consistency on payment edits
DROP TRIGGER IF EXISTS trg_update_invoice_on_payment ON public.invoice_payments;
