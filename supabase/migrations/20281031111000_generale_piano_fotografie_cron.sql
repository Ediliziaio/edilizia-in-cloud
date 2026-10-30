-- Commesse generali — Piano economico: la fotografia di fine mese.
-- Funzione in 20281031110000 (generale_piano_fotografie_mensili).
--
-- Solo SQL: niente pg_net (non occupa la coda delle edge function), niente
-- segreti. Gira dal 28 al 31 alle 21:30 UTC (22:30 / 23:30 a Roma, ancora lo
-- stesso giorno) e scatta soltanto l'ultimo giorno del mese, ora di Roma: una
-- riga per generale con un piano in generale_fotografie, rifatta se esiste già.
-- Poche righe e ognuna in un suo blocco: una generale che non torna non ferma
-- le altre. Idempotente (il nome del job è la chiave).
select cron.schedule(
  'generale-piano-fotografie',
  '30 21 28-31 * *',
  $$select public.generale_piano_fotografie_mensili()$$
);
