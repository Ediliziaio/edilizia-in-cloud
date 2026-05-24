-- ============================================================================
-- HR request atomic workflow
--
-- Stabilizza il flusso ferie/permessi/ROL:
-- - allinea i CHECK ai tipi/stati usati dal frontend
-- - consente a hr_giornate.source di indicare una giornata generata da richiesta
-- - sposta approvazione/rifiuto/revoca in una RPC transazionale
-- - registra audit in company_activity_log tramite log_activity
-- ============================================================================

ALTER TABLE public.hr_richieste DROP CONSTRAINT IF EXISTS hr_richieste_tipo_check;
ALTER TABLE public.hr_richieste
  ADD CONSTRAINT hr_richieste_tipo_check
  CHECK (tipo IN (
    'ferie',
    'permesso',
    'malattia',
    'straordinario',
    'cambio_turno',
    'rimborso',
    'altro',
    'rol',
    'infortunio',
    'maternita',
    'paternita',
    'lutto',
    'smart_working',
    'trasferta',
    'formazione'
  ));

ALTER TABLE public.hr_richieste DROP CONSTRAINT IF EXISTS hr_richieste_stato_check;
ALTER TABLE public.hr_richieste
  ADD CONSTRAINT hr_richieste_stato_check
  CHECK (stato IN ('in_attesa', 'approvata', 'rifiutata', 'annullata', 'revocata'));

ALTER TABLE public.hr_giornate DROP CONSTRAINT IF EXISTS hr_giornate_stato_check;
ALTER TABLE public.hr_giornate
  ADD CONSTRAINT hr_giornate_stato_check
  CHECK (stato IS NULL OR stato IN (
    'presente',
    'assente',
    'ferie',
    'permesso',
    'malattia',
    'smart_working',
    'trasferta',
    'festivita',
    'infortunio',
    'maternita',
    'paternita',
    'lutto',
    'rol',
    'non_lavorativo',
    'missione'
  ));

ALTER TABLE public.hr_giornate DROP CONSTRAINT IF EXISTS hr_giornate_source_check;
ALTER TABLE public.hr_giornate
  ADD CONSTRAINT hr_giornate_source_check
  CHECK (source IS NULL OR source IN ('manual', 'whatsapp', 'campo', 'api', 'hr_richiesta'));

CREATE OR REPLACE FUNCTION public.hr_update_richiesta_stato(
  p_richiesta_id uuid,
  p_stato text,
  p_note_risposta text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_req public.hr_richieste%ROWTYPE;
  v_profilo public.hr_profili%ROWTYPE;
  v_was_approved boolean;
  v_will_be_approved boolean;
  v_days integer;
  v_hours numeric;
  v_daily_hours numeric;
  v_delta_ferie numeric := 0;
  v_delta_permessi numeric := 0;
  v_delta_rol numeric := 0;
  v_blocking_types text[] := ARRAY[
    'ferie',
    'permesso',
    'malattia',
    'rol',
    'infortunio',
    'maternita',
    'paternita',
    'lutto',
    'smart_working',
    'trasferta'
  ];
  v_giornata_stato text;
  v_date date;
  v_existing public.hr_giornate%ROWTYPE;
  v_requested_today numeric;
  v_remaining_permission_hours numeric;
  v_note text;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Utente non autenticato';
  END IF;

  IF p_stato NOT IN ('in_attesa', 'approvata', 'rifiutata', 'annullata', 'revocata') THEN
    RAISE EXCEPTION 'Stato richiesta non valido: %', p_stato;
  END IF;

  SELECT *
  INTO v_req
  FROM public.hr_richieste
  WHERE id = p_richiesta_id
    AND (
      company_id IN (
        SELECT company_id FROM public.profiles WHERE id = v_actor
        UNION
        SELECT company_id FROM public.multi_company_access WHERE user_id = v_actor
      )
      OR public.has_role(v_actor, 'super_admin'::public.app_role)
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Richiesta HR non trovata o non accessibile';
  END IF;

  IF NOT (
    public.has_role(v_actor, 'company_admin'::public.app_role)
    OR public.has_role(v_actor, 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Permessi insufficienti per approvare richieste HR';
  END IF;

  IF v_req.profilo_id IS NULL THEN
    RAISE EXCEPTION 'Richiesta non collegata a un profilo HR';
  END IF;

  SELECT *
  INTO v_profilo
  FROM public.hr_profili
  WHERE id = v_req.profilo_id
    AND company_id = v_req.company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profilo HR non valido per questa azienda';
  END IF;

  v_before := to_jsonb(v_req);
  v_was_approved := coalesce(v_req.stato, 'in_attesa') = 'approvata';
  v_will_be_approved := p_stato = 'approvata';
  v_days := greatest(1, (v_req.data_fine - v_req.data_inizio) + 1);
  v_daily_hours := coalesce(v_profilo.ore_giornaliere, 8);
  v_hours := coalesce(v_req.ore_richieste, v_days * v_daily_hours);

  IF v_req.data_fine < v_req.data_inizio THEN
    RAISE EXCEPTION 'Periodo richiesta non valido';
  END IF;

  IF v_req.tipo = 'ferie' THEN
    v_delta_ferie := v_days;
  ELSIF v_req.tipo = 'permesso' THEN
    v_delta_permessi := v_hours;
  ELSIF v_req.tipo = 'rol' THEN
    v_delta_rol := v_hours;
  END IF;

  IF v_will_be_approved AND NOT v_was_approved THEN
    IF v_delta_ferie > coalesce(v_profilo.ferie_residue, 0) THEN
      RAISE EXCEPTION 'Ferie residue insufficienti: richiesta % gg, disponibili % gg',
        v_delta_ferie, coalesce(v_profilo.ferie_residue, 0);
    END IF;

    IF v_delta_permessi > coalesce(v_profilo.permessi_residui_ore, 0) THEN
      RAISE EXCEPTION 'Permessi insufficienti: richiesta %h, disponibili %h',
        v_delta_permessi, coalesce(v_profilo.permessi_residui_ore, 0);
    END IF;

    IF v_delta_rol > coalesce(v_profilo.rol_residuo_ore, 0) THEN
      RAISE EXCEPTION 'ROL insufficienti: richiesta %h, disponibili %h',
        v_delta_rol, coalesce(v_profilo.rol_residuo_ore, 0);
    END IF;

    IF v_req.tipo = ANY(v_blocking_types) AND EXISTS (
      SELECT 1
      FROM public.hr_richieste r
      WHERE r.company_id = v_req.company_id
        AND r.profilo_id = v_req.profilo_id
        AND r.id <> v_req.id
        AND r.stato = 'approvata'
        AND r.tipo = ANY(v_blocking_types)
        AND r.data_inizio <= v_req.data_fine
        AND r.data_fine >= v_req.data_inizio
    ) THEN
      RAISE EXCEPTION 'Esiste già una richiesta assenza approvata sovrapposta per questo dipendente';
    END IF;

    UPDATE public.hr_profili
    SET ferie_residue = coalesce(ferie_residue, 0) - v_delta_ferie,
        permessi_residui_ore = coalesce(permessi_residui_ore, 0) - v_delta_permessi,
        rol_residuo_ore = coalesce(rol_residuo_ore, 0) - v_delta_rol,
        updated_at = now()
    WHERE id = v_profilo.id
      AND company_id = v_req.company_id;

    v_giornata_stato := CASE v_req.tipo
      WHEN 'ferie' THEN 'ferie'
      WHEN 'permesso' THEN 'permesso'
      WHEN 'rol' THEN 'permesso'
      WHEN 'malattia' THEN 'malattia'
      WHEN 'smart_working' THEN 'smart_working'
      WHEN 'trasferta' THEN 'trasferta'
      WHEN 'infortunio' THEN 'infortunio'
      WHEN 'maternita' THEN 'maternita'
      WHEN 'paternita' THEN 'paternita'
      WHEN 'lutto' THEN 'lutto'
      ELSE NULL
    END;

    IF v_giornata_stato IS NOT NULL THEN
      v_remaining_permission_hours := CASE
        WHEN v_req.tipo IN ('permesso', 'rol') THEN v_hours
        ELSE 0
      END;
      v_note := 'Richiesta ' || v_req.tipo || ' approvata'
        || CASE WHEN v_req.ore_richieste IS NULL THEN '' ELSE ' · ' || v_req.ore_richieste::text || 'h' END
        || ' · ' || v_req.id::text;

      FOR v_date IN
        SELECT generate_series(v_req.data_inizio, v_req.data_fine, interval '1 day')::date
      LOOP
        v_requested_today := CASE
          WHEN v_remaining_permission_hours > 0 THEN least(v_daily_hours, v_remaining_permission_hours)
          ELSE v_daily_hours
        END;

        IF v_remaining_permission_hours > 0 THEN
          v_remaining_permission_hours := greatest(0, v_remaining_permission_hours - v_requested_today);
        END IF;

        SELECT *
        INTO v_existing
        FROM public.hr_giornate
        WHERE company_id = v_req.company_id
          AND profilo_id = v_req.profilo_id
          AND data = v_date
        FOR UPDATE;

        IF FOUND THEN
          UPDATE public.hr_giornate
          SET stato = v_giornata_stato,
              note = CASE
                WHEN coalesce(note, '') LIKE '%' || v_req.id::text || '%' THEN note
                ELSE concat_ws(E'\n', nullif(note, ''), v_note)
              END,
              bloccata = true,
              anomalia = CASE
                WHEN coalesce(ore_lavorate, 0) > 0 OR prima_entrata IS NOT NULL OR ultima_uscita IS NOT NULL
                THEN true
                ELSE anomalia
              END,
              anomalia_motivo = CASE
                WHEN coalesce(ore_lavorate, 0) > 0 OR prima_entrata IS NOT NULL OR ultima_uscita IS NOT NULL
                THEN 'Timbrature presenti su giornata con richiesta HR approvata'
                ELSE anomalia_motivo
              END,
              source = coalesce(source, 'hr_richiesta'),
              updated_at = now()
          WHERE id = v_existing.id;
        ELSE
          INSERT INTO public.hr_giornate (
            company_id,
            profilo_id,
            data,
            stato,
            ore_previste,
            ore_lavorate,
            ore_pausa,
            note,
            bloccata,
            source,
            updated_at
          ) VALUES (
            v_req.company_id,
            v_req.profilo_id,
            v_date,
            v_giornata_stato,
            v_daily_hours,
            CASE WHEN v_giornata_stato = 'permesso' THEN greatest(0, v_daily_hours - v_requested_today) ELSE 0 END,
            0,
            v_note,
            true,
            'hr_richiesta',
            now()
          );
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF v_was_approved AND NOT v_will_be_approved THEN
    UPDATE public.hr_profili
    SET ferie_residue = coalesce(ferie_residue, 0) + v_delta_ferie,
        permessi_residui_ore = coalesce(permessi_residui_ore, 0) + v_delta_permessi,
        rol_residuo_ore = coalesce(rol_residuo_ore, 0) + v_delta_rol,
        updated_at = now()
    WHERE id = v_profilo.id
      AND company_id = v_req.company_id;

    DELETE FROM public.hr_giornate
    WHERE company_id = v_req.company_id
      AND profilo_id = v_req.profilo_id
      AND source = 'hr_richiesta'
      AND coalesce(note, '') LIKE '%' || v_req.id::text || '%'
      AND coalesce(ore_lavorate, 0) = 0
      AND prima_entrata IS NULL
      AND ultima_uscita IS NULL;
  END IF;

  UPDATE public.hr_richieste
  SET stato = p_stato,
      note_risposta = p_note_risposta,
      approvata_il = CASE
        WHEN v_will_be_approved THEN coalesce(approvata_il, now())
        ELSE NULL
      END,
      approvata_da = CASE
        WHEN v_will_be_approved THEN coalesce(approvata_da, v_actor)
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = v_req.id
  RETURNING * INTO v_req;

  v_after := to_jsonb(v_req);

  PERFORM public.log_activity(
    v_req.company_id,
    'modification',
    'hr.request.status_changed',
    v_actor,
    'hr_richieste',
    v_req.id::text,
    v_profilo.nome || ' ' || v_profilo.cognome,
    'Richiesta HR ' || v_req.tipo || ' impostata a ' || p_stato,
    jsonb_build_object(
      'stato', jsonb_build_object('before', v_before->>'stato', 'after', p_stato),
      'ferie_delta', CASE WHEN v_will_be_approved AND NOT v_was_approved THEN -v_delta_ferie WHEN v_was_approved AND NOT v_will_be_approved THEN v_delta_ferie ELSE 0 END,
      'permessi_delta', CASE WHEN v_will_be_approved AND NOT v_was_approved THEN -v_delta_permessi WHEN v_was_approved AND NOT v_will_be_approved THEN v_delta_permessi ELSE 0 END,
      'rol_delta', CASE WHEN v_will_be_approved AND NOT v_was_approved THEN -v_delta_rol WHEN v_was_approved AND NOT v_will_be_approved THEN v_delta_rol ELSE 0 END
    ),
    v_before,
    v_after,
    CASE WHEN p_stato = 'approvata' THEN 'high' ELSE 'normal' END,
    jsonb_build_object(
      'profilo_id', v_req.profilo_id,
      'tipo', v_req.tipo,
      'data_inizio', v_req.data_inizio,
      'data_fine', v_req.data_fine,
      'ore_richieste', v_req.ore_richieste
    ),
    'rpc:hr_update_richiesta_stato',
    NULL
  );

  RETURN jsonb_build_object(
    'id', v_req.id,
    'stato', v_req.stato,
    'company_id', v_req.company_id,
    'profilo_id', v_req.profilo_id,
    'updated_at', v_req.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hr_update_richiesta_stato(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_update_richiesta_stato(uuid, text, text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_hr_richieste_company_status_period
  ON public.hr_richieste (company_id, profilo_id, stato, data_inizio, data_fine);

CREATE INDEX IF NOT EXISTS idx_hr_giornate_request_source
  ON public.hr_giornate (company_id, profilo_id, source, data)
  WHERE source = 'hr_richiesta';
