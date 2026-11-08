# STATUS-MP-FIX-CRON.md
## Sessione: 2026-05-29
## Task
- [x] P0  Far risolvere il cron secret a silvio_invoke_edge (Vault name mismatch)
- [x] P1  Fix silvio_detect_alerts_all_companies (companies.is_archived inesistente → status)

## Verifica (prod)
- Premessa del doc SUPERATA: silvio_invoke_edge NON usava più anon_key — usava già
  service_role_key + internal_cron_secret (app.settings → Vault). Ma:
  - app.settings.* NON impostati in questo progetto (verificato NULL).
  - Vault ha il secret come `silvio_internal_cron_secret`, non `internal_cron_secret`
    → nessun match → silvio_invoke_edge ritornava NULL senza invocare → brief non partivano.
- Fix applicato (migration 20270614100000): silvio_invoke_edge ora cerca
  `silvio_internal_cron_secret` nel Vault (per nome — nessun valore maneggiato) e lo usa
  come `x-internal-cron-secret` + Bearer. Le fn silvio hanno verify_jwt=false → conta l'header.
  → cron_secret_resolves = true (verificato).
- silvio_detect_alerts_all_companies(): ultimo run cron era `failed: column "is_archived"
  does not exist`. Fix: `WHERE status IN ('active','trial')`. Run manuale →
  {success:true, companies_processed:6, failures:0, cashflow_alerts_created:1}.

## Blocchi / da verificare lato OPS (non-codice, niente segreti maneggiati da me)
- Il VALORE di Vault `silvio_internal_cron_secret` deve coincidere con l'env edge
  `INTERNAL_CRON_SECRET`. Non verificabile da me (sicurezza). Se diverso → l'edge risponde
  401 (ma ora la funzione INVIA la richiesta, prima no-op silenzioso). Allinearli se serve.

## Verifica: VERDE (entrambe le funzioni applicate + testate)
