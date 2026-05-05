-- ────────────────────────────────────────────────────────────────────────────
-- Fix: race condition su auto-recharge (elevenlabs-webhook + internal-agent-webhook)
-- ────────────────────────────────────────────────────────────────────────────
-- Entrambi i webhook facevano: SELECT settings → if threshold → UPDATE balance +
-- INSERT topup. Due webhook concorrenti sulla stessa company leggevano stesso
-- balance, due ricariche eseguite, totale = 2x l'importo configurato.
-- Rimpiazziamo con RPC atomica che usa UPDATE con WHERE per ricaricare una sola
-- volta e inserire un solo topup log.

CREATE OR REPLACE FUNCTION public.maybe_auto_recharge(
  p_company_id uuid
)
RETURNS TABLE(
  recharged boolean,
  amount_recharged numeric,
  new_balance numeric,
  payment_method text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold numeric;
  v_amount numeric;
  v_method text;
  v_enabled boolean;
  v_rows_updated int;
  v_new_balance numeric;
BEGIN
  SELECT
    COALESCE(auto_recharge_enabled, false),
    COALESCE(auto_recharge_threshold, 5),
    COALESCE(auto_recharge_amount, 20),
    COALESCE(auto_recharge_method, 'card')
  INTO v_enabled, v_threshold, v_amount, v_method
  FROM public.ai_credits
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF NOT v_enabled THEN
    RETURN QUERY SELECT false::boolean, 0::numeric, 0::numeric, v_method;
    RETURN;
  END IF;

  -- UPDATE condizionale: se saldo <= soglia, ricarica. Atomico rispetto al
  -- SELECT FOR UPDATE sopra che tiene lock sulla row.
  UPDATE public.ai_credits
  SET
    balance_eur = ROUND((balance_eur + v_amount)::numeric, 4),
    total_recharged_eur = ROUND((COALESCE(total_recharged_eur, 0) + v_amount)::numeric, 4),
    updated_at = NOW()
  WHERE company_id = p_company_id
    AND balance_eur <= v_threshold
  RETURNING balance_eur INTO v_new_balance;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    -- saldo già sopra soglia (forse già ricaricato da un altro webhook concorrente)
    RETURN QUERY SELECT false::boolean, 0::numeric, COALESCE(v_new_balance, 0::numeric), v_method;
    RETURN;
  END IF;

  -- log del topup
  INSERT INTO public.ai_credit_topups (
    company_id, amount_eur, type, status, payment_method, notes, processed_at
  ) VALUES (
    p_company_id, v_amount, 'auto', 'completed', v_method,
    'Ricarica automatica atomica (threshold €' || v_threshold::text || ')',
    NOW()
  );

  RETURN QUERY SELECT true::boolean, v_amount, v_new_balance, v_method;
END;
$$;

COMMENT ON FUNCTION public.maybe_auto_recharge IS
  'Esegue auto-recharge atomica se balance <= threshold. Usata dai webhook ElevenLabs per evitare doppie ricariche sotto concorrenza.';

-- ────────────────────────────────────────────────────────────────────────────
-- Fix: race condition su orders.total_amount (firma-odv-webhook)
-- ────────────────────────────────────────────────────────────────────────────
-- firma-odv-webhook faceva SELECT total_amount + UPDATE con valore calcolato —
-- due OdV firmati simultaneamente sullo stesso ordine perdevano uno dei due
-- incrementi. RPC atomica che usa UPDATE con arithmetic in-place.

CREATE OR REPLACE FUNCTION public.increment_order_total(
  p_order_id uuid,
  p_delta numeric
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.orders
  SET total_amount = COALESCE(total_amount, 0) + p_delta
  WHERE id = p_order_id;
$$;

COMMENT ON FUNCTION public.increment_order_total IS
  'Aggiorna atomicamente orders.total_amount. Usata da firma-odv-webhook per evitare race condition su OdV concorrenti.';

-- ────────────────────────────────────────────────────────────────────────────
-- Idempotency: whatsapp webhook duplicates + internal_call_logs unique
-- ────────────────────────────────────────────────────────────────────────────

-- Alcune migration successive di aprile aggiungono indici/colonne a
-- whatsapp_messages, mentre la creazione originaria era stata datata molto più
-- avanti. Definiamo qui lo schema base così un DB pulito può migrare da zero.
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  operaio_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  current_cantiere_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  state TEXT DEFAULT 'idle' CHECK (state IN (
    'idle', 'awaiting_cantiere', 'awaiting_confirmation',
    'collecting_rapportino', 'collecting_presenze'
  )),
  state_data JSONB DEFAULT '{}',
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cantiere_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  operaio_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  wa_message_id TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_phone TEXT NOT NULL,
  to_phone TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN (
    'text', 'image', 'document', 'audio', 'video', 'location', 'sticker'
  )),
  content_text TEXT,
  media_url TEXT,
  media_storage_path TEXT,
  ai_intent TEXT CHECK (ai_intent IN (
    'rapportino', 'ddt', 'foto_cantiere', 'presenze',
    'segnalazione', 'domanda', 'conferma', 'annulla', 'unknown'
  )),
  ai_confidence NUMERIC(3,2),
  ai_extracted_data JSONB DEFAULT '{}',
  processing_status TEXT DEFAULT 'received' CHECK (processing_status IN (
    'received', 'processing', 'processed', 'failed', 'requires_confirmation'
  )),
  processing_error TEXT,
  linked_record_type TEXT,
  linked_record_id UUID,
  session_id UUID REFERENCES public.whatsapp_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- wa_message_id deve essere unico per azienda. Guard nel webhook + index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_message_id
  ON public.whatsapp_messages(wa_message_id)
  WHERE wa_message_id IS NOT NULL;

-- internal_call_logs idempotency check key
CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_call_logs_el_conv_id
  ON public.internal_call_logs(elevenlabs_conversation_id)
  WHERE elevenlabs_conversation_id IS NOT NULL;
