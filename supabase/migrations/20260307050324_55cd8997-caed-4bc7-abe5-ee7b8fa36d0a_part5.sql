-- 6. Seed platform pricing
INSERT INTO public.platform_pricing (llm_model, tts_model, cost_real_per_min, cost_billed_per_min, markup_multiplier, label)
VALUES
  ('gemini-2.5-flash',  'eleven_turbo_v2_5',       0.0200, 0.0400, 2.0, 'Flash + Turbo (Base)'),
  ('gemini-2.5-flash',  'eleven_multilingual_v2',  0.0300, 0.0600, 2.0, 'Flash + Multilingual'),
  ('gpt-4o-mini',       'eleven_turbo_v2_5',       0.0350, 0.0700, 2.0, 'GPT-4o Mini + Turbo'),
  ('gpt-4o-mini',       'eleven_multilingual_v2',  0.0450, 0.0900, 2.0, 'GPT-4o Mini + Multi'),
  ('gpt-4o',            'eleven_turbo_v2_5',       0.0600, 0.1200, 2.0, 'GPT-4o + Turbo (Pro)'),
  ('gpt-4o',            'eleven_multilingual_v2',  0.0700, 0.1400, 2.0, 'GPT-4o + Multi (Pro)'),
  ('claude-sonnet-4-5', 'eleven_multilingual_v2',  0.0800, 0.1600, 2.0, 'Claude Sonnet + Multi'),
  ('claude-haiku-4-5',  'eleven_turbo_v2_5',       0.0400, 0.0800, 2.0, 'Claude Haiku + Turbo')
ON CONFLICT (llm_model, tts_model) DO NOTHING;
