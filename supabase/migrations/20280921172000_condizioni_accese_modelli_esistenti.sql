-- ════════════════════════════════════════════════════════════════════════════
-- Condizioni generali accese nei quattro modelli che le avevano spente per default
-- ════════════════════════════════════════════════════════════════════════════
--
-- Fino al 21/09/2026 fv_template_pdf e sr_template_pdf nascevano con le
-- condizioni spente (vedi 20280921171000). Quattro modelli erano rimasti così,
-- senza una riga di testo: i loro preventivi uscivano senza condizioni generali,
-- senza seconda firma e senza clausole approvate. Deciso con Florin il 21/09:
-- si accendono; con il testo vuoto esce quello di base del settore, che
-- l'azienda può poi modificare. Il modulo di recesso resta spento.
--
-- Solo queste quattro aziende, e solo se le condizioni sono ancora spente e
-- vuote: rilanciata, non tocca un modello che nel frattempo qualcuno ha deciso.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '30s';

update public.sr_template_pdf
   set condizioni_legali_attivo = true
 where company_id in (
         '421f4929-04bc-406d-b0fd-3ff4d57a64ee',  -- Best Infissi S.r.l.
         '2f7ebdf7-218e-4847-9d48-ac3c2218f0ff',  -- Infissi e Living srls
         'f2a16dd8-36c3-4d92-8d78-267d6374dcb5'   -- renova solution srl
       )
   and condizioni_legali_attivo = false
   and coalesce(trim(condizioni_legali_testo), '') = '';

update public.fv_template_pdf
   set condizioni_legali_attivo = true
 where company_id = '778a2c76-1253-49f2-a5e8-283363ac3e29'  -- Demo Azienda S.r.l.
   and condizioni_legali_attivo = false
   and coalesce(trim(condizioni_legali_testo), '') = '';
