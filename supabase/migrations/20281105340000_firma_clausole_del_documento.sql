-- Le clausole che chi firma approva a parte (artt. 1341-1342 c.c.) sono quelle del documento che firma.
--
-- 31/10/2026. La pagina di firma prendeva le clausole da `fea_configurazione` o, in mancanza, dalle condizioni
-- standard del settore; il contratto di subappalto da un elenco fisso. Il documento invece stampa quelle che
-- l'azienda ha scritto (modello del preventivo, testo del singolo preventivo, articoli del contratto riscritti):
-- chi firmava poteva approvare clausole diverse da quelle del suo contratto.
--
-- Ora chi invia passa le clausole lette dallo stesso testo del PDF, e restano fissate sulla richiesta di firma.
-- NULL = richiesta vecchia o invio che non le passa: vale la regola di prima. [] = il documento non ne ha.
alter table public.signature_requests add column if not exists clausole_da_approvare jsonb;

comment on column public.signature_requests.clausole_da_approvare is
  'Clausole da approvare a parte (artt. 1341-1342 c.c.) lette dal documento all''invio: [{id, testo}]. NULL = regola precedente.';
