BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.hr_talent_token_hash(p_token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(digest(p_token, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.hr_talent_issue_public_link(
  p_candidate_id UUID,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_candidate public.hr_talent_candidates%ROWTYPE;
  v_token TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Utente non autenticato';
  END IF;

  SELECT *
  INTO v_candidate
  FROM public.hr_talent_candidates
  WHERE id = p_candidate_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidato Talent Profile non trovato';
  END IF;

  IF NOT public.hr_talent_company_allowed(v_candidate.company_id) THEN
    RAISE EXCEPTION 'Permessi insufficienti per generare il link';
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_expires_at := CASE
    WHEN p_expires_at IS NULL OR p_expires_at <= now() THEN now() + INTERVAL '14 days'
    ELSE p_expires_at
  END;

  UPDATE public.hr_talent_candidates
  SET
    token_hash = public.hr_talent_token_hash(v_token),
    expires_at = v_expires_at,
    invite_sent_at = now(),
    status = CASE
      WHEN status IN ('draft', 'archived') THEN 'invited'
      ELSE status
    END,
    updated_at = now()
  WHERE id = v_candidate.id
  RETURNING * INTO v_candidate;

  RETURN jsonb_build_object(
    'token', v_token,
    'public_path', '/talent-profile/' || v_token,
    'expires_at', v_expires_at,
    'candidate_id', v_candidate.id,
    'status', v_candidate.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_talent_public_session(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_candidate public.hr_talent_candidates%ROWTYPE;
  v_questions JSONB;
  v_answers JSONB;
  v_company_name TEXT;
BEGIN
  IF NULLIF(trim(COALESCE(p_token, '')), '') IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'token_missing');
  END IF;

  SELECT *
  INTO v_candidate
  FROM public.hr_talent_candidates
  WHERE token_hash = public.hr_talent_token_hash(p_token)
    AND status <> 'archived'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'token_invalid');
  END IF;

  IF v_candidate.expires_at IS NOT NULL AND v_candidate.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;

  IF v_candidate.status = 'invited' THEN
    UPDATE public.hr_talent_candidates
    SET status = 'in_progress',
        started_at = COALESCE(started_at, now()),
        updated_at = now()
    WHERE id = v_candidate.id
    RETURNING * INTO v_candidate;
  END IF;

  SELECT c.name
  INTO v_company_name
  FROM public.companies c
  WHERE c.id = v_candidate.company_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'question_id', question_id,
        'question_text', question_text,
        'trait_code', trait_code,
        'polarity', polarity,
        'theme_block', theme_block,
        'display_order', display_order,
        'custom_answers', custom_answers
      )
      ORDER BY display_order
    ),
    '[]'::jsonb
  )
  INTO v_questions
  FROM public.hr_talent_questions
  WHERE assessment_version = v_candidate.assessment_version
    AND active = true;

  SELECT COALESCE(jsonb_object_agg(question_id::TEXT, answer_value), '{}'::jsonb)
  INTO v_answers
  FROM public.hr_talent_answers
  WHERE candidate_id = v_candidate.id
    AND assessment_version = v_candidate.assessment_version;

  RETURN jsonb_build_object(
    'valid', true,
    'candidate', jsonb_build_object(
      'id', v_candidate.id,
      'nome', v_candidate.nome,
      'cognome', v_candidate.cognome,
      'ruolo_richiesto', v_candidate.ruolo_richiesto,
      'status', v_candidate.status,
      'completed_at', v_candidate.completed_at
    ),
    'company', jsonb_build_object('name', v_company_name),
    'assessment_version', v_candidate.assessment_version,
    'privacy_accepted', v_candidate.privacy_accepted_at IS NOT NULL,
    'expires_at', v_candidate.expires_at,
    'questions', v_questions,
    'answers', v_answers
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_talent_public_save_answers(
  p_token TEXT,
  p_answers JSONB DEFAULT '[]'::jsonb,
  p_privacy_accepted BOOLEAN DEFAULT false,
  p_completed BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_candidate public.hr_talent_candidates%ROWTYPE;
  v_answer JSONB;
  v_question_id INTEGER;
  v_answer_value TEXT;
  v_saved_count INTEGER := 0;
  v_answered_count INTEGER := 0;
  v_total_questions INTEGER := 0;
BEGIN
  IF NULLIF(trim(COALESCE(p_token, '')), '') IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'token_missing');
  END IF;

  SELECT *
  INTO v_candidate
  FROM public.hr_talent_candidates
  WHERE token_hash = public.hr_talent_token_hash(p_token)
    AND status <> 'archived'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'token_invalid');
  END IF;

  IF v_candidate.expires_at IS NOT NULL AND v_candidate.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;

  IF p_answers IS NULL THEN
    p_answers := '[]'::jsonb;
  END IF;

  IF jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'Il payload risposte deve essere un array';
  END IF;

  FOR v_answer IN SELECT value FROM jsonb_array_elements(p_answers)
  LOOP
    v_question_id := NULLIF(v_answer->>'question_id', '')::INTEGER;
    v_answer_value := upper(NULLIF(v_answer->>'answer_value', ''));

    IF v_question_id IS NULL OR v_answer_value NOT IN ('A', 'B', 'C', 'D') THEN
      RAISE EXCEPTION 'Risposta Talent Profile non valida';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.hr_talent_questions q
      WHERE q.assessment_version = v_candidate.assessment_version
        AND q.question_id = v_question_id
        AND q.active = true
    ) THEN
      RAISE EXCEPTION 'Domanda Talent Profile non valida: %', v_question_id;
    END IF;

    INSERT INTO public.hr_talent_answers (
      company_id,
      candidate_id,
      assessment_version,
      question_id,
      answer_value,
      answered_at
    )
    VALUES (
      v_candidate.company_id,
      v_candidate.id,
      v_candidate.assessment_version,
      v_question_id,
      v_answer_value,
      now()
    )
    ON CONFLICT (candidate_id, assessment_version, question_id)
    DO UPDATE SET
      answer_value = EXCLUDED.answer_value,
      answered_at = now();

    v_saved_count := v_saved_count + 1;
  END LOOP;

  IF p_privacy_accepted AND v_candidate.privacy_accepted_at IS NULL THEN
    UPDATE public.hr_talent_candidates
    SET privacy_accepted_at = now(),
        updated_at = now()
    WHERE id = v_candidate.id
    RETURNING * INTO v_candidate;
  END IF;

  SELECT COUNT(*)
  INTO v_total_questions
  FROM public.hr_talent_questions
  WHERE assessment_version = v_candidate.assessment_version
    AND active = true;

  SELECT COUNT(*)
  INTO v_answered_count
  FROM public.hr_talent_answers
  WHERE candidate_id = v_candidate.id
    AND assessment_version = v_candidate.assessment_version;

  IF p_completed THEN
    IF v_candidate.privacy_accepted_at IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'privacy_required');
    END IF;

    IF v_answered_count < v_total_questions THEN
      RETURN jsonb_build_object(
        'valid', false,
        'reason', 'incomplete',
        'answered_count', v_answered_count,
        'total_questions', v_total_questions,
        'missing', v_total_questions - v_answered_count
      );
    END IF;

    UPDATE public.hr_talent_candidates
    SET status = 'completed',
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE id = v_candidate.id
    RETURNING * INTO v_candidate;
  ELSE
    UPDATE public.hr_talent_candidates
    SET status = CASE
          WHEN status IN ('draft', 'invited') THEN 'in_progress'
          ELSE status
        END,
        started_at = COALESCE(started_at, now()),
        updated_at = now()
    WHERE id = v_candidate.id
    RETURNING * INTO v_candidate;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'saved_count', v_saved_count,
    'answered_count', v_answered_count,
    'total_questions', v_total_questions,
    'privacy_accepted', v_candidate.privacy_accepted_at IS NOT NULL,
    'status', v_candidate.status,
    'completed_at', v_candidate.completed_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hr_talent_token_hash(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_talent_issue_public_link(UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_talent_public_session(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_talent_public_save_answers(TEXT, JSONB, BOOLEAN, BOOLEAN) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.hr_talent_issue_public_link(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_talent_public_session(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_talent_public_save_answers(TEXT, JSONB, BOOLEAN, BOOLEAN) TO anon, authenticated;

COMMIT;
