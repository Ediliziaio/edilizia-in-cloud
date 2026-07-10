-- ════════════════════════════════════════════════════════════════════════════
-- FIX SCHEMA DRIFT — populate_broadcast_recipients (broadcast WhatsApp)
-- ────────────────────────────────────────────────────────────────────────────
-- La RPC era scritta contro colonne INESISTENTI:
--   • whatsapp_broadcast_recipients: usava phone_number/variables → le colonne
--     reali sono `phone` (NOT NULL) e non esiste `variables`;
--   • whatsapp_broadcasts: usava total_recipients → la colonna reale è
--     `total_contacts`;
--   • marketing_contacts: usava telefono/nome/cognome → le colonne reali sono
--     phone/telefono_normalized/first_name/last_name.
-- Risultato: OGNI submit del wizard broadcast falliva ("column does not
-- exist") lasciando un broadcast orfano in stato scheduled senza destinatari.
--
-- Correzioni incluse:
--   • Solo contatti con telefono_normalized (E.164) — invariante del canale:
--     whatsapp-send vuole numeri E.164, e il conteggio anteprima del wizard
--     ora conta la stessa cosa (una sola fonte di verità).
--   • GDPR/Meta: esclusi SEMPRE optout_whatsapp e unsubscribed (prima si
--     filtrava solo il generico opt_out — chi aveva revocato il consenso
--     WhatsApp sarebbe rientrato nei destinatari).
--   • Le variabili per-destinatario NON si salvano più sul recipient (la
--     colonna non esiste): il mapping resta su whatsapp_broadcasts.
--     template_variables e il cron le risolve al momento dell'invio.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.populate_broadcast_recipients(
  p_broadcast_id uuid,
  p_segment_filter jsonb DEFAULT '{}'::jsonb,
  p_variable_mapping jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_tipo_filter text;
  v_stato_filter text;
  v_exclude_opt_out boolean;
  v_count integer;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.whatsapp_broadcasts
  WHERE id = p_broadcast_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Broadcast % non trovato', p_broadcast_id;
  END IF;

  -- Guardia multi-tenant: solo membri della company del broadcast (o super_admin)
  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.company_id = v_company_id)
  ) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  v_tipo_filter := p_segment_filter->>'tipo';
  v_stato_filter := p_segment_filter->>'stato';
  v_exclude_opt_out := COALESCE((p_segment_filter->>'exclude_opt_out')::boolean, true);

  INSERT INTO public.whatsapp_broadcast_recipients (
    broadcast_id, contact_id, phone, status
  )
  SELECT
    p_broadcast_id,
    mc.id,
    mc.telefono_normalized,
    'pending'
  FROM public.marketing_contacts mc
  WHERE mc.company_id = v_company_id
    AND (v_tipo_filter IS NULL OR mc.tipo = v_tipo_filter)
    AND (v_stato_filter IS NULL OR mc.stato = v_stato_filter)
    AND (NOT v_exclude_opt_out OR COALESCE(mc.opt_out, false) = false)
    -- opt-out canale-specifico: SEMPRE esclusi, a prescindere dal toggle
    AND COALESCE(mc.optout_whatsapp, false) = false
    AND COALESCE(mc.unsubscribed, false) = false
    AND mc.telefono_normalized IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.whatsapp_broadcasts
  SET total_contacts = v_count
  WHERE id = p_broadcast_id;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.populate_broadcast_recipients(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.populate_broadcast_recipients(uuid, jsonb, jsonb) TO authenticated;
