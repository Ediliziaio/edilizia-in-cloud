-- Lingua scelta dalla persona (Impostazioni → Profilo). null = italiano, come oggi.
alter table public.profiles add column if not exists lingua text;
alter table public.profiles drop constraint if exists profiles_lingua_valida;
alter table public.profiles add constraint profiles_lingua_valida check (
  lingua is null or lingua in ('it','ro','sq','ar-MA','ar-EG','de','fr','en','es','es-AR','es-PE')
);
comment on column public.profiles.lingua is
  'Lingua scelta dalla persona in Impostazioni → Profilo; null = italiano (default della piattaforma).';
grant select (lingua), update (lingua) on public.profiles to authenticated;
