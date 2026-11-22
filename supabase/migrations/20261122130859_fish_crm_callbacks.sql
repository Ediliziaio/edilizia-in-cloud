ALTER TABLE public.ai_fish_calls
  ADD CONSTRAINT ai_fish_calls_id_company_key UNIQUE (id, company_id);

ALTER TABLE public.tasks
  ADD COLUMN fish_call_id uuid,
  ADD CONSTRAINT tasks_fish_call_company_fkey
    FOREIGN KEY (fish_call_id, company_id) REFERENCES public.ai_fish_calls(id, company_id)
    ON DELETE SET NULL (fish_call_id),
  ADD CONSTRAINT tasks_fish_call_id_key UNIQUE (fish_call_id);

CREATE INDEX tasks_fish_callbacks_queue
  ON public.tasks (company_id, created_at DESC) WHERE fish_call_id IS NOT NULL;

-- The task links to the canonical conversation using the Fish call ID.
-- Retrying the tool, even with different wording, returns the first task.
CREATE FUNCTION public.fish_save_callback(
  p_company uuid, p_agent uuid, p_session text, p_contact uuid,
  p_creator uuid, p_title text, p_notes text, p_due date, p_priority text
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_call public.ai_fish_calls%ROWTYPE;
  v_task uuid;
BEGIN
  SELECT * INTO v_call FROM public.ai_fish_calls
    WHERE company_id = p_company AND agent_id = p_agent
      AND remote_session_id = p_session AND direction = 'outbound'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT id INTO v_task FROM public.tasks WHERE fish_call_id = v_call.id AND company_id = p_company;
  IF v_task IS NOT NULL THEN RETURN v_task; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_creator AND company_id = p_company)
    OR (p_contact IS NOT NULL AND (p_contact IS DISTINCT FROM v_call.contact_id OR NOT EXISTS (
      SELECT 1 FROM public.marketing_contacts WHERE id = p_contact AND company_id = p_company AND deleted_at IS NULL
    ))) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.tasks
    (company_id, fish_call_id, contact_id, created_by, title, notes, due_date, priority, status)
  VALUES (p_company, v_call.id, p_contact, p_creator, p_title, p_notes, p_due, p_priority, 'da_fare')
  RETURNING id INTO v_task;
  RETURN v_task;
END;
$$;
REVOKE ALL ON FUNCTION public.fish_save_callback(uuid, uuid, text, uuid, uuid, text, text, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fish_save_callback(uuid, uuid, text, uuid, uuid, text, text, date, text) TO service_role;
