-- Selezione → operatività: il colloquio fissato finisce sul calendario
-- (appointment collegato, così spostarlo/cancellarlo resta coerente) e il
-- candidato assunto si trasforma in profilo HR con un click (il link evita
-- di crearlo due volte).

alter table public.hr_candidati_colloqui
  add column if not exists ora_colloquio time,
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null;

alter table public.hr_candidati
  add column if not exists hr_profilo_id uuid references public.hr_profili(id) on delete set null;
