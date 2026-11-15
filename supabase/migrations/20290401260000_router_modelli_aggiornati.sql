-- Router AI: modelli più nuovi dove costano meno (15/11/2026)
--
-- Misurato sugli ultimi 30 giorni di ai_router_usage_log: Sonnet 5.5 costa circa 1,79 $ per milione
-- di token equivalenti contro 2,37 $ di Sonnet 4.5 (e Sonnet 4.5 aveva più cache). Silvio, la
-- voce più cara, girava ancora su Sonnet 4.5 con riserve gpt-4o (vecchio, 2,5/10 $ al milione).
--
-- 1. Chi ha Sonnet 4.5 come principale passa a Sonnet 5.5; Sonnet 4.5 diventa la prima riserva.
-- 2. gpt-4o tra le riserve diventa Haiku 4.5 (più nuovo e meno caro).
-- 3. Le catene perdono i doppioni e il modello principale ripetuto fra le riserve.
-- Tocca solo ai_router_config (una sessantina di righe). Rieseguita non cambia niente.

with nuovo as (
  select c.id,
         case when c.primary_model = 'anthropic/claude-sonnet-4.5' then 'anthropic/claude-sonnet-5.5' else c.primary_model end as p,
         (case when c.primary_model = 'anthropic/claude-sonnet-4.5' then '["anthropic/claude-sonnet-4.5"]'::jsonb else '[]'::jsonb end)
         || coalesce((select jsonb_agg(case when x.e = 'openai/gpt-4o' then 'anthropic/claude-haiku-4.5' else x.e end order by x.o)
                        from jsonb_array_elements_text(c.fallback_models) with ordinality x(e, o)), '[]'::jsonb) as f
    from public.ai_router_config c
   where jsonb_typeof(c.fallback_models) = 'array'
), pulito as (
  select n.id, n.p,
         coalesce((select jsonb_agg(y.e order by y.primo)
                     from (select z.e, min(z.o) as primo
                             from jsonb_array_elements_text(n.f) with ordinality z(e, o)
                            where z.e <> n.p
                            group by z.e) y), '[]'::jsonb) as f
    from nuovo n
)
update public.ai_router_config c
   set primary_model = p.p, fallback_models = p.f
  from pulito p
 where c.id = p.id
   and (c.primary_model is distinct from p.p or c.fallback_models is distinct from p.f);
