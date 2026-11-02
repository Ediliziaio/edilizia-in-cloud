-- La firma del cliente sul verbale di collaudo: sullo schermo, davanti a chi la raccoglie. L'immagine entra nel PDF
-- prima di congelarlo; qui resta chi ha firmato, quando e chi ha raccolto la firma.
alter table public.order_acceptance_reports
  add column if not exists firma_cliente_path text,
  add column if not exists firma_cliente_nome text,
  add column if not exists firma_cliente_at timestamptz,
  add column if not exists firma_raccolta_da uuid references auth.users(id) on delete set null;

-- Il bucket accettava solo PDF: la firma è un'immagine PNG.
update storage.buckets set allowed_mime_types = array['application/pdf', 'image/png'] where id = 'order-acceptance-reports';
