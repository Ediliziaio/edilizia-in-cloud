-- render_bagno_sessions non aveva alcuna colonna di errore.
--
-- Le altre nove tabelle render hanno `error_message`. Il bagno no: un render
-- fallito passava a stato 'errore' (o tornava ad 'analysis_done' se falliva
-- l'analisi) senza alcun motivo scritto in sessione — il messaggio finiva solo
-- nei log e nei metadata del rimborso crediti. Dalla tabella un fallimento era
-- indistinguibile da una bozza mai avviata (audit 2026-09-02: 9 sessioni
-- "non completate" e nessun modo di sapere se qualcuna fosse un errore).
-- Applicata a prod via MCP il 2026-09-02. Idempotente.

ALTER TABLE public.render_bagno_sessions
  ADD COLUMN IF NOT EXISTS error_message text;

COMMENT ON COLUMN public.render_bagno_sessions.error_message IS
  'Motivo dell''ultimo fallimento (analisi o render), scritto dall''edge generate-bathroom-render. NULL se l''ultima esecuzione e'' andata a buon fine.';
