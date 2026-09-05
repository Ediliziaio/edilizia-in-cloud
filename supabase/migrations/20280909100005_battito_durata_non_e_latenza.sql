-- `durata_ms` sembra la latenza della piattaforma e non lo è. pg_net non
-- registra quando la risposta è arrivata, solo quando il suo worker l'ha
-- scritta in tabella: fra le due cose passano secondi. La prima misura reale
-- ha detto 6 ms in prova diretta e 4.127 ms dal cron, sulla stessa chiamata.
--
-- Il numero resta perché un limite superiore serve — se diventa enorme qualcosa
-- non va — ma va chiamato per quello che è, e non va mostrato come latenza.

COMMENT ON COLUMN public.battito_esterno.durata_ms IS
  'Tempo fra la partenza della sonda e la scrittura della risposta da parte del worker pg_net. NON è la latenza della piattaforma: include il ritardo del worker, che può essere di secondi. Usarlo solo come limite superiore.';
