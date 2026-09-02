-- Campi configurabili del modulo di candidatura: per ogni campo l'impresa
-- sceglie obbligatorio / facoltativo / nascosto. Il nome resta sempre
-- obbligatorio; il vincolo "almeno un contatto" lo impone la edge function.
-- '{}' = comportamento standard (telefono obbligatorio, il resto facoltativo).
alter table public.hr_candidatura_forms
  add column if not exists campi jsonb not null default '{}'::jsonb;
