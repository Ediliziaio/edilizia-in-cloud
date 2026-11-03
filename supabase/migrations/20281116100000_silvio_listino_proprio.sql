-- Silvio ha il suo listino (3/11/2026). Con la cache il costo per domanda e' sceso del 70% e il prezzo
-- gli andava dietro: pagando per token a 1,925 €/M, la domanda dalla cache lasciava ~0,09 € di margine.
-- A 3,85 €/M in ingresso (15,40 in uscita) la stessa domanda costa al cliente ~0,26 € invece dei ~0,47 €
-- di prima e lascia ~0,21 €. Il pavimento di 3 volte il costo vero resta, e decide lui sulle chiamate
-- senza cache: la prima domanda e il brief del mattino non cambiano.
-- Si torna indietro rimettendo tier_key = 't2_vision' sulle due righe di ai_router_config.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

insert into public.ai_pricing_tiers
  (tier_key, tier_label, tier_description, display_name_to_company, cost_per_1m_input_eur, cost_per_1m_output_eur,
   markup_pct, customer_label, enabled, sort_order, min_markup_multiplier)
values
  ('t2_silvio', 'T2 — Silvio', 'Chat Silvio: prezzo a token proprio, la cache abbassa il costo ma non il prezzo fino al pavimento',
   'AI Standard', 1.100000, 4.400000, 350.00, 'AI Standard', true, 35, 3.0)
on conflict (tier_key) do nothing;

update public.ai_router_config
   set tier_key = 't2_silvio'
 where task_key in ('persona_silvio', 'persona_silvio_lettura') and tier_key is distinct from 't2_silvio';
