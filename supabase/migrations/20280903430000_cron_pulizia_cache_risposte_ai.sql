-- ════════════════════════════════════════════════════════════════════════════
-- La cache delle risposte AI non veniva mai ripulita
-- ════════════════════════════════════════════════════════════════════════════
-- prune_ai_response_cache() esisteva dal giorno uno e non l'ha mai chiamata
-- nessuno: nessun cron, nessuna edge function, nessun trigger.
--
-- Finche' la tabella era vuota non si vedeva — ed era vuota per un motivo
-- diverso: la cache era agganciata SOLO a `fattura_classify` e
-- `bank_categorize`, due compiti che in produzione non sono mai stati eseguiti
-- nemmeno una volta (zero righe in ai_router_usage_log). Adesso che e'
-- agganciata a compiti che girano davvero — il classificatore delle domande di
-- Silvio, i riassunti, l'estrazione dai documenti — la tabella cresce, e senza
-- pulizia crescerebbe e basta.
--
-- Le righe si cancellano una settimana DOPO la scadenza: resta una finestra per
-- guardare cosa era stato messo in cache quando qualcosa non torna.
-- ════════════════════════════════════════════════════════════════════════════

SELECT cron.unschedule('pulizia-cache-risposte-ai')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pulizia-cache-risposte-ai');

SELECT cron.schedule(
  'pulizia-cache-risposte-ai',
  '25 4 * * *',
  $$SELECT public.prune_ai_response_cache();$$
);
