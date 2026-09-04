-- Contenitori di file destinati a dati riservati resi PRIVATI (04/09/2026).
--
-- `campo-firme` (firme dei rapportini) e `documenti-sub` (documenti dei
-- subappaltatori: visure, DURC, assicurazioni) erano pubblici, cioe' aperti a
-- chiunque conoscesse l'indirizzo del file. Oggi sono vuoti e nessuna parte
-- del codice li usa: si chiudono adesso, prima che ci finisca dentro il
-- documento di un cliente vero. Da privati si leggono con link firmati a
-- scadenza, come gia' fa il resto della piattaforma.
UPDATE storage.buckets SET public = false WHERE name IN ('campo-firme', 'documenti-sub');
