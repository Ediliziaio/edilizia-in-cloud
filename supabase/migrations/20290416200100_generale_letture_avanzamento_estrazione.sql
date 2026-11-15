-- Commessa generale dai documenti, lotto 1: l'estrazione procede a gruppi di pagine, un gruppo
-- (o pochi) per giro della funzione; qui si conta dove è arrivata e quanto è costata.
alter table public.generale_letture add column if not exists gruppi_totali integer;
alter table public.generale_letture add column if not exists gruppi_fatti integer not null default 0;
alter table public.generale_letture add column if not exists costo_estrazione_eur numeric(10,4) not null default 0;
