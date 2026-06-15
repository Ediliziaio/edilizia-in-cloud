-- ── Outreach · Open-tracking (opt-in, default OFF) ───────────────────────────
-- Tracciamento APERTURE per il cold outreach, disattivato di default: il pixel
-- 1×1 peggiora la deliverability nel freddo, quindi si attiva PER SEQUENZA solo
-- quando serve davvero (toggle nel builder cadenze).
--
--   outreach_send_queue.opened_at / open_count  ← l'endpoint outreach-track-open
--     registra la prima apertura (opened_at) e incrementa open_count ad ogni hit.
--   outreach_sequences.track_opens              ← flag opt-in per-sequenza; il
--     dispatcher inietta il pixel SOLO se true (altrimenti nessun pixel).
--
-- Idempotente (ADD COLUMN IF NOT EXISTS).

ALTER TABLE public.outreach_send_queue
  ADD COLUMN IF NOT EXISTS opened_at  timestamptz,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.outreach_sequences
  ADD COLUMN IF NOT EXISTS track_opens boolean NOT NULL DEFAULT false;

-- Incremento atomico dell'apertura (chiamato dall'endpoint outreach-track-open via
-- service_role): open_count+1 e opened_at=coalesce(opened_at, now()) in un solo
-- statement, così aperture concorrenti non si pestano (no read-modify-write race).
-- SECURITY DEFINER + search_path bloccato: l'endpoint gira con service_role ma
-- manteniamo la funzione autocontenuta e idempotente (CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION public.outreach_register_open(p_queue_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.outreach_send_queue
     SET open_count = open_count + 1,
         opened_at  = COALESCE(opened_at, now())
   WHERE id = p_queue_id;
$$;

-- Solo i ruoli interni invocano l'RPC (l'endpoint usa service_role). Niente
-- esecuzione per anon/authenticated: l'apertura si registra solo via edge firmata.
REVOKE ALL ON FUNCTION public.outreach_register_open(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.outreach_register_open(uuid) TO service_role;
