-- ════════════════════════════════════════════════════════════════════════════
-- Condizioni generali accese di serie anche nei modelli Fotovoltaico e Serramenti
-- ════════════════════════════════════════════════════════════════════════════
--
-- Dal 20/09/2026 il preventivo firmato porta le condizioni generali: se l'azienda
-- non le ha scritte, esce il testo di base del settore — a meno che non le abbia
-- spente. Negli otto moduli edili la colonna nasce accesa; in fv_template_pdf e
-- sr_template_pdf nasceva SPENTA, quindi ogni modello nuovo usciva senza
-- condizioni, senza seconda firma e senza clausole approvate, anche se nessuno
-- aveva deciso di toglierle (il 21/09: 3 modelli Serramenti su 6, 1 Fotovoltaico
-- su 2, tutti senza una riga di testo).
--
-- Qui cambia solo il valore per i modelli nuovi. I modelli esistenti restano
-- come sono: quelli spenti si accendono solo su decisione, azienda per azienda.
-- Cambiare il default non riscrive la tabella.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

alter table public.fv_template_pdf alter column condizioni_legali_attivo set default true;
alter table public.sr_template_pdf alter column condizioni_legali_attivo set default true;
