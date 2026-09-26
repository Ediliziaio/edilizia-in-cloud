-- Area «Pergole e tende» nel preventivatore Ristrutturazioni (26/09/2026).
--
-- Cinque modelli nuovi sullo stesso motore (rst_progetti): pergola bioclimatica,
-- pergola con telo, tende da sole, vetrate e chiusure balcone, carport e tettoie.
-- Il vincolo del modello congelato aggiunge i cinque id ai dodici già presenti
-- (Ristrutturazioni + Pareti e soffitti). Stesso corpo di 20280926190000, per la
-- sola rst_progetti; l'elenco si allunga, non si accorcia. Il trigger
-- preventivo_modello_immutabile resta.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  v record;
begin
  for v in
    select * from (values
      ('rst_progetti', array['completa', 'parziale', 'commerciale', 'spazi', 'computo', 'tinteggiatura-interna', 'carta-da-parati', 'cartongesso', 'controsoffitti', 'decorativi', 'umidita', 'acustica', 'pergola-bioclimatica', 'pergola-telo', 'tende-sole', 'vetrate', 'carport'])
    ) as t(tabella, modelli)
  loop
    execute format('alter table public.%I drop constraint if exists %I', v.tabella, v.tabella || '_modello_valido');
    execute format($sql$
      alter table public.%I add constraint %I check (
        modello_snapshot is null or coalesce((
          jsonb_typeof(modello_snapshot) = 'object'
          and modello_snapshot ->> 'version' = '1'
          and modello_snapshot ->> 'modelId' = any (%L::text[])
          and modello_snapshot ->> 'companyId' = company_id::text
          and jsonb_typeof(modello_snapshot -> 'template') = 'object'
          and modello_snapshot #>> '{template,company_id}' = company_id::text
          and modello_snapshot #>> '{template,pdf_blocchi,modulo_intervento}' = modello_snapshot ->> 'modelId'
          and octet_length(modello_snapshot::text) <= 8388608
        ), false)
      )$sql$, v.tabella, v.tabella || '_modello_valido', v.modelli);
  end loop;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger g where g.tgrelid = 'public.rst_progetti'::regclass and g.tgname = 'preventivo_modello_immutabile') then
    raise exception 'rst_progetti: manca il trigger preventivo_modello_immutabile';
  end if;
end;
$$;
