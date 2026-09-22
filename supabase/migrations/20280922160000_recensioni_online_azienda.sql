-- Il voto dell'azienda su Google, Trustpilot e simili, per la pagina «Dicono di noi»
-- dei preventivi (edili, Serramenti, Fotovoltaico).
--
-- Si scrive una volta nel Profilo azienda e vale per tutti i moduli: il voto di
-- Google è dell'azienda, non del modello di un preventivo. Un elenco di voci
-- { piattaforma, nome, voto, numero, link }; la forma la controlla chi legge
-- (_shared/recensioniOnline.ts), qui solo che sia un elenco corto.
--
-- Nessun valore di serie: un voto che l'azienda non ha scritto non esce.

alter table public.companies
  add column if not exists recensioni_online jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.companies'::regclass
       and conname = 'companies_recensioni_online_elenco'
  ) then
    alter table public.companies
      add constraint companies_recensioni_online_elenco
      check (jsonb_typeof(recensioni_online) = 'array' and jsonb_array_length(recensioni_online) <= 6);
  end if;
end $$;

comment on column public.companies.recensioni_online is
  'Voto sulle piattaforme di recensioni (Google, Trustpilot…) scritto dall''azienda nel Profilo: [{piattaforma, nome, voto, numero, link}]. Esce nella pagina «Dicono di noi» dei preventivi.';
