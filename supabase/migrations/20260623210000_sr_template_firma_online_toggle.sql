-- Toggle per mostrare/nascondere il blocco "Firma e conferma online" (link pagina
-- pubblica del preventivo) nel PDF. Default FALSE = nascosto (richiesto: non mostrarlo
-- di default nel preventivo). Le aziende che usano la firma digitale possono riattivarlo.
alter table public.sr_template_pdf
  add column if not exists pdf_mostra_firma_online boolean not null default false;
