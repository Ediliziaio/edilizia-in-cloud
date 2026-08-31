-- Chiusura del mese dei servizi: una riga per cliente-servizio per periodo.
--
-- Finora gli incassi mensili si inserivano uno per uno dal dialog del singolo
-- cliente, e nulla impediva di crearne due per lo stesso mese: il Fatturato
-- Servizi li avrebbe sommati entrambi. Con la generazione in blocco il rischio
-- diventa concreto (basta premere due volte "chiudi il mese"), quindi il
-- vincolo va messo prima della funzione che lo userebbe.
--
-- Serve anche come chiave di upsert: la chiusura del mese puo' cosi' essere
-- rieseguita per correggere le basi di provvigione senza duplicare nulla.
--
-- La tabella e' vuota (0 righe al 31/08/2026), quindi non c'e' nulla da
-- bonificare prima.

CREATE UNIQUE INDEX IF NOT EXISTS aedix_service_billings_cliente_periodo_uniq
  ON public.aedix_service_billings (service_client_id, periodo);

COMMENT ON INDEX public.aedix_service_billings_cliente_periodo_uniq IS
  'Un solo incasso per cliente-servizio per mese. Chiave di upsert della chiusura del mese.';
