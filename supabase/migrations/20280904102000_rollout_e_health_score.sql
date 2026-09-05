-- F5-05 + F5-02 — Rilascio progressivo e punteggio di salute che agisce.
-- Applicate a produzione via MCP il 2026-09-05.
--
-- F5-05 ROLLOUT PROGRESSIVO
-- Un feature flag era acceso o spento, azienda per azienda: per provare una
-- novità bisognava sceglierle a mano una per una, e per ritirarla rifare il
-- giro al contrario. Con 17 aziende è noioso; con centinaia è impraticabile, e
-- infatti nessuno rilascerebbe mai niente a tappe.
--
-- La selezione è DETERMINISTICA e MONOTONA: hash(id_azienda || chiave)
-- mappato su 0-99. La stessa azienda ricade sempre nello stesso punto, quindi
-- allargare dal 10% al 25% aggiunge aziende senza mai toglierne — nessuno si
-- vede sparire una funzione che ieri aveva. Verificato su produzione:
-- 10% → 2 aziende, 25% → 5, 50% → 7, 100% → 17, e le 2 del 10% sono tutte
-- dentro le 5 del 25%.
-- La chiave entra nell'hash perché due rollout diversi al 10% non devono
-- colpire sempre lo stesso gruppo di cavie.
--
-- NB: si scrivono sia is_enabled sia access_level, perché
-- resolve_company_feature decide su access_level: scrivere solo il primo
-- produrrebbe un toggle che sembra fatto e non fa nulla.
--
-- F5-02 HEALTH SCORE → ATTIVITÀ
-- compute-health-scores calcola ogni notte punteggio e rischio di abbandono
-- per ogni azienda, ma quel dato restava a guardarsi: nessuno apriva
-- un'attività, nessuno veniva avvisato. Un cliente che scivola via lo si
-- scopriva quando disdiceva.
-- Ora sotto soglia si apre un'attività di recupero assegnata e datata, con
-- antirumore: una sola attività aperta per azienda, e nessuna nuova se ce n'è
-- una chiusa negli ultimi 14 giorni.

-- Le definizioni di admin_rollout_funzionalita, admin_ritira_funzionalita e
-- health_score_apri_attivita sono quelle applicate via MCP.

SELECT cron.schedule('health-score-attivita', '0 4 * * *',
  $$SELECT public.health_score_apri_attivita(50, false)$$);
