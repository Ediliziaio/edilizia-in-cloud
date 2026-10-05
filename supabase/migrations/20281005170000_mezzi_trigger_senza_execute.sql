-- Mezzi e attrezzature: le funzioni dei trigger nuovi senza EXECUTE per nessuno.
--
-- Create il 05/10/2026 (fasi B-D) con i privilegi predefiniti dello schema:
-- l'advisor le vedeva eseguibili da anon (mezzi_allocazioni_controlla,
-- mezzi_quantita_controlla_totale) e da authenticated (anche
-- mezzi_codice_prepara, mezzi_scansioni_prepara). Chiamate via /rpc non
-- farebbero nulla (una funzione di trigger rifiuta la chiamata diretta), ma le
-- funzioni di trigger non hanno bisogno di alcun EXECUTE: il privilegio non
-- viene controllato allo scatto del trigger (vedi CLAUDE.md, «Funzioni esposte
-- ad anon»).
revoke all on function public.mezzi_allocazioni_controlla() from public, anon, authenticated;
revoke all on function public.mezzi_quantita_controlla_totale() from public, anon, authenticated;
revoke all on function public.mezzi_codice_prepara() from public, anon, authenticated;
revoke all on function public.mezzi_scansioni_prepara() from public, anon, authenticated;
