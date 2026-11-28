-- Tesoreria (lotto B, 28/11/2026): gli esiti dei movimenti già chiusi senza documento
-- diventano «chiuso» (R-CHIUSO). Da lanciare UNA volta, dopo la migrazione
-- 20290701200300_tesoreria_esiti_chiusi_senza_documento (che crea private.tes_esito_chiuso).
-- Il 28/11/2026 le righe da correggere erano 341, su 2 aziende.
--
-- Scrive su tesoreria_esiti: lotti da 500, lock_timeout corto. Se si ferma per
-- timeout, rilanciarlo: riprende da dove è arrivato (tocca solo le righe non ancora R-CHIUSO).
-- Ripetere il blocco finché «riallineati» non è 0.

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';
WITH da_fare AS (
  SELECT e.transaction_id, t.chiuso_senza_documento tipo
    FROM public.tesoreria_esiti e
    JOIN public.bank_transactions t ON t.id = e.transaction_id
   WHERE t.chiuso_senza_documento IS NOT NULL
     AND e.regola IS DISTINCT FROM 'R-CHIUSO'
   ORDER BY e.transaction_id
   LIMIT 500
   FOR UPDATE OF e SKIP LOCKED
), fatti AS (
  UPDATE public.tesoreria_esiti e
     SET esito = 'automatico', natura = 'gia_riconciliato', regola = 'R-CHIUSO', versione = 1,
         risultato = private.tes_esito_chiuso(d.tipo),
         impronta = md5(private.tes_esito_chiuso(d.tipo)::text),
         calcolato_at = now(),
         scartato_at = NULL, scartato_da = NULL, scartato_motivo = NULL, scartato_chiavi = NULL
    FROM da_fare d
   WHERE e.transaction_id = d.transaction_id
  RETURNING e.company_id
)
SELECT count(*) AS riallineati, count(DISTINCT company_id) AS aziende FROM fatti;
COMMIT;
