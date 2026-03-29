-- 1) Storage bucket for invoice PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices-pdf', 'invoices-pdf', false)
ON CONFLICT (id) DO NOTHING;
