-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- ════════════════════════════════════════════════════════════════════════════
-- FIX batch (audit): regole decisionali, SA-INTEL health, SA-PROBLEMS fonti, outbound resolver
-- ════════════════════════════════════════════════════════════════════════════

-- FIX #4: alias dominio regole decisionali (utente dice 'preventivi', tool.domain è 'crm')
CREATE OR REPLACE FUNCTION public.sa_domain_aliases(p_tool_domain text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_tool_domain
    WHEN 'crm'        THEN ARRAY['crm','preventivi','vendite','vendita','clienti','offerte','sales']
    WHEN 'sales'      THEN ARRAY['sales','vendite','vendita','preventivi','offerte']
    WHEN 'finance'    THEN ARRAY['finance','finanza','pagamenti','cassa','cashflow','fatture','incassi']
    WHEN 'hr'         THEN ARRAY['hr','personale','dipendenti','recruiting','ferie','formazione']
    WHEN 'warehouse'  THEN ARRAY['warehouse','magazzino','materiali','scorte','fornitori','ordini_fornitore']
    WHEN 'operations' THEN ARRAY['operations','operativo','cantiere','calendario','slot']
    WHEN 'marketing'  THEN ARRAY['marketing','campagne','pubblicita']
    WHEN 'compliance' THEN ARRAY['compliance','legale','durc','documenti']
    ELSE ARRAY[p_tool_domain] END;
$$;

CREATE OR REPLACE FUNCTION public.silvio_match_decision_rule(p_company_id uuid, p_dominio text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_field text; v_op text; v_match boolean; v_lhs numeric; v_rhs numeric; v_aliases text[];
BEGIN
  IF p_company_id IS NULL OR p_dominio IS NULL OR p_payload IS NULL THEN RETURN NULL; END IF;
  v_aliases := public.sa_domain_aliases(p_dominio);
  FOR r IN
    SELECT id, condizione, azione FROM public.silvio_decision_rules
    WHERE company_id = p_company_id AND attiva = true AND (dominio = p_dominio OR dominio = ANY(v_aliases))
    ORDER BY created_at DESC
  LOOP
    v_field := r.condizione->>'field'; v_op := coalesce(r.condizione->>'op','=');
    IF v_field IS NULL OR (p_payload->v_field) IS NULL THEN CONTINUE; END IF;
    v_match := false;
    BEGIN
      v_lhs := (p_payload->>v_field)::numeric; v_rhs := (r.condizione->>'value')::numeric;
      v_match := CASE v_op WHEN '<' THEN v_lhs<v_rhs WHEN '<=' THEN v_lhs<=v_rhs WHEN '>' THEN v_lhs>v_rhs
        WHEN '>=' THEN v_lhs>=v_rhs WHEN '!=' THEN v_lhs<>v_rhs ELSE v_lhs=v_rhs END;
    EXCEPTION WHEN OTHERS THEN
      v_match := CASE v_op WHEN '!=' THEN (p_payload->>v_field)<>(r.condizione->>'value') ELSE (p_payload->>v_field)=(r.condizione->>'value') END;
    END;
    IF v_match THEN RETURN jsonb_build_object('rule_id', r.id, 'azione', r.azione); END IF;
  END LOOP;
  RETURN NULL;
END $$;

-- FIX #5: SA-INTEL — health_score reale + priorita che blenda dolore + churn
CREATE OR REPLACE FUNCTION public.sa_compute_company_intel(p_company_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_top jsonb; v_dolore text; v_dolore_peso int; v_intensita int; v_servizio text; v_motiv text; v_health int; v_prio int;
BEGIN
  IF p_company_id IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('area', area, 'peso', peso_tot) ORDER BY peso_tot DESC), '[]'::jsonb) INTO v_top
  FROM (SELECT area, sum(peso)::int AS peso_tot FROM public.sa_conversation_signals
        WHERE company_id = p_company_id AND giorno > CURRENT_DATE - 90 GROUP BY area ORDER BY peso_tot DESC LIMIT 5) t;
  SELECT area, sum(peso)::int INTO v_dolore, v_dolore_peso FROM public.sa_conversation_signals
   WHERE company_id = p_company_id AND giorno > CURRENT_DATE - 90 AND intento IN ('difficolta','lamentela')
   GROUP BY area ORDER BY 2 DESC LIMIT 1;
  v_intensita := LEAST(100, coalesce(v_dolore_peso,0) * 8);
  v_servizio := CASE WHEN v_dolore IS NULL THEN NULL ELSE public.sa_intel_area_to_servizio(v_dolore) END;
  BEGIN
    SELECT score INTO v_health FROM public.company_health_scores
    WHERE company_id = p_company_id ORDER BY calculated_at DESC NULLS LAST LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_health := NULL; END;
  -- priorita = 80% dolore + 20% rischio (100 - health). Alto = chiamare subito.
  v_prio := LEAST(100, round(v_intensita * 0.8 + (100 - coalesce(v_health,50)) * 0.2)::int);
  v_motiv := CASE WHEN v_dolore IS NULL THEN 'Nessun dolore dominante nelle ultime 90 giornate.'
    ELSE format('Segnale forte su "%s" (%s richieste/difficolta in 90gg). Candidato %s.', v_dolore, coalesce(v_dolore_peso,0), v_servizio) END;
  INSERT INTO public.sa_company_intel (company_id, aggiornato_al, top_aree, dolore_principale, intensita, servizio_consigliato, motivazione, health_score, priorita_contatto)
  VALUES (p_company_id, now(), v_top, v_dolore, v_intensita, v_servizio, v_motiv, v_health, v_prio)
  ON CONFLICT (company_id) DO UPDATE SET aggiornato_al = now(), top_aree = EXCLUDED.top_aree, dolore_principale = EXCLUDED.dolore_principale,
    intensita = EXCLUDED.intensita, servizio_consigliato = EXCLUDED.servizio_consigliato, motivazione = EXCLUDED.motivazione,
    health_score = EXCLUDED.health_score, priorita_contatto = EXCLUDED.priorita_contatto;
  RETURN p_company_id;
END $$;

-- FIX #4-problemi: SA-PROBLEMS — aggiungi fonti automation_dead_letter (tecnico) + support_tickets (prodotto)
CREATE OR REPLACE FUNCTION public.sa_aggregate_company_problems(p_company_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_company_id IS NULL THEN RETURN 0; END IF;
  DELETE FROM public.sa_company_problems WHERE company_id = p_company_id;

  INSERT INTO public.sa_company_problems (company_id, area, problema, severita, fonte, da_quanti_giorni, dettaglio_anonimo)
  SELECT a.company_id, public.sa_alert_type_to_area(a.alert_type), left(a.title,160),
         CASE WHEN a.severity IN ('info','warning','critical') THEN a.severity ELSE 'warning' END,
         'silvio_alerts', GREATEST(0, (CURRENT_DATE - a.created_at::date)), left(a.message,200)
  FROM public.silvio_alerts a WHERE a.company_id = p_company_id AND a.status = 'open'
  ON CONFLICT (company_id, area, problema) DO NOTHING;

  INSERT INTO public.sa_company_problems (company_id, area, problema, severita, fonte, da_quanti_giorni, dettaglio_anonimo)
  SELECT s.company_id, m.area_p, 'Dolore dichiarato in chat: ' || m.area_p,
         CASE WHEN sum(s.peso) >= 5 THEN 'critical' WHEN sum(s.peso) >= 2 THEN 'warning' ELSE 'info' END,
         'conversation', GREATEST(0, (CURRENT_DATE - max(s.giorno))), max(s.esempio_anonimo)
  FROM public.sa_conversation_signals s
  CROSS JOIN LATERAL (SELECT public.sa_signalarea_to_problemarea(s.area) AS area_p) m
  WHERE s.company_id = p_company_id AND s.intento IN ('difficolta','lamentela') AND s.giorno > CURRENT_DATE - 90
  GROUP BY s.company_id, m.area_p
  ON CONFLICT (company_id, area, problema) DO NOTHING;

  -- fonte 3: automazioni/integrazioni fallite (non risolte) → tecnico
  INSERT INTO public.sa_company_problems (company_id, area, problema, severita, fonte, da_quanti_giorni, dettaglio_anonimo)
  SELECT d.company_id, 'tecnico', 'Automazioni/integrazioni fallite (' || count(*) || ')',
         CASE WHEN count(*) >= 5 THEN 'critical' ELSE 'warning' END,
         'automation_dead_letter', GREATEST(0, (CURRENT_DATE - min(d.first_failed_at)::date)),
         left(max(d.error_message), 200)
  FROM public.automation_dead_letter d
  WHERE d.company_id = p_company_id AND d.resolved_at IS NULL
  GROUP BY d.company_id
  ON CONFLICT (company_id, area, problema) DO NOTHING;

  -- fonte 4: ticket aperti → prodotto (senza PII: solo categoria/urgenza)
  INSERT INTO public.sa_company_problems (company_id, area, problema, severita, fonte, da_quanti_giorni, dettaglio_anonimo)
  SELECT t.company_id, 'prodotto', 'Ticket aperti (' || count(*) || ')',
         CASE WHEN bool_or(t.urgenza IN ('alta','urgente','critica')) THEN 'critical'
              WHEN count(*) >= 3 THEN 'warning' ELSE 'info' END,
         'tickets', GREATEST(0, (CURRENT_DATE - min(t.created_at)::date)),
         'categorie: ' || left(string_agg(DISTINCT coalesce(t.categoria,'altro'), ', '), 180)
  FROM public.support_tickets t
  WHERE t.company_id = p_company_id AND coalesce(t.stato,'open') NOT IN ('chiuso','closed','risolto','resolved')
  GROUP BY t.company_id
  ON CONFLICT (company_id, area, problema) DO NOTHING;

  RETURN (SELECT count(*) FROM public.sa_company_problems WHERE company_id = p_company_id);
END $$;

-- FIX #1: resolver destinatario outbound (service-role only, scoped company)
CREATE OR REPLACE FUNCTION public.silvio_outbound_resolve_recipient(p_company_id uuid, p_dest_tipo text, p_dest_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_email text; v_nome text;
BEGIN
  IF p_company_id IS NULL OR p_dest_id IS NULL THEN RETURN NULL; END IF;
  IF p_dest_tipo = 'cliente' THEN
    SELECT email, coalesce(ragione_sociale, nome) INTO v_email, v_nome FROM public.anagrafiche_native
    WHERE id = p_dest_id AND company_id = p_company_id;
  ELSIF p_dest_tipo = 'fornitore' THEN
    SELECT email, name INTO v_email, v_nome FROM public.suppliers WHERE id = p_dest_id AND company_id = p_company_id;
  ELSIF p_dest_tipo = 'dipendente' THEN
    SELECT email, NULL INTO v_email, v_nome FROM public.employees WHERE id = p_dest_id AND company_id = p_company_id;
  ELSIF p_dest_tipo = 'lead' THEN
    SELECT email, NULL INTO v_email, v_nome FROM public.marketing_contacts WHERE id = p_dest_id AND company_id = p_company_id;
  END IF;
  IF v_email IS NULL OR position('@' in v_email) = 0 THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('email', v_email, 'nome', v_nome);
END $$;
REVOKE EXECUTE ON FUNCTION public.silvio_outbound_resolve_recipient(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_outbound_resolve_recipient(uuid,text,uuid) TO service_role;
