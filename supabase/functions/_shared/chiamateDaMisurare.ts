/**
 * Quali chiamate finiscono nelle metriche di salute (19/09/2026).
 *
 * Tutte, tranne le chiamate da pg_net respinte (401/403).
 *
 * pg_net è il client HTTP di Postgres: lo usano i nostri job pianificati e i
 * trigger. Se il chiamante è il nostro database, il rifiuto lo registra già
 * cron_health_check dal lato di chi chiama (cron_http_failures e la
 * campanella dei super_admin): contarlo anche qui è un doppione. Se non lo è,
 * è rumore: una copia esterna del progetto (Corea, pg_net/0.14.0 — il
 * repository è pubblico e i job portano il nostro indirizzo) chiama
 * process-automation, automation-bulk-scheduler-runner e silvio-action-runner
 * con segreti che non valgono. Le sue circa 1.770 chiamate respinte al giorno
 * tenevano «Errori edge 24h» sempre acceso in Salute e coprivano gli errori
 * veri nell'elenco. Nei log di Supabase restano comunque tutte.
 *
 * Nessun import: lo prova src/test/logic/chiamateDaMisurare.test.ts.
 */
export function daMisurare(agente: string | null | undefined, stato: number): boolean {
  const daPgNet = String(agente ?? "").trim().toLowerCase().startsWith("pg_net/");
  return !(daPgNet && (stato === 401 || stato === 403));
}
