-- Il modello della libreria dentro i preventivi di Bagni, Climatizzazione, Elettrico,
-- Termoidraulico, Pavimenti, Piscine e Ristrutturazione (25/09/2026).
--
-- Come per Tetti (20260924134009) e Serramenti (20260924125854): un preventivo che
-- nasce da un intervento della libreria («Da vasca a doccia», «Quadro elettrico»…)
-- congela nel progetto il modello dell'azienda per quell'intervento, e il PDF usa
-- quello (src/lib/moduli/modelloPreventivo.ts). Null per i preventivi senza modello:
-- per loro non cambia niente.
--
-- Il modello non si sostituisce dopo la creazione: una revisione del modello vale
-- per i preventivi nuovi, non per quelli già mandati al cliente. Contiene testi e
-- impostazioni del documento, mai prezzi o costi. Nessun permesso nuovo: valgono
-- quelli di ciascuna tabella.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Una sola funzione per il divieto di sostituzione, per tutte e sette le tabelle.
create or replace function public.preventivo_modello_immutabile()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if new.modello_snapshot is distinct from old.modello_snapshot then
    raise exception 'Il modello di un preventivo salvato non può essere sostituito. Crea una nuova offerta.';
  end if;
  return new;
end;
$$;

revoke all on function public.preventivo_modello_immutabile() from public, anon, authenticated;

do $$
declare
  v record;
begin
  for v in
    select * from (values
      ('bgn_progetti', array['completo', 'vasca-doccia', 'doccia', 'sanitari', 'accessibilita', 'rinnovo']),
      ('clm_progetti', array['monosplit', 'multisplit', 'canalizzato', 'sostituzione', 'manutenzione', 'vmc']),
      ('ele_progetti', array['completo', 'adeguamento', 'punti', 'quadro', 'domotica', 'videocitofonia', 'ricarica']),
      ('idr_progetti', array['caldaia', 'pompa-calore', 'ibrido', 'radiante', 'terminali', 'idrico', 'acqua-calda', 'manutenzione']),
      ('pav_progetti', array['sovrapposizione', 'rifacimento', 'resina', 'parquet', 'pareti', 'esterni']),
      ('pis_progetti', array['nuova', 'ristrutturazione', 'rivestimento', 'impianti', 'accessori', 'manutenzione']),
      ('rst_progetti', array['completa', 'parziale', 'commerciale', 'spazi', 'computo'])
    ) as t(tabella, modelli)
  loop
    execute format('alter table public.%I add column if not exists modello_snapshot jsonb', v.tabella);
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
    execute format('comment on column public.%I.modello_snapshot is %L', v.tabella,
      'Il modello della libreria congelato con il preventivo (src/lib/moduli/modelloPreventivo.ts): testi e impostazioni del documento, mai prezzi. Null senza modello.');
    execute format('drop trigger if exists preventivo_modello_immutabile on public.%I', v.tabella);
    execute format('create trigger preventivo_modello_immutabile before update of modello_snapshot on public.%I '
      || 'for each row execute function public.preventivo_modello_immutabile()', v.tabella);
  end loop;
end;
$$;

-- Se una tabella non ha colonna, vincolo e trigger, la migrazione si ferma.
do $$
declare
  v_mancano text;
begin
  select string_agg(t, ', ') into v_mancano
    from unnest(array['bgn_progetti', 'clm_progetti', 'ele_progetti', 'idr_progetti', 'pav_progetti', 'pis_progetti', 'rst_progetti']) as t
   where not exists (select 1 from information_schema.columns c
                      where c.table_schema = 'public' and c.table_name = t and c.column_name = 'modello_snapshot')
      or not exists (select 1 from pg_constraint k where k.conrelid = ('public.' || t)::regclass and k.conname = t || '_modello_valido')
      or not exists (select 1 from pg_trigger g where g.tgrelid = ('public.' || t)::regclass and g.tgname = 'preventivo_modello_immutabile');
  if v_mancano is not null then
    raise exception 'Modello nel preventivo non predisposto per: %', v_mancano;
  end if;
end;
$$;
