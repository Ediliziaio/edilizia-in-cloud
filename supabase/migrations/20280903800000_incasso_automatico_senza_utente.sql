-- ════════════════════════════════════════════════════════════════════════════
-- Segnare incassata una rata falliva da qualunque processo automatico
-- ════════════════════════════════════════════════════════════════════════════
-- Catena scoperta provando la riconciliazione fatture:
--
--   UPDATE order_installments SET is_paid = true
--     → sync_installments_to_order_columns()   (aggiorna le colonne acconto/saldo)
--       → UPDATE orders
--         → trigger_automation_on_order()
--           → execute_automation('payment_received', …)
--             → assert_company_access(company_id)  → ERRORE 42501
--
-- `assert_company_access` chiede che ESISTA un utente loggato con accesso a
-- quell'azienda. Il controllo è giusto quando la funzione la chiama una persona
-- (è la difesa multi-tenant: un utente non deve poter far girare le automazioni
-- di un'altra azienda). Ma qui dentro la chiamata arriva da un TRIGGER, dentro
-- un import fatture / un cron / un webhook del provider: non c'è nessun utente,
-- e non perché qualcuno stia cercando di nascondersi — è il database che parla
-- con sé stesso.
--
-- Risultato pratico: nessun incasso registrato da un automatismo riusciva ad
-- arrivare in fondo. La UPDATE andava in errore e chiunque avesse un gestore
-- di eccezioni intorno (come i trigger del flusso di lavoro) se lo mangiava in
-- silenzio: la rata restava "non incassata" e nessuno vedeva un errore.
--
-- La correzione è chirurgica: si verifica l'accesso SOLO quando c'è un utente
-- da verificare. Cosa NON cambia — un utente loggato che chiama
-- `execute_automation` per un'altra azienda continua a ricevere lo stesso
-- rifiuto di prima: `auth.uid()` è valorizzato e l'assert viene eseguito
-- identico. Cosa cambia — le scritture fatte dal database per conto proprio
-- (service role, trigger, cron) non vengono più respinte.
--
-- Il corpo della funzione è ripreso tale e quale dalla versione in produzione:
-- l'unica differenza sono le tre righe attorno all'assert.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.execute_automation(p_trigger_type text, p_order_id uuid, p_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  auto_record RECORD;
  action_item jsonb;
  condition_item jsonb;
  all_conditions_met boolean;
  order_data RECORD;
  status_name text;
  ref_date date;
  task_due date;
BEGIN
  -- Il controllo multi-tenant vale per le chiamate di un UTENTE. Quando
  -- auth.uid() è NULL la chiamata arriva da un trigger o da un processo di
  -- sistema (service role): non c'è nessuna identità da verificare, e
  -- rifiutare qui significava bloccare ogni incasso automatico.
  IF (SELECT auth.uid()) IS NOT NULL THEN
    PERFORM public.assert_company_access(p_company_id);
  END IF;

  -- Fetch order data for condition evaluation
  SELECT o.*, os.name as status_name
  INTO order_data
  FROM orders o
  LEFT JOIN order_statuses os ON os.id = o.current_status_id
  WHERE o.id = p_order_id;

  IF order_data IS NULL THEN
    RETURN;
  END IF;

  -- Loop through active automations for this company and trigger type
  FOR auto_record IN
    SELECT * FROM automations
    WHERE company_id = p_company_id
      AND trigger_type = p_trigger_type
      AND is_active = true
  LOOP
    -- Evaluate conditions
    all_conditions_met := true;

    IF auto_record.conditions IS NOT NULL AND jsonb_array_length(auto_record.conditions) > 0 THEN
      FOR condition_item IN SELECT * FROM jsonb_array_elements(auto_record.conditions)
      LOOP
        DECLARE
          cond_field text := condition_item->>'field';
          cond_operator text := condition_item->>'operator';
          cond_value text := condition_item->>'value';
          actual_value text;
        BEGIN
          CASE cond_field
            WHEN 'current_status_name' THEN actual_value := order_data.status_name;
            WHEN 'total_amount' THEN actual_value := order_data.total_amount::text;
            WHEN 'payment_type' THEN actual_value := order_data.payment_type;
            WHEN 'has_building_bonus' THEN actual_value := order_data.has_building_bonus::text;
            WHEN 'description' THEN actual_value := order_data.description;
            ELSE actual_value := NULL;
          END CASE;

          CASE cond_operator
            WHEN 'equals' THEN
              IF actual_value IS DISTINCT FROM cond_value THEN all_conditions_met := false; END IF;
            WHEN 'not_equals' THEN
              IF actual_value IS NOT DISTINCT FROM cond_value THEN all_conditions_met := false; END IF;
            WHEN 'greater_than' THEN
              IF actual_value IS NULL OR actual_value::numeric <= cond_value::numeric THEN all_conditions_met := false; END IF;
            WHEN 'less_than' THEN
              IF actual_value IS NULL OR actual_value::numeric >= cond_value::numeric THEN all_conditions_met := false; END IF;
            WHEN 'contains' THEN
              IF actual_value IS NULL OR position(cond_value in actual_value) = 0 THEN all_conditions_met := false; END IF;
            ELSE
              all_conditions_met := false;
          END CASE;

          IF NOT all_conditions_met THEN EXIT; END IF;
        END;
      END LOOP;
    END IF;

    IF NOT all_conditions_met THEN CONTINUE; END IF;

    IF auto_record.actions IS NOT NULL THEN
      FOR action_item IN SELECT * FROM jsonb_array_elements(auto_record.actions)
      LOOP
        CASE action_item->>'type'
          WHEN 'create_task' THEN
            task_due := NULL;
            IF action_item->'config'->>'due_date_reference' IS NOT NULL THEN
              CASE action_item->'config'->>'due_date_reference'
                WHEN 'work_start_date' THEN ref_date := order_data.work_start_date;
                WHEN 'work_end_date' THEN ref_date := order_data.work_end_date;
                WHEN 'expected_date' THEN ref_date := order_data.expected_date;
                ELSE ref_date := NULL;
              END CASE;
              IF ref_date IS NOT NULL AND action_item->'config'->>'due_date_offset_days' IS NOT NULL THEN
                task_due := ref_date + (action_item->'config'->>'due_date_offset_days')::integer;
              ELSE
                task_due := ref_date;
              END IF;
            END IF;

            INSERT INTO tasks (
              company_id, title, notes, priority, category,
              assigned_to, due_date, order_id, created_by, status
            ) VALUES (
              p_company_id,
              COALESCE(action_item->'config'->>'title', 'Attività automatica'),
              action_item->'config'->>'notes',
              COALESCE(action_item->'config'->>'priority', 'normale'),
              COALESCE(action_item->'config'->>'category', 'generale'),
              CASE WHEN action_item->'config'->>'assigned_to_id' IS NOT NULL
                   THEN (action_item->'config'->>'assigned_to_id')::uuid
                   ELSE NULL END,
              task_due,
              p_order_id,
              auto_record.created_by,
              'da_fare'
            );

          WHEN 'change_order_status' THEN
            IF action_item->'config'->>'target_status_id' IS NOT NULL THEN
              UPDATE orders
              SET current_status_id = (action_item->'config'->>'target_status_id')::uuid,
                  updated_at = now()
              WHERE id = p_order_id;

              INSERT INTO order_status_history (order_id, status_id, changed_by)
              VALUES (p_order_id, (action_item->'config'->>'target_status_id')::uuid, auto_record.created_by);
            END IF;

          WHEN 'create_reminder' THEN
            task_due := CURRENT_DATE + COALESCE((action_item->'config'->>'days_offset')::integer, 7);

            INSERT INTO tasks (
              company_id, title, notes, priority, category,
              due_date, order_id, created_by, status
            ) VALUES (
              p_company_id,
              COALESCE(action_item->'config'->>'title', 'Promemoria automatico'),
              action_item->'config'->>'notes',
              'normale',
              'promemoria',
              task_due,
              p_order_id,
              auto_record.created_by,
              'da_fare'
            );

          ELSE
            NULL;
        END CASE;
      END LOOP;
    END IF;
  END LOOP;
END;
$function$;
