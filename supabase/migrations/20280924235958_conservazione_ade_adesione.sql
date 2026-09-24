-- Conservazione a norma delle fatture elettroniche (24/09/2026).
--
-- Le fatture elettroniche, emesse e ricevute, vanno conservate in digitale con
-- un sistema a norma (DMEF 17/06/2014). Openapi, il canale d'invio della
-- fatturazione interna, non lo fa ancora: nella sua specifica l'opzione
-- legal_storage è «NOT yet available». La strada più semplice è il servizio
-- gratuito dell'Agenzia delle Entrate: conserva 15 anni tutto quello che passa
-- dallo SDI. La convenzione dura tre anni e si rinnova da sola, salvo revoca
-- (FAQ n. 34 dell'Agenzia, aggiornata il 23/04/2021).
--
-- Qui si segna quando l'azienda ha aderito, perché Impostazioni → Fatturazione
-- ricordi di controllare nel portale che ogni rinnovo risulti. Colonna nuova e
-- vuota: nessuna riga da riscrivere. (Commento corretto il 24/09 sera: prima
-- diceva «si rinnova a mano», come la prima versione della convenzione, 2018.)
alter table public.anagrafica_azienda
  add column if not exists conservazione_ade_aderito_il date;

comment on column public.anagrafica_azienda.conservazione_ade_aderito_il is
  'Adesione al servizio di conservazione gratuito dell''Agenzia delle Entrate: dura 3 anni e si rinnova. Null = non segnata.';
