-- Quale modello dell'archivio usa un modello di preventivo (07/11/2026).
--
-- Florin: «le condizioni le definisco in Contratti e condizioni e le associo: non le devo modificare da
-- altre parti». Fino a oggi ogni modello di preventivo — il generico e i dieci preventivatori — teneva
-- il SUO testo delle condizioni, e cambiarle voleva dire cambiarle dieci volte.
--
-- Questa colonna è l'associazione: dice quale modello dell'archivio usa quel modello di preventivo.
-- NULL vuol dire «il predefinito dell'archivio». La regola di lettura sta in un posto solo,
-- `condizioniDelPdf` in supabase/functions/_shared/condizioniArchivio.ts:
--   copia del documento → modello associato → predefinito → testo che il modulo aveva → testo di sistema.
-- Il testo che i modelli avevano non si tocca: resta la rete per chi l'archivio non l'ha ancora usato.
--
-- `on delete set null`: archiviare o cancellare un modello non rompe un preventivatore, che torna al
-- predefinito. Solo colonne: nessuna riga scritta, quindi è istantanea e non riscrive le tabelle.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare t text;
begin
  if to_regclass('public.condizioni_modelli') is null then
    raise notice 'condizioni_modelli non esiste: niente da associare';
    return;
  end if;
  foreach t in array array[
    'quote_templates', 'bgn_template_pdf', 'clm_template_pdf', 'ele_template_pdf', 'fv_template_pdf',
    'idr_template_pdf', 'pav_template_pdf', 'pis_template_pdf', 'rst_template_pdf', 'sr_template_pdf',
    'tet_template_pdf'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format(
        'alter table public.%I add column if not exists condizioni_modello_id uuid references public.condizioni_modelli(id) on delete set null',
        t);
      execute format(
        'comment on column public.%I.condizioni_modello_id is %L', t,
        'Il modello di «Contratti e condizioni» che questo modello di preventivo usa. NULL = il predefinito dell''archivio. Il testo che il modello aveva resta come rete.');
    end if;
  end loop;
end $$;
