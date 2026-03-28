-- invoice_payments.created_by
ALTER TABLE public.invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_created_by_fkey;
