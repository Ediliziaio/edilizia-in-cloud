-- Fatture ricevute: quando lo SDI le ha consegnate (24/09/2026).
--
-- Per detrarre l'IVA di un acquisto conta la data in cui la fattura è stata
-- RICEVUTA (art. 19 DPR 633/72; art. 1 DPR 100/1998: detraibile nel mese in cui
-- è ricevuta e registrata, o in quello dell'operazione se ricevuta entro il 15
-- del mese dopo), non quella che scrive il fornitore. La sa solo chi riceve
-- dallo SDI: openapi-fatture-ricevute la prende dalla fattura di openapi; per
-- un XML caricato a mano resta vuota.
--
-- Una colonna vuota su una tabella di poche migliaia di righe: istantaneo.

set local lock_timeout = '5s';

alter table public.fatture_ricevute
  add column if not exists data_ricezione_sdi timestamptz;

comment on column public.fatture_ricevute.data_ricezione_sdi is
  'Quando lo SDI ha consegnato la fattura al nostro canale (openapi). Conta per la detrazione dell''IVA; vuota per gli XML caricati a mano.';
