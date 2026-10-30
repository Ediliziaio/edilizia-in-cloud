import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Le quattro funzioni lente dell'elenco in `20280920230000_cron_attese_brevi_pg_net`
 * devono servire attraverso `serveConMetricheRapida`.
 *
 * pg_net ha un solo worker e consuma un lotto di richieste dentro UNA sola
 * transazione: finché la più lenta del lotto non risponde, la coda di tutti i
 * cron resta ferma. Il 20/09/2026 queste quattro erano le più pesanti (secondi
 * al giorno passati oltre i 5 s), e sotto `Deno.serve` nudo tengono il blocco
 * per tutto il giro — fino al `timeout_milliseconds` del job, 120 o 150 secondi.
 *
 * Con `serveConMetricheRapida` a pg_net arriva 202 entro cinque secondi e il
 * lavoro finisce sotto `EdgeRuntime.waitUntil`; chi chiama dall'interfaccia
 * riceve l'esito completo come prima (il discrimine è lo User-Agent, vedi
 * rispostaRapidaCron.test.ts). In più la funzione viene misurata: nessuna delle
 * quattro compariva in `system_health_metrics`, cioè quanto tenesse ferma la
 * coda non lo sapeva nessuno.
 *
 * Questo test è un paletto: una di queste che torna a `Deno.serve` nudo rimette
 * la coda nelle condizioni del 20 settembre, e nessun controllo se ne
 * accorgerebbe prima del prossimo blocco.
 */
describe("Le funzioni lente chiamate da cron rispondono subito a pg_net", () => {
  const LENTE = [
    "meta-ads-sync-insights",
    "meta-diagnostica-messaggi",
    "auto-genera-giornale-cantiere",
    "elena-cs-health-daily",
  ];

  const sorgente = (nome: string) =>
    readFileSync(`supabase/functions/${nome}/index.ts`, "utf8");

  it.each(LENTE)("%s serve attraverso serveConMetricheRapida", (nome) => {
    const src = sorgente(nome);
    expect(src).toContain('from "../_shared/withMetricsRapida.ts"');
    expect(src).toContain(`serveConMetricheRapida("${nome}"`);
  });

  it.each(LENTE)("%s non ha più un Deno.serve nudo", (nome) => {
    // Un secondo punto di ingresso non misurato vanificherebbe la conversione.
    expect(sorgente(nome)).not.toMatch(/\bDeno\.serve\s*\(/);
  });
});
