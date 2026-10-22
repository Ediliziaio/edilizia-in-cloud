-- Firma elettronica: la firma avanzata si accende, non è accesa di partenza.
--
-- Scelta del founder (22/10/2026): ogni azienda sceglie il proprio flusso, e il
-- punto di partenza è «come oggi», cioè la firma con il solo codice (firma
-- elettronica semplice). La firma avanzata (documento d'identità al primo
-- documento) la accende l'azienda in Impostazioni → Firma elettronica.
-- Senza riga in fea_configurazione vale 'semplice' (vedi livelloFirmaAzienda).
alter table public.fea_configurazione alter column livello_firma set default 'semplice';
