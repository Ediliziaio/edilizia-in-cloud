-- validate_order_total controlla la coerenza fra il totale della commessa e la somma
-- delle rate (un controllo CROSS-TABELLA orders <-> order_installments). Era agganciato
-- come semplice BEFORE UPDATE ... FOR EACH ROW: scattava a META' transazione.
--
-- commessa_salva aggiorna prima la testata (SET total_amount = nuovo) e solo dopo riscrive
-- le rate con order_rate_sostituisci. Col trigger BEFORE la verifica cadeva fra i due passi,
-- quando il totale era gia' quello nuovo ma le rate erano ancora quelle vecchie: un totale
-- portato a 150.000 contro rate ferme a 12,2 veniva rifiutato ("total_amount differs
-- significantly from installments sum"), con rollback dell'intero salvataggio, anche quando
-- a fine transazione totale e rate sarebbero quadrati.
--
-- Lo portiamo a CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED, esattamente come
-- check71_erogazione_rate fa per lo stesso tipo di invariante cross-tabella: la verifica
-- avviene al commit, su dati gia' coerenti. Resta il blocco solo se totale e rate non
-- quadrano davvero a fine transazione. La funzione non cambia: legge NEW/OLD.total_amount
-- (disponibili anche in un trigger AFTER FOR EACH ROW) e si limita a sollevare o a tornare.

DROP TRIGGER IF EXISTS trg_validate_order_total ON public.orders;

CREATE CONSTRAINT TRIGGER trg_validate_order_total
  AFTER UPDATE ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_total();
