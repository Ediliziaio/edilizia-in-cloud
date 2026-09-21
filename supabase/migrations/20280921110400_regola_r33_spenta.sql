-- Regola R33 spenta finché le date di vendita non sono affidabili (21/09/2026).
--
-- R33 («venduto oltre il 150% della media dei 3 mesi», proponi un aumento di
-- budget) confronta il venduto del mese con la media dei tre mesi prima,
-- datando ogni contratto al momento in cui qualcuno l'ha segnato «vinto».
-- Quelle date sono piene di registrazioni a blocchi: Best Infissi ha i suoi 12
-- contratti di settembre (122.981 €) segnati tutti nello stesso giorno; BeMade
-- a giugno ne ha 58 su 93 creati e vinti lo stesso giorno, cioè importati.
-- Dall'11/09 R33 era aperta su Best e proponeva di aumentare il budget per un
-- picco che è solo il giorno in cui sono stati registrati.
--
-- Decisione del titolare del 21/09: la regola si spegne, l'allarme aperto si
-- chiude come falso positivo con la spiegazione. Per riaccenderla serve una
-- data di vendita che dica quando il contratto è stato firmato, non quando è
-- stato registrato.

SET lock_timeout = '3s';
SET statement_timeout = '30s';

UPDATE public.mkt_regole
   SET attiva = false
 WHERE id = 'R33' AND attiva;

UPDATE public.mkt_allarmi
   SET chiuso_il = now(),
       esito = 'falso_positivo',
       nota_chiusura = 'Regola R33 spenta il 21/09/2026: il venduto del mese è gonfiato da contratti registrati tutti nello stesso giorno, non da vendite del mese.',
       aggiornato_il = now()
 WHERE regola = 'R33' AND chiuso_il IS NULL;
