-- `v_rendiconti_giornalieri` tornava a leggere coi permessi del proprietario
-- ─────────────────────────────────────────────────────────────────────────
-- 28/11/2026, trovato dal controllo «Critical tests / core» al primo push: il test
-- `vistePermessiDiChiLegge` ha visto che la vista è stata **riscritta** in
-- `20290630100000_rendiconto_modificabile_e_trasporti` senza che nessun file le ridesse
-- `security_invoker`. `CREATE OR REPLACE VIEW` lo toglie in silenzio.
--
-- Non era un difetto solo sulla carta. Provato con un utente vero di un'altra azienda
-- (2D S.r.l.): **vedeva tutti e 30 i rendiconti di Demo Azienda 2** — giorni, descrizioni dei
-- lavori, totali. La vista non filtra per azienda da sé: si fida delle regole per riga di
-- `rendiconti_giornalieri`, che valgono solo se la vista legge coi permessi di chi chiede.
--
-- È la seconda volta che questa trappola morde il progetto (la prima, il 09/11/2026, su
-- `v_cg_costi_classificati`): per questo esiste il test, e per questo il test guarda i file e non
-- il database.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

alter view public.v_rendiconti_giornalieri set (security_invoker = true);
