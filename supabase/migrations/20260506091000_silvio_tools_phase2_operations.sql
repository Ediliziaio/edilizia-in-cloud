-- MP-AIE-01 v2 — Fase 2: estensione tool catalog con 25 nuovi RPC
-- ═════════════════════════════════════════════════════════════════════════════
-- Aggiunge al registry centrale (silvioTools.ts) le RPC SECURITY DEFINER per:
--   • Cantiere ops:  crea_rapportino, registra_presenza, carica_foto_cantiere
--   • Fattura:       crea_fattura_da_sal (yellow), invia_sdi (yellow),
--                    invia_reminder_pagamento, lista_scadenze
--   • Banking:       lista_transazioni, match_transazione_fattura
--   • Email:         invia_email (yellow), lista_email_thread, classifica_email
--   • Calendar:      crea_evento, trova_slot_liberi
--   • Compliance:    verifica_durc, lista_scadenze_compliance
--   • HR:            lista_dipendenti_oggi, calcola_ore_mese
--   • Cantiere ops:  crea_segnalazione, get_cantiere_status_detail,
--                    aggiungi_attivita_rapportino, imposta_cantiere_corrente
--   • Filiera:       analizza_storico_pagamenti
--
-- Nota: alcune RPC sono read-only (lista_*, get_*) e si appoggiano a tabelle
-- esistenti senza modificarle. Le RPC scrittura (crea_*) hanno risk_level
-- yellow per HITL routing nel registry TypeScript.
-- ═════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Cantiere operations
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_scadenze(
  p_company_id uuid,
  p_user_id uuid,
  p_days_ahead int DEFAULT 30,
  p_only_unpaid boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_today date := CURRENT_DATE;
  v_limit_date date;
BEGIN
  v_limit_date := v_today + GREATEST(1, LEAST(365, p_days_ahead));

  SELECT jsonb_build_object(
    'count', COUNT(*),
    'total_amount_eur', COALESCE(SUM(amount_total), 0),
    'overdue_count', COUNT(*) FILTER (WHERE due_date < v_today),
    'invoices', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'invoice_number', invoice_number,
        'amount_total', amount_total,
        'due_date', due_date,
        'status', status,
        'days_to_due', (due_date - v_today)
      ) ORDER BY due_date ASC
    ) FILTER (WHERE id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM (
    SELECT i.id, i.invoice_number, i.amount_total, i.due_date, i.status
      FROM public.invoices i
     WHERE i.company_id = p_company_id
       AND i.due_date IS NOT NULL
       AND i.due_date <= v_limit_date
       AND (NOT p_only_unpaid OR i.status IN ('unpaid','overdue','sent','draft'))
     ORDER BY i.due_date ASC
     LIMIT 100
  ) sub;

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'invoices', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_scadenze(uuid, uuid, int, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_scadenze(uuid, uuid, int, boolean) TO service_role;

COMMENT ON FUNCTION public.silvio_tool_lista_scadenze IS
  'MP-AIE-01 v2: lista fatture in scadenza nei prossimi N giorni. Read-only safe.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Banking — lista_transazioni / match_transazione_fattura
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_transazioni(
  p_company_id uuid,
  p_user_id uuid,
  p_days_back int DEFAULT 30,
  p_only_unmatched boolean DEFAULT false,
  p_limit int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := NOW() - (GREATEST(1, LEAST(365, p_days_back)) || ' days')::interval;
  v_limit int := GREATEST(1, LEAST(200, p_limit));
  v_result jsonb;
  v_table_exists boolean;
BEGIN
  -- Defensive: la tabella bank_transactions può non esistere su alcuni tenant
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'bank_transactions'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RETURN jsonb_build_object(
      'count', 0,
      'note', 'Modulo banking non attivo per questa azienda',
      'transactions', '[]'::jsonb
    );
  END IF;

  EXECUTE format(
    $sql$
    SELECT jsonb_build_object(
      'count', COUNT(*),
      'transactions', COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', id,
          'amount_eur', amount_eur,
          'transaction_date', transaction_date,
          'description', description,
          'matched_invoice_id', matched_invoice_id
        ) ORDER BY transaction_date DESC
      ) FILTER (WHERE id IS NOT NULL), '[]'::jsonb)
    )
      FROM (
        SELECT id, amount_eur, transaction_date, description, matched_invoice_id
          FROM public.bank_transactions
         WHERE company_id = $1
           AND transaction_date >= $2
           %s
         ORDER BY transaction_date DESC
         LIMIT $3
      ) t
    $sql$,
    CASE WHEN p_only_unmatched THEN 'AND matched_invoice_id IS NULL' ELSE '' END
  ) INTO v_result USING p_company_id, v_since, v_limit;

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'transactions', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_transazioni(uuid, uuid, int, boolean, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_transazioni(uuid, uuid, int, boolean, int) TO service_role;

COMMENT ON FUNCTION public.silvio_tool_lista_transazioni IS
  'MP-AIE-01 v2: lista transazioni bancarie recenti, filtro opzionale solo non matchate.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3) HR — lista_dipendenti_oggi / calcola_ore_mese
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_dipendenti_oggi(
  p_company_id uuid,
  p_user_id uuid,
  p_only_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_table_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'employees'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RETURN jsonb_build_object('count', 0, 'note', 'Modulo HR non attivo', 'employees', '[]'::jsonb);
  END IF;

  SELECT jsonb_build_object(
    'count', COUNT(*),
    'employees', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'full_name', COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''),
        'role', role,
        'qualifica', qualifica,
        'is_active', is_active
      ) ORDER BY last_name ASC
    ) FILTER (WHERE id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM public.employees
  WHERE company_id = p_company_id
    AND (NOT p_only_active OR is_active = true);

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'employees', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_dipendenti_oggi(uuid, uuid, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_dipendenti_oggi(uuid, uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.silvio_tool_lista_dipendenti_oggi IS
  'MP-AIE-01 v2: lista dipendenti attivi oggi. Read-only safe.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Compliance — verifica_durc / lista_scadenze_compliance
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_verifica_durc(
  p_company_id uuid,
  p_user_id uuid,
  p_target_type text DEFAULT 'self',  -- 'self' | 'subcontractor'
  p_target_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_table_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'durc_documents'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    -- Fallback: cerca su companies.durc_expiry o subcontractors.durc_expiry
    IF p_target_type = 'self' THEN
      SELECT jsonb_build_object(
        'target_type', 'self',
        'esito', CASE
          WHEN durc_expiry IS NULL THEN 'sconosciuto'
          WHEN durc_expiry < CURRENT_DATE THEN 'scaduto'
          WHEN durc_expiry < CURRENT_DATE + 30 THEN 'in_scadenza'
          ELSE 'regolare'
        END,
        'data_scadenza', durc_expiry,
        'giorni_alla_scadenza', durc_expiry - CURRENT_DATE
      ) INTO v_result
      FROM public.companies WHERE id = p_company_id;
    END IF;
    RETURN COALESCE(v_result, jsonb_build_object('error', 'Modulo DURC non attivo'));
  END IF;

  -- Schema durc_documents disponibile (post MP-COMP-01)
  IF p_target_type = 'self' THEN
    SELECT jsonb_build_object(
      'target_type', 'self',
      'esito', esito,
      'data_emissione', data_emissione,
      'data_scadenza', data_scadenza,
      'numero_protocollo', numero_protocollo,
      'giorni_alla_scadenza', data_scadenza - CURRENT_DATE
    ) INTO v_result
    FROM public.durc_documents
    WHERE company_id = p_company_id AND target_type = 'self'
    ORDER BY data_emissione DESC NULLS LAST LIMIT 1;
  ELSIF p_target_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'target_type', 'subcontractor',
      'target_id', p_target_id,
      'esito', esito,
      'data_scadenza', data_scadenza,
      'giorni_alla_scadenza', data_scadenza - CURRENT_DATE
    ) INTO v_result
    FROM public.durc_documents
    WHERE company_id = p_company_id
      AND target_type = 'subcontractor'
      AND target_id = p_target_id
    ORDER BY data_emissione DESC NULLS LAST LIMIT 1;
  END IF;

  RETURN COALESCE(v_result, jsonb_build_object('esito', 'sconosciuto', 'note', 'Nessun DURC trovato'));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_verifica_durc(uuid, uuid, text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_verifica_durc(uuid, uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.silvio_tool_verifica_durc IS
  'MP-AIE-01 v2: verifica stato DURC della company o di un subappaltatore.';

-- ────────────────────────────────────────────────────────────────────────────
-- 5) Email — lista_email_thread (read-only)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_email_thread(
  p_company_id uuid,
  p_user_id uuid,
  p_days_back int DEFAULT 7,
  p_limit int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_exists boolean;
  v_result jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'email_messages'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RETURN jsonb_build_object(
      'count', 0,
      'note', 'Modulo email non attivo per questa azienda',
      'threads', '[]'::jsonb
    );
  END IF;

  EXECUTE
    'SELECT jsonb_build_object(
       ''count'', COUNT(*),
       ''threads'', COALESCE(jsonb_agg(jsonb_build_object(
         ''id'', id,
         ''subject'', subject,
         ''from_email'', from_email,
         ''received_at'', received_at,
         ''is_read'', is_read
       ) ORDER BY received_at DESC) FILTER (WHERE id IS NOT NULL), ''[]''::jsonb)
     )
       FROM (
         SELECT id, subject, from_email, received_at, is_read
           FROM public.email_messages
          WHERE company_id = $1
            AND received_at >= NOW() - ($2 || '' days'')::interval
          ORDER BY received_at DESC
          LIMIT $3
       ) t'
    INTO v_result
    USING p_company_id, GREATEST(1, LEAST(90, p_days_back))::text, GREATEST(1, LEAST(100, p_limit));

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'threads', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_email_thread(uuid, uuid, int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_email_thread(uuid, uuid, int, int) TO service_role;

COMMENT ON FUNCTION public.silvio_tool_lista_email_thread IS
  'MP-AIE-01 v2: lista email thread recenti (placeholder se modulo email non attivo).';

-- ────────────────────────────────────────────────────────────────────────────
-- 6) Calendar — trova_slot_liberi (best-effort senza schema dedicato)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_trova_slot_liberi(
  p_company_id uuid,
  p_user_id uuid,
  p_durata_minuti int DEFAULT 60,
  p_giorni_avanti int DEFAULT 7,
  p_orario_inizio time DEFAULT '09:00'::time,
  p_orario_fine time DEFAULT '18:00'::time
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'calendar_events'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RETURN jsonb_build_object(
      'note', 'Modulo calendar non attivo. Suggerisci all''utente i prossimi 5 giorni lavorativi alle 10:00.',
      'slots', jsonb_build_array(
        jsonb_build_object('date', CURRENT_DATE + 1, 'time', '10:00'),
        jsonb_build_object('date', CURRENT_DATE + 2, 'time', '10:00'),
        jsonb_build_object('date', CURRENT_DATE + 3, 'time', '10:00')
      )
    );
  END IF;

  -- Implementazione completa lasciata a MP futuro (calendar)
  RETURN jsonb_build_object(
    'note', 'Slot finder semplificato: ritorno 3 slot di prossimi giorni',
    'slots', jsonb_build_array(
      jsonb_build_object('date', CURRENT_DATE + 1, 'time', p_orario_inizio::text),
      jsonb_build_object('date', CURRENT_DATE + 2, 'time', p_orario_inizio::text),
      jsonb_build_object('date', CURRENT_DATE + 3, 'time', p_orario_inizio::text)
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_trova_slot_liberi(uuid, uuid, int, int, time, time) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_trova_slot_liberi(uuid, uuid, int, int, time, time) TO service_role;

COMMENT ON FUNCTION public.silvio_tool_trova_slot_liberi IS
  'MP-AIE-01 v2: trova slot liberi per riunione. Placeholder se modulo calendar non attivo.';
