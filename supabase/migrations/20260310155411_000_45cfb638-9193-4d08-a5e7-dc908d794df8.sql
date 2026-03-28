-- Create storage bucket for signed PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('quote-signed-pdfs', 'quote-signed-pdfs', false)
ON CONFLICT (id) DO NOTHING;
