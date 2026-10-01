-- Collega un intervento (ticket) alla fattura che ne è nata.
--
-- La fatturazione resta intatta: non tocchiamo documenti_fiscali né la RPC
-- documento_crea. Il legame vive sul ticket, che l'ufficio modifica già
-- liberamente: dopo "Crea fattura" si scrive qui l'id del documento e la
-- scheda dell'intervento mostra "Fattura creata" con il link.
--
-- ON DELETE SET NULL: se la fattura viene cestinata, l'intervento resta,
-- semplicemente torna "da fatturare".

set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.tickets
  add column if not exists documento_fiscale_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tickets_documento_fiscale_id_fkey'
  ) then
    alter table public.tickets
      add constraint tickets_documento_fiscale_id_fkey
      foreign key (documento_fiscale_id)
      references public.documenti_fiscali(id)
      on delete set null;
  end if;
end $$;

comment on column public.tickets.documento_fiscale_id is
  'Fattura nata da questo intervento (assistenza). Impostata da "Crea fattura".';
