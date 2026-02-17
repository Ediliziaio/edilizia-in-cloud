
-- Create automations table
CREATE TABLE public.automations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  trigger_type text NOT NULL,
  trigger_config jsonb DEFAULT '{}'::jsonb,
  conditions jsonb DEFAULT '[]'::jsonb,
  actions jsonb DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Company admins can manage their automations"
ON public.automations FOR ALL
USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all automations"
ON public.automations FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Staff can view automations if permitted"
ON public.automations FOR SELECT
USING (has_permission(auth.uid(), 'can_view_settings'::text) AND company_id = get_user_company_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_automations_updated_at
BEFORE UPDATE ON public.automations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_automations_company_id ON public.automations(company_id);
CREATE INDEX idx_automations_trigger_type ON public.automations(trigger_type);
CREATE INDEX idx_automations_is_active ON public.automations(is_active);

-- Function: execute_automation
-- Called by triggers to evaluate and execute automations
CREATE OR REPLACE FUNCTION public.execute_automation(
  p_trigger_type text,
  p_order_id uuid,
  p_company_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
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
          -- Get actual value from order
          CASE cond_field
            WHEN 'current_status_name' THEN actual_value := order_data.status_name;
            WHEN 'total_amount' THEN actual_value := order_data.total_amount::text;
            WHEN 'payment_type' THEN actual_value := order_data.payment_type;
            WHEN 'has_building_bonus' THEN actual_value := order_data.has_building_bonus::text;
            WHEN 'description' THEN actual_value := order_data.description;
            ELSE actual_value := NULL;
          END CASE;

          -- Evaluate condition
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

    -- If conditions not met, skip
    IF NOT all_conditions_met THEN CONTINUE; END IF;

    -- Execute actions
    IF auto_record.actions IS NOT NULL THEN
      FOR action_item IN SELECT * FROM jsonb_array_elements(auto_record.actions)
      LOOP
        CASE action_item->>'type'
          WHEN 'create_task' THEN
            -- Calculate due date
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
            -- Unknown action type, skip
            NULL;
        END CASE;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

-- Trigger function for orders table
CREATE OR REPLACE FUNCTION public.trigger_automation_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- order_created
  IF TG_OP = 'INSERT' THEN
    PERFORM execute_automation('order_created', NEW.id, NEW.company_id);
    RETURN NEW;
  END IF;

  -- order_status_change
  IF TG_OP = 'UPDATE' AND OLD.current_status_id IS DISTINCT FROM NEW.current_status_id THEN
    PERFORM execute_automation('order_status_change', NEW.id, NEW.company_id);
  END IF;

  -- work_start_date_set
  IF TG_OP = 'UPDATE' AND OLD.work_start_date IS NULL AND NEW.work_start_date IS NOT NULL THEN
    PERFORM execute_automation('work_start_date_set', NEW.id, NEW.company_id);
  END IF;

  -- work_end_date_set
  IF TG_OP = 'UPDATE' AND OLD.work_end_date IS NULL AND NEW.work_end_date IS NOT NULL THEN
    PERFORM execute_automation('work_end_date_set', NEW.id, NEW.company_id);
  END IF;

  -- payment_received (deposit)
  IF TG_OP = 'UPDATE' AND (OLD.deposit_paid IS DISTINCT FROM NEW.deposit_paid AND NEW.deposit_paid = true) THEN
    PERFORM execute_automation('payment_received', NEW.id, NEW.company_id);
  END IF;

  -- payment_received (balance)
  IF TG_OP = 'UPDATE' AND (OLD.balance_paid IS DISTINCT FROM NEW.balance_paid AND NEW.balance_paid = true) THEN
    PERFORM execute_automation('payment_received', NEW.id, NEW.company_id);
  END IF;

  RETURN NEW;
END;
$$;

-- Create triggers on orders
CREATE TRIGGER automation_on_order_insert
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_automation_on_order();

CREATE TRIGGER automation_on_order_update
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_automation_on_order();
