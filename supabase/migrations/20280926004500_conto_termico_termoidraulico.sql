-- Conto Termico 3.0 nel preventivatore Termoidraulico (25/09/2026).
--
-- Un nono modello della libreria, «conto-termico»: pompa di calore o altro
-- generatore rinnovabile al posto del vecchio impianto, con il contributo del
-- GSE. Il PDF è quello del Conto Termico (ContoTermicoPDF), come il preventivo
-- fotovoltaico: copertina, contributo, risparmio e beneficio negli anni.
--
-- 1. Il vincolo del modello congelato accetta il nuovo intervento. Stesso
--    corpo di 20280925231500 (versione 1, azienda, modulo_intervento, 8 MB):
--    cambia solo l'elenco. Il trigger preventivo_modello_immutabile resta.
-- 2. idr_progetti.conto_termico: cosa si toglie, cosa si installa, contributo
--    scritto a mano, modalità (sconto in fattura o rimborso), spese annue per
--    il conto del risparmio. Null per tutti gli altri preventivi.
--
-- Va applicata prima di pubblicare l'app: l'autosave del wizard manda tutti i
-- campi del modulo, e senza la colonna il salvataggio fallirebbe.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.idr_progetti add column if not exists conto_termico jsonb;
alter table public.idr_progetti drop constraint if exists idr_progetti_conto_termico_oggetto;
alter table public.idr_progetti add constraint idr_progetti_conto_termico_oggetto check (
  conto_termico is null or (jsonb_typeof(conto_termico) = 'object' and octet_length(conto_termico::text) <= 65536)
);
comment on column public.idr_progetti.conto_termico is
  'Dati del preventivo Conto Termico 3.0 (src/lib/contoTermico/dati.ts): impianto sostituito, generatore, contributo GSE stimato scritto a mano, modalità, spese annue. Null per gli altri preventivi.';

do $$
declare
  v record;
begin
  for v in
    select * from (values
      ('idr_progetti', array['caldaia', 'pompa-calore', 'ibrido', 'radiante', 'terminali', 'idrico', 'acqua-calda', 'manutenzione', 'conto-termico'])
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

-- Il trigger condiviso deve esserci ancora: se manca, la migrazione si ferma.
do $$
begin
  if not exists (select 1 from pg_trigger g where g.tgrelid = 'public.idr_progetti'::regclass and g.tgname = 'preventivo_modello_immutabile') then
    raise exception 'idr_progetti: manca il trigger preventivo_modello_immutabile';
  end if;
end;
$$;
