-- Calendari: mittente proprio per le email dell'appuntamento (22/09/2026).
--
-- Conferma, promemoria, spostamento e disdetta partivano tutte dal mittente
-- di riserva della piattaforma («EdiliziaInCloud <no-reply@notifiche…>»),
-- anche quando l'azienda ha un dominio suo verificato. Flo vuole che le email
-- degli appuntamenti di Edilizia in Cloud arrivino come le altre, da mkt:
-- «Filippo di EdiliziaInCloud <flo@mkt.ediliziaincloud.com>».
--
--   mittente_nome    il nome che legge il cliente;
--   mittente_email   l'indirizzo: vale solo se il suo dominio è attivo e
--                    verificato nella scheda Dominio email dell'azienda
--                    (company_email_domains); altrimenti si resta sul
--                    mittente di sempre. Vuoto = come prima.

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.marketing_calendars
  ADD COLUMN IF NOT EXISTS mittente_nome text,
  ADD COLUMN IF NOT EXISTS mittente_email text;
