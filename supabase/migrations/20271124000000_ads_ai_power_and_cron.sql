-- Pubblicità: AI al massimo + collegamenti cron mancanti. Applicata in prod via MCP il 2026-07-02.
--
-- 1) AdsBot su tier premium: task dedicato ai_router_config 'ads_bot_chat'
--    (prima usava chat_routine → gpt-4o-mini). Primary = claude-sonnet-4.5,
--    stesso tier di Silvio/agent_complex.
INSERT INTO public.ai_router_config (task_key, task_label, task_description, primary_model, fallback_models, default_params, category)
VALUES (
  'ads_bot_chat',
  'AdsBot — consulente campagne',
  'Chat AI esperta Meta/Google Ads con contesto campagne + performance reali (pagina Pubblicità).',
  'anthropic/claude-sonnet-4.5',
  '["openai/gpt-4o", "anthropic/claude-haiku-4.5", "openrouter/auto"]'::jsonb,
  '{"temperature": 0.6, "max_tokens": 1200}'::jsonb,
  'analysis'
)
ON CONFLICT (task_key) DO UPDATE SET
  primary_model = EXCLUDED.primary_model,
  fallback_models = EXCLUDED.fallback_models,
  default_params = EXCLUDED.default_params;

-- 2) Cron mancanti: senza questi, gli insights non si aggiornavano mai da soli
--    e la guardia spesa (ad_spend_guard → autopause) NON girava MAI.
--    Stesso pattern x-cron-secret degli altri job meta-* (CRON_SECRET env).
SELECT cron.schedule(
  'meta-ads-sync-insights-4h',
  '13 */4 * * *',
  $$
  SELECT net.http_post(
    url:='https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/meta-ads-sync-insights',
    headers:='{"Content-Type":"application/json","x-cron-secret":"13035e8e9570855959a5bf9c0803d117554d8162cf63e46b"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
SELECT cron.schedule(
  'meta-ads-spend-check-hourly',
  '7 * * * *',
  $$
  SELECT net.http_post(
    url:='https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/meta-ads-spend-check',
    headers:='{"Content-Type":"application/json","x-cron-secret":"13035e8e9570855959a5bf9c0803d117554d8162cf63e46b"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
