-- IVA mista a mano sul prezzo scritto a mano dell'offerta (prezzo_manuale).
-- Le due quote 10%/22% che ripartiscono il prezzo, nello stesso formato di
-- orders.vat_breakdown ({version:1, input_mode, quota_10, quota_22}). Additiva e
-- istantanea: nessuna scrittura di righe. Quando è NULL vale l'aliquota unica
-- prezzo_manuale_iva_pct, come prima.
alter table public.quotes
  add column if not exists prezzo_manuale_iva_mista jsonb;

comment on column public.quotes.prezzo_manuale_iva_mista is
  'IVA mista a mano sul prezzo scritto a mano (prezzo_manuale): {version:1, input_mode, quota_10, quota_22}, come orders.vat_breakdown. NULL = aliquota unica (prezzo_manuale_iva_pct).';
