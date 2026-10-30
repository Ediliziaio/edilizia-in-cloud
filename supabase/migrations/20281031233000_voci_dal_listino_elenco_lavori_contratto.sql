-- Voci della lavorazione dal listino, ed elenco dei lavori nel contratto di subappalto (31/10/2026).
--
-- Dimora Torino ha caricato il suo listino manodopera (290 voci con il costo).
--   · Una fase aggiunta a mano, senza computo, prende le voci dal listino:
--     origine 'listino', origine_id = id nuovo per ogni voce (più righe della
--     stessa tariffa sulla stessa fase sono ammesse).
--   · Il contratto di subappalto porta l'elenco dettagliato dei lavori che la
--     ditta accetta: fase, descrizione, unità, quantità, prezzo, importo.
--     È una fotografia al momento del contratto: se poi le voci della commessa
--     cambiano, il contratto firmato non cambia con loro.

set local lock_timeout = '3s';

alter table public.order_work_phase_voci drop constraint if exists order_work_phase_voci_origine_check;
alter table public.order_work_phase_voci add constraint order_work_phase_voci_origine_check
  check (origine = any (array['preventivo', 'computo_rst', 'computo', 'listino']));

alter table public.contratti_subappalto
  add column if not exists elenco_lavori jsonb not null default '[]'::jsonb;

comment on column public.contratti_subappalto.elenco_lavori is
  'Elenco dei lavori accettati dal subappaltatore: [{fase, descrizione, unita, quantita, prezzo, importo, codice}]. Fotografia al momento del contratto.';
