-- Fix race condition sul dedup dei click referral.
-- track-referral-click fa "controlla-poi-inserisci" in due query separate: senza un
-- vincolo UNIQUE, due click identici concorrenti possono inserire entrambi una riga.
-- L'indice idx_referral_clicks_dedupe_created (dedupe_key, created_at) NON e' unico.
-- dedupe_key include gia' la data del giorno, quindi (referrer_id, dedupe_key) e' la
-- chiave naturale "un click per device/landing al giorno".

-- 1) Rimuove eventuali duplicati pre-esistenti, tenendo il piu' recente per gruppo.
DELETE FROM public.referral_clicks
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY referrer_id, dedupe_key
             ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM public.referral_clicks
    WHERE dedupe_key IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- 2) Vincolo UNIQUE che rende il dedup affidabile anche sotto concorrenza.
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_clicks_referrer_dedupe
  ON public.referral_clicks (referrer_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
