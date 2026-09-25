-- Il modello della libreria dentro i preventivi Fotovoltaico (25/09/2026).
--
-- Come per i sette preventivatori edili (20280925231500): un preventivo che nasce
-- da un intervento della libreria («Aggiunta accumulo», «Manutenzione e verifica»…)
-- congela nel progetto il modello dell'azienda per quell'intervento. Il progetto
-- lo crea fv-onboarding-cliente, che riceve il modello insieme ai dati del cliente;
-- fv-genera-pdf usa quello al posto del modello aziendale (fv_template_pdf).
-- Null per i preventivi senza modello: per loro non cambia niente. La duplicazione
-- (fv_duplica_progetto) copia la riga intera, modello compreso.
--
-- Il modello non si sostituisce dopo la creazione (preventivo_modello_immutabile).

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.fv_progetti add column if not exists modello_snapshot jsonb;

alter table public.fv_progetti drop constraint if exists fv_progetti_modello_valido;
alter table public.fv_progetti add constraint fv_progetti_modello_valido check (
  modello_snapshot is null or coalesce((
    jsonb_typeof(modello_snapshot) = 'object'
    and modello_snapshot ->> 'version' = '1'
    and modello_snapshot ->> 'modelId' in ('nuovo', 'accumulo', 'ampliamento', 'componenti', 'manutenzione')
    and modello_snapshot ->> 'companyId' = company_id::text
    and jsonb_typeof(modello_snapshot -> 'template') = 'object'
    and modello_snapshot #>> '{template,company_id}' = company_id::text
    and modello_snapshot #>> '{template,pdf_blocchi,modulo_intervento}' = modello_snapshot ->> 'modelId'
    and octet_length(modello_snapshot::text) <= 8388608
  ), false)
);

comment on column public.fv_progetti.modello_snapshot is
  'Il modello della libreria congelato con il preventivo (src/lib/moduli/modelloPreventivo.ts): testi e impostazioni del documento, mai prezzi. Null senza modello.';

drop trigger if exists preventivo_modello_immutabile on public.fv_progetti;
create trigger preventivo_modello_immutabile
  before update of modello_snapshot on public.fv_progetti
  for each row execute function public.preventivo_modello_immutabile();
