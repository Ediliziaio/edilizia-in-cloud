-- Permessi delle Impostazioni nel database — una funzione di trigger non ha bisogno di EXECUTE
-- Applicata il 10/10/2026 con apply_migration, registro riallineato al nome del file (CLAUDE.md). Si può rilanciare senza effetti (DROP … IF EXISTS prima di ogni CREATE).
--
-- matura_buono_pasto_da_giornata() è la funzione del trigger trg_matura_buono_pasto su hr_giornate: il privilegio EXECUTE non
-- viene controllato quando il trigger scatta, quindi si toglie a PUBLIC, anon e authenticated (regola del progetto per le funzioni di trigger).

set local lock_timeout = '3s';

revoke execute on function public.matura_buono_pasto_da_giornata() from public, anon, authenticated;
