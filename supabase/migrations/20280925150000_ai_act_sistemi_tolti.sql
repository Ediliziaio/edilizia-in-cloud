-- Registro AI Act: cinque sistemi tolti (25/09/2026).
--
-- ai-briefing-per-ruolo, ai-executive-briefing, ai-fraud-review,
-- ai-pricing-suggest e ai-summarize non erano chiamate da nessuna pagina né
-- da altre funzioni o cron: sono uscite dal codice e dal progetto insieme ad
-- altre 38 funzioni mai usate. Nel registro restano, spente, con data e
-- motivo: l'inventario dei sistemi AI deve dire cosa gira davvero.
-- Solo dati, cinque righe.

SET LOCAL lock_timeout = '3s';

UPDATE public.ai_system_classification
   SET enabled = false,
       metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'tolto_il', '2026-09-25',
         'motivo', 'Funzione mai collegata all''app: tolta dal codice e dal progetto.'),
       updated_at = now()
 WHERE id IN ('ai-briefing-per-ruolo', 'ai-executive-briefing', 'ai-fraud-review',
              'ai-pricing-suggest', 'ai-summarize')
   AND enabled IS DISTINCT FROM false;
