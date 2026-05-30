# STATUS-MP-SA-PROBLEMS.md
## Sessione corrente: 2026-05-30
## SuperAdmin — Problem Intelligence cross-tenant + Motore Pacchetti (READ-ONLY)

## Task
- [~] P1  Tabelle sa_company_problems + sa_problem_to_package (mapping configurabile) + RLS super_admin
- [~] P1  Fan-out sa_aggregate_company_problems (legge fonti esistenti: silvio_alerts + sa_conversation_signals) + sa_aggregate_all_problems (cron)
- [~] P1  Problem-score view (gravità × anzianità) distinto dal churn-score
- [~] P1  3 RPC readonly super_admin: sa_get_problem_radar / sa_get_company_dossier / sa_get_pipeline_per_pacchetto
- [ ] P1  silvio-admin-chat: +3 tool
- [ ] P2  Cron + verifica e2e (>1 fonte) + RLS
- [ ] P3  UI tab «Stato Clienti» (ai-monitor) — QA runtime
- [ ] P3  Commit

## Decisioni prese
- Fan-out in SQL (deterministico, niente LLM) chiamato da cron → più robusto e testabile
  di un edge dedicato (deviazione motivata dal doc, che proponeva un'edge).
- v1 fan-out da 2 fonti VERIFICATE (silvio_alerts open + sa_conversation_signals difficolta/lamentela);
  il mapping pacchetti è in tabella → fonti aggiuntive (tickets/dead_letter/margini) estendibili senza codice.
- Mapping area→pacchetto in tabella sa_problem_to_package (configurabile, soglie come parametri).

## Verifica end-to-end (prod, Demo)
- Fan-out sa_aggregate_all_problems → problemi Demo da 2 fonti: silvio_alerts (finanza×4
  overdue + cashflow, operativo low-stock, recruiting HR) + conversation (controllo_gestione
  critical da margini, finanza warning da cashflow). Area→pacchetto via tabella configurabile.
- Bug trovato+fixato: GROUP BY su s.area vs area mappata → LATERAL per area-problema.
- problem-score view (gravità×anzianità) OK. pipeline-per-pacchetto: Finanza/Cashflow 2,
  Controllo di Gestione 1, Recruiting 1, Upgrade EiC 1.
- 3 RPC super_admin (sa_get_problem_radar/company_dossier/pipeline_per_pacchetto) + 3 tool
  in silvio-admin-chat (deploy OK). Cron 03:45.
- RLS: tabelle SELECT solo super_admin; RPC con guard is_super_admin.

## RINVIATO (UI, QA runtime): tab «Stato Clienti» (ai-monitor) — semaforo + heatmap + pipeline pacchetti.
## Verifica: VERDE (backend completo + testato; UI tab rinviata)
