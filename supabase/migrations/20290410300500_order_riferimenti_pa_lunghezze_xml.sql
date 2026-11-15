-- 15/11/2026, dal collaudo dei lotti 4-5: due campi di order_riferimenti_pa finiscono
-- nell'XML FatturaPA con un limite di lunghezza, e senza controllo la fattura si bloccava
-- solo all'invio.
--   numero → IdDocumento (DatiContratto / DatiOrdineAcquisto / DatiConvenzione): max 20
--   lotto  → NumItem: max 20
-- Il codice commessa/convenzione (CodiceCommessaConvenzione, 100) non è una colonna della
-- commessa: si scrive sulla fattura, dove il campo ha già maxLength 100.
-- Prima di questa migrazione l'unica riga oltre il limite era quella di prova su Demo 2
-- («Lotto 1 — scuola media», 22 caratteri), accorciata a «Lotto 1».
-- Un CHECK, non una regola d'accesso. Idempotente.

set local lock_timeout = '3s';

alter table public.order_riferimenti_pa drop constraint if exists order_riferimenti_pa_numero_lunghezza;
alter table public.order_riferimenti_pa add constraint order_riferimenti_pa_numero_lunghezza
  check (numero is null or char_length(numero) <= 20);
alter table public.order_riferimenti_pa drop constraint if exists order_riferimenti_pa_lotto_lunghezza;
alter table public.order_riferimenti_pa add constraint order_riferimenti_pa_lotto_lunghezza
  check (lotto is null or char_length(lotto) <= 20);
