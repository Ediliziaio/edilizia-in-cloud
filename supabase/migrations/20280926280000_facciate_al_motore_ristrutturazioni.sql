-- Facciate collegate al motore Ristrutturazioni (Lotto 10): i 9 modelli Facciate
-- (cappotto, rifacimento, balconi, tinteggiatura, interno, riparazioni, ventilata,
-- pietra, pulizia) entrano nel vincolo del modello congelato di rst_progetti,
-- insieme a Ristrutturazioni, Pareti e soffitti, Pergole. 31 id in tutto. Stesso
-- corpo di 20280926210000; l'elenco si allunga, non si accorcia. Il trigger resta.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  v record;
begin
  for v in
    select * from (values
      ('rst_progetti', array['completa', 'parziale', 'commerciale', 'spazi', 'computo', 'cucina', 'sottotetto', 'aperture-portanti', 'condominio', 'montascale', 'tinteggiatura-interna', 'carta-da-parati', 'cartongesso', 'controsoffitti', 'decorativi', 'umidita', 'acustica', 'pergola-bioclimatica', 'pergola-telo', 'tende-sole', 'vetrate', 'carport', 'cappotto', 'rifacimento', 'balconi', 'tinteggiatura', 'interno', 'riparazioni', 'ventilata', 'pietra', 'pulizia'])
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
