ALTER TABLE public.bulk_scheduler_runs
  ADD COLUMN config_snapshot jsonb,
  ADD COLUMN lease_token uuid,
  ADD COLUMN lease_until timestamptz;

CREATE UNIQUE INDEX bulk_scheduler_managed_occurrence_idx
  ON public.bulk_scheduler_runs(flow_id, scheduled_for) WHERE config_snapshot IS NOT NULL;

CREATE TABLE public.bulk_scheduler_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.bulk_scheduler_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','working','sent','failed','skipped','uncertain')),
  external_started boolean NOT NULL DEFAULT false,
  channel text,
  UNIQUE (run_id, user_id)
);

CREATE INDEX bulk_scheduler_deliveries_pending_idx
  ON public.bulk_scheduler_deliveries(run_id, user_id) WHERE status = 'pending';
ALTER TABLE public.bulk_scheduler_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bulk_scheduler_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.bulk_scheduler_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.bulk_scheduler_due_flows()
RETURNS TABLE (flow_id uuid, company_id uuid, flow_name text, config jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT af.id, af.company_id, af.name, af.bulk_trigger_config
  FROM public.automation_flows af
  WHERE af.status = 'published' AND af.deleted_at IS NULL
    AND (af.bulk_trigger_config->>'next_run_at')::timestamptz <= statement_timestamp()
  ORDER BY (af.bulk_trigger_config->>'next_run_at')::timestamptz, af.id
  LIMIT 100;
$$;

CREATE FUNCTION public.bulk_scheduler_acquire(p_flow_id uuid, p_scheduled_for timestamptz)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_flow public.automation_flows%ROWTYPE;
  v_run public.bulk_scheduler_runs%ROWTYPE;
  v_lease uuid := gen_random_uuid();
BEGIN
  SELECT * INTO v_flow FROM public.automation_flows WHERE id = p_flow_id FOR UPDATE;
  IF NOT FOUND OR v_flow.status <> 'published' OR v_flow.deleted_at IS NOT NULL
     OR (v_flow.bulk_trigger_config->>'next_run_at')::timestamptz IS DISTINCT FROM p_scheduled_for
     OR p_scheduled_for > statement_timestamp() THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_run FROM public.bulk_scheduler_runs
    WHERE flow_id = p_flow_id AND scheduled_for = p_scheduled_for AND config_snapshot IS NOT NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.bulk_scheduler_runs(flow_id, company_id, scheduled_for, config_snapshot)
    VALUES (p_flow_id, v_flow.company_id, p_scheduled_for, v_flow.bulk_trigger_config)
    RETURNING * INTO v_run;

    -- Risolve una volta i destinatari nel database, oltre il limite delle risposte REST.
    INSERT INTO public.bulk_scheduler_deliveries(run_id, user_id)
    SELECT v_run.id, target.user_id
    FROM public.bulk_scheduler_resolve_targets(v_flow.company_id,
      v_flow.bulk_trigger_config#>>'{target,type}', v_flow.bulk_trigger_config#>>'{target,value}') AS target;
    UPDATE public.bulk_scheduler_runs SET targets_resolved = (
      SELECT count(*) FROM public.bulk_scheduler_deliveries WHERE run_id = v_run.id
    ) WHERE id = v_run.id;
  ELSIF v_run.status <> 'running' OR v_run.lease_until > statement_timestamp() THEN
    RETURN NULL;
  ELSE
    -- Gli invii in-app usano la stessa chiave della consegna e si riconciliano
    -- anche se la risposta del database è andata persa.
    UPDATE public.bulk_scheduler_deliveries AS delivery
    SET status = 'sent', channel = 'silvio_chat'
    WHERE delivery.run_id = v_run.id AND delivery.status = 'working'
      AND EXISTS (SELECT 1 FROM public.internal_chat_messages AS message
                  WHERE message.id = delivery.id AND message.company_id = v_run.company_id);

    -- I canali esterni senza conferma vanno riconciliati prima di un nuovo invio.
    UPDATE public.bulk_scheduler_deliveries
    SET status = CASE WHEN external_started THEN 'uncertain' ELSE 'pending' END
    WHERE run_id = v_run.id AND status = 'working';
  END IF;

  UPDATE public.bulk_scheduler_runs
  SET lease_token = v_lease, lease_until = statement_timestamp() + interval '4 minutes'
  WHERE id = v_run.id;
  RETURN jsonb_build_object('run_id', v_run.id, 'lease', v_lease,
    'company_id', v_flow.company_id, 'flow_name', v_flow.name, 'config', v_run.config_snapshot);
END;
$$;

CREATE FUNCTION public.bulk_scheduler_claim_delivery(p_run uuid, p_lease uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_run public.bulk_scheduler_runs%ROWTYPE;
  v_delivery public.bulk_scheduler_deliveries%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_run FROM public.bulk_scheduler_runs
    WHERE id = p_run AND lease_token = p_lease AND lease_until > statement_timestamp()
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Esecuzione del messaggio programmato non più attiva';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.automation_flows WHERE id = v_run.flow_id AND status = 'published' AND deleted_at IS NULL
      AND (bulk_trigger_config->>'next_run_at')::timestamptz = v_run.scheduled_for
  ) THEN
    UPDATE public.bulk_scheduler_deliveries SET status = 'skipped'
      WHERE run_id = p_run AND status = 'pending';
    RETURN NULL;
  END IF;

  UPDATE public.bulk_scheduler_deliveries SET status = 'working'
    WHERE id = (SELECT id FROM public.bulk_scheduler_deliveries
                WHERE run_id = p_run AND status = 'pending' ORDER BY user_id LIMIT 1)
    RETURNING * INTO v_delivery;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_delivery.user_id AND company_id = v_run.company_id
    AND COALESCE(is_blocked, false) = false;
  RETURN jsonb_build_object('id', v_delivery.id, 'user_id', v_delivery.user_id,
    'eligible', FOUND, 'first_name', v_profile.first_name, 'email', v_profile.email);
END;
$$;

CREATE FUNCTION public.bulk_scheduler_record_delivery(
  p_run uuid, p_lease uuid, p_delivery uuid, p_action text, p_channel text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.bulk_scheduler_runs
    WHERE id = p_run AND lease_token = p_lease AND lease_until > statement_timestamp()
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Esecuzione del messaggio programmato non più attiva';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('begin_external','rejected','sent','failed','skipped','uncertain') THEN
    RAISE EXCEPTION 'Esito della consegna non valido' USING ERRCODE = '22023';
  END IF;

  UPDATE public.bulk_scheduler_deliveries
    SET status = CASE WHEN p_action IN ('begin_external','rejected') THEN status ELSE p_action END,
        external_started = CASE WHEN p_action = 'begin_external' THEN true
          WHEN p_action = 'rejected' THEN false ELSE external_started END,
        channel = CASE WHEN p_action = 'rejected' THEN NULL ELSE coalesce(p_channel, channel) END
    WHERE id = p_delivery AND run_id = p_run AND status = 'working';
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Stato del destinatario già aggiornato';
  END IF;
END;
$$;

CREATE FUNCTION public.bulk_scheduler_finish_batch(p_run uuid, p_lease uuid, p_next_run_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_run public.bulk_scheduler_runs%ROWTYPE;
  v_pending integer;
  v_sent integer;
  v_failed integer;
  v_uncertain integer;
  v_skipped integer;
  v_channels jsonb;
  v_status text;
BEGIN
  -- Stesso ordine di acquisizione dei lock usato da bulk_scheduler_acquire.
  PERFORM 1 FROM public.automation_flows
    WHERE id = (SELECT flow_id FROM public.bulk_scheduler_runs WHERE id = p_run) FOR UPDATE;
  SELECT * INTO v_run FROM public.bulk_scheduler_runs
    WHERE id = p_run AND lease_token = p_lease AND lease_until > statement_timestamp()
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Esecuzione del messaggio programmato non più attiva';
  END IF;

  SELECT count(*) FILTER (WHERE status IN ('pending','working')),
         count(*) FILTER (WHERE status = 'sent'),
         count(*) FILTER (WHERE status IN ('failed','uncertain')),
         count(*) FILTER (WHERE status = 'uncertain'),
         count(*) FILTER (WHERE status = 'skipped')
  INTO v_pending, v_sent, v_failed, v_uncertain, v_skipped
  FROM public.bulk_scheduler_deliveries WHERE run_id = p_run;

  SELECT coalesce(jsonb_object_agg(channel, n), '{}'::jsonb) INTO v_channels
  FROM (SELECT channel, count(*) AS n FROM public.bulk_scheduler_deliveries
        WHERE run_id = p_run AND status = 'sent' AND channel IS NOT NULL GROUP BY channel) AS counts;
  v_status := CASE WHEN v_pending > 0 THEN 'running' WHEN v_failed = 0 THEN 'success'
    WHEN v_sent = 0 THEN 'failed' ELSE 'partial' END;

  IF v_pending = 0 THEN
    IF p_next_run_at IS NULL OR p_next_run_at <= v_run.scheduled_for THEN
      RAISE EXCEPTION 'Prossima occorrenza non valida' USING ERRCODE = '22023';
    END IF;
    UPDATE public.automation_flows
    SET bulk_trigger_config = bulk_trigger_config || jsonb_build_object(
      'last_run_at', statement_timestamp(), 'next_run_at', p_next_run_at
    ), updated_at = statement_timestamp()
    WHERE id = v_run.flow_id AND status = 'published' AND deleted_at IS NULL
      AND (bulk_trigger_config->>'next_run_at')::timestamptz = v_run.scheduled_for;
  END IF;

  UPDATE public.bulk_scheduler_runs
  SET status = v_status, sent_ok = v_sent, sent_failed = v_failed, channel_breakdown = v_channels,
      metadata = metadata || jsonb_build_object('skipped', v_skipped, 'uncertain', v_uncertain, 'pending', v_pending),
      error_summary = CASE WHEN v_uncertain > 0 THEN 'Esito da verificare per ' || v_uncertain || ' invii esterni' END,
      finished_at = CASE WHEN v_pending = 0 THEN statement_timestamp() END,
      lease_token = NULL, lease_until = NULL
  WHERE id = p_run;
  RETURN jsonb_build_object('status', v_status, 'sent', v_sent, 'failed', v_failed, 'pending', v_pending);
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_scheduler_acquire(uuid, timestamptz),
  public.bulk_scheduler_claim_delivery(uuid, uuid),
  public.bulk_scheduler_record_delivery(uuid, uuid, uuid, text, text),
  public.bulk_scheduler_finish_batch(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_scheduler_acquire(uuid, timestamptz),
  public.bulk_scheduler_claim_delivery(uuid, uuid),
  public.bulk_scheduler_record_delivery(uuid, uuid, uuid, text, text),
  public.bulk_scheduler_finish_batch(uuid, uuid, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
