-- ============================================================================
-- v8.6.81 — Render Packs Alignment con piano €30 = 30 render
--
-- Allinea i pacchetti di render extra ai prezzi commerciali coerenti col
-- piano base (€30/mese per 30 render → €1/render base).
--
-- Logica sconto progressiva:
--   Pack 10  →  €9,00  →  €0.90 / render  (-10% vs base)
--   Pack 30  →  €25,00 →  €0.83 / render  (top-up mensile)
--   Pack 50  →  €39,00 →  €0.78 / render  (popular)
--   Pack 100 →  €69,00 →  €0.69 / render
--   Pack 300 →  €180,00→  €0.60 / render
--
-- I 4 pack seed originali (4.90/17.90/39.90/139) erano cost-price interni,
-- non revenue. Li disattiviamo (NON eliminiamo per non rompere FK su
-- render_credit_purchases.pack_id).
-- ============================================================================

-- ─── 1. Disattiva pack legacy ───────────────────────────────────────────────
UPDATE public.render_credit_packs
   SET is_active = false,
       updated_at = now()
 WHERE sku IN (
   'pack_starter_50',
   'pack_pro_200',
   'pack_business_500',
   'pack_enterprise_2000'
 );

-- ─── 2. Upsert nuovi pack commerciali ───────────────────────────────────────
INSERT INTO public.render_credit_packs
  (sku, label, credits_amount, price_eur, sort_order, is_active)
VALUES
  ('pack_render_10',  'Ricarica veloce',  10,  9.00,   1, true),
  ('pack_render_30',  'Top-up mensile',   30,  25.00,  2, true),
  ('pack_render_50',  'Render Pro',       50,  39.00,  3, true),
  ('pack_render_100', 'Render Business',  100, 69.00,  4, true),
  ('pack_render_300', 'Render Studio',    300, 180.00, 5, true)
ON CONFLICT (sku) DO UPDATE
  SET label          = EXCLUDED.label,
      credits_amount = EXCLUDED.credits_amount,
      price_eur      = EXCLUDED.price_eur,
      sort_order     = EXCLUDED.sort_order,
      is_active      = true,
      updated_at     = now();

-- ─── 3. View comoda: pack attivi ordinati ───────────────────────────────────
CREATE OR REPLACE VIEW public.v_active_render_packs AS
SELECT
  id,
  sku,
  label,
  credits_amount,
  price_eur,
  price_per_credit_eur,
  sort_order
FROM public.render_credit_packs
WHERE is_active = true
ORDER BY sort_order ASC, credits_amount ASC;

GRANT SELECT ON public.v_active_render_packs TO authenticated;
