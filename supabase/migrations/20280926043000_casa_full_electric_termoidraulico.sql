-- Casa Full Electric nel preventivatore Termoidraulico (25/09/2026).
--
-- Un decimo modello della libreria, «full-electric»: fotovoltaico, batteria,
-- pompa di calore e induzione al posto di caldaia e fornelli a gas. Il PDF è
-- quello della Casa Full Electric (FullElectricPDF): il racconto del
-- fotovoltaico (energia mese per mese, bollette prima e dopo, incentivi,
-- beneficio negli anni, ambiente) con le pagine del preventivo di
-- ristrutturazione (chi siamo, voce per voce, foto, condizioni e firma).
--
-- 1. Il vincolo del modello congelato accetta il nuovo intervento. Stesso
--    corpo di 20280926004500: cambia solo l'elenco. Il trigger
--    preventivo_modello_immutabile resta.
-- 2. idr_progetti.full_electric: i pezzi del sistema, le bollette di oggi, le
--    stime di domani e gli incentivi, tutto scritto a mano
--    (src/lib/fullElectric/dati.ts). Null per tutti gli altri preventivi.
--
-- Va applicata prima di pubblicare l'app: l'autosave del wizard manda tutti i
-- campi del modulo, e senza la colonna il salvataggio fallirebbe.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.idr_progetti add column if not exists full_electric jsonb;
alter table public.idr_progetti drop constraint if exists idr_progetti_full_electric_oggetto;
alter table public.idr_progetti add constraint idr_progetti_full_electric_oggetto check (
  full_electric is null or (jsonb_typeof(full_electric) = 'object' and octet_length(full_electric::text) <= 65536)
);
comment on column public.idr_progetti.full_electric is
  'Dati del preventivo Casa Full Electric (src/lib/fullElectric/dati.ts): pezzi del sistema, bollette di oggi, produzione e consumi stimati, incentivi scritti a mano. Null per gli altri preventivi.';

do $$
declare
  v record;
begin
  for v in
    select * from (values
      ('idr_progetti', array['caldaia', 'pompa-calore', 'ibrido', 'radiante', 'terminali', 'idrico', 'acqua-calda', 'manutenzione', 'conto-termico', 'full-electric'])
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
