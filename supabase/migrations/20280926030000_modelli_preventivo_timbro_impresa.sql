-- Timbro e firma dell'impresa nel modello del preventivo (25/09/2026).
--
-- L'impresa carica una volta l'immagine di timbro e firma (PNG o JPG) nel
-- modello «offerta»; generate-quote-pdf la stampa nel riquadro «Per l'impresa»
-- di ogni preventivo, con sotto chi firma. Il file sta nel contenitore riservato
-- quote-template-assets, nella cartella dell'azienda: la funzione legge solo da
-- lì, un percorso di un'altra azienda resta fuori.
--
-- Due colonne vuote in più: nessuna riga da scrivere, nessun permesso da
-- cambiare (quote_templates ha i permessi sull'intera tabella e le sue policy).

set local lock_timeout = '3s';

alter table public.quote_templates add column if not exists timbro_firma_url text;
alter table public.quote_templates add column if not exists firmatario_impresa text;

comment on column public.quote_templates.timbro_firma_url is
  'Percorso in quote-template-assets (<company_id>/template-timbro-….png) dell''immagine di timbro e firma dell''impresa: generate-quote-pdf la stampa nel riquadro «Per l''impresa».';
comment on column public.quote_templates.firmatario_impresa is
  'Chi firma per l''impresa (es. «Mario Rossi, legale rappresentante»): nel PDF sotto la riga della firma dell''impresa.';
