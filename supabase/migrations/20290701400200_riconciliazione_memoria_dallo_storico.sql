-- Riconciliazione, lotto D (28/11/2026): la memoria parte dalle scelte già fatte.
--
-- Rilegge le riconciliazioni fatte da una persona (matched_by valorizzato, non 'storico') in ordine di
-- tempo: ogni abbinamento è una conferma all'istante matched_at, ogni annullamento una smentita
-- all'istante unmatched_at. Scrive SOLO nella tabella nuova tesoreria_controparti_apprese (al 28/11
-- circa 1.450 righe di bank_reconciliations da leggere, poche centinaia da scrivere): niente lock
-- sulle tabelle della banca, che si leggono e basta.
-- Idempotente: se la tabella ha già righe di un'azienda, quell'azienda si salta (lo storico l'ha già
-- letto, o i trigger stanno già lavorando e rileggerlo raddoppierebbe le conferme).
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $storico$
DECLARE e record; s record; rr public.bank_reconciliations;
BEGIN
  FOR e IN
    WITH gia AS (SELECT DISTINCT company_id FROM public.tesoreria_controparti_apprese),
    r AS (
      SELECT r.id, r.matched_at, r.unmatched_at FROM public.bank_reconciliations r
      WHERE r.matched_by IS NOT NULL AND r.match_type IS DISTINCT FROM 'storico'
        AND NOT EXISTS (SELECT 1 FROM gia WHERE gia.company_id = r.company_id)
    )
    SELECT id, true conferma, matched_at quando FROM r
    UNION ALL
    SELECT id, false, unmatched_at FROM r WHERE unmatched_at IS NOT NULL
    ORDER BY 3, 2 DESC, 1
  LOOP
    SELECT * INTO rr FROM public.bank_reconciliations WHERE id = e.id;
    FOR s IN SELECT * FROM private.tes_soggetto_riconciliazione(rr) LOOP
      PERFORM private.tes_memoria_registra(rr.transaction_id, s.soggetto, s.nome, e.conferma, e.quando);
    END LOOP;
  END LOOP;
END $storico$;
