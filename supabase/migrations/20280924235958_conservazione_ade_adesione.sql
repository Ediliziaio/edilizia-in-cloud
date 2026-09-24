-- Conservazione a norma delle fatture elettroniche (24/09/2026).
--
-- Le fatture elettroniche, emesse e ricevute, vanno conservate in digitale con
-- un sistema a norma (DMEF 17/06/2014). Openapi, il canale d'invio della
-- fatturazione interna, non lo fa ancora: nella sua specifica l'opzione
-- legal_storage è «NOT yet available». La strada più semplice è il servizio
-- gratuito dell'Agenzia delle Entrate: conserva 15 anni tutto quello che passa
-- dallo SDI, ma l'adesione dura tre anni e si rinnova a mano.
--
-- Qui si segna quando l'azienda ha aderito, perché Impostazioni → Fatturazione
-- dica quando rinnovare. Colonna nuova e vuota: nessuna riga da riscrivere.
alter table public.anagrafica_azienda
  add column if not exists conservazione_ade_aderito_il date;

comment on column public.anagrafica_azienda.conservazione_ade_aderito_il is
  'Adesione al servizio di conservazione gratuito dell''Agenzia delle Entrate: dura 3 anni e si rinnova. Null = non segnata.';
