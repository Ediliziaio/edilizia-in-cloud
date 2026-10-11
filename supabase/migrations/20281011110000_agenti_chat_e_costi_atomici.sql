-- Internal RPCs only: company access is checked by the authenticated edge proxy.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.settle_voice_conversation(
  p_company_id uuid, p_conversation_id uuid, p_pricing jsonb, p_state text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.ai_agent_conversations%ROWTYPE;
  u public.ai_credit_usage%ROWTYPE;
  mirror_id uuid;
  old_cost numeric;
  minutes numeric;
  real_rate numeric;
  billed_rate numeric;
  real_cost numeric;
  billed_cost numeric;
  balance jsonb;
BEGIN
  SELECT * INTO c FROM public.ai_agent_conversations
    WHERE id = p_conversation_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND OR c.status = 'in_progress' THEN RAISE EXCEPTION 'Conversazione non finalizzata'; END IF;
  SELECT * INTO u FROM public.ai_credit_usage WHERE conversation_id = c.id LIMIT 1;
  IF FOUND THEN
    UPDATE public.ai_agent_conversations SET metadata = COALESCE(metadata,'{}') ||
      '{"voice_billing_settled":true}'::jsonb WHERE id = c.id;
    RETURN jsonb_build_object('already_billed',true,'balance_before',u.balance_before,'balance_after',u.balance_after);
  END IF;
  IF c.metadata->>'voice_billing_version' IS DISTINCT FROM '2'
    OR p_pricing IS DISTINCT FROM c.metadata->'voice_billing_pricing' THEN
    RAISE EXCEPTION 'Tariffa della chiamata non verificata';
  END IF;
  IF p_state NOT IN ('completata','fallita','no_risposta','occupato','segreteria') THEN
    RAISE EXCEPTION 'Stato chiamata non valido';
  END IF;
  real_rate := (p_pricing->>'real_per_min')::numeric;
  billed_rate := (p_pricing->>'billed_per_min')::numeric;
  IF real_rate IS NULL OR billed_rate IS NULL OR real_rate < 0 OR billed_rate < 0
    OR real_rate::text IN ('NaN','Infinity','-Infinity') OR billed_rate::text IN ('NaN','Infinity','-Infinity')
    OR c.duration_seconds < 0 THEN RAISE EXCEPTION 'Costo o durata non validi'; END IF;
  minutes := greatest(0.0167, coalesce(c.duration_seconds,0)::numeric / 60);
  real_cost := round(minutes * real_rate,4);
  billed_cost := round(minutes * billed_rate,4);
  balance := public.deduct_ai_credits(p_company_id, billed_cost);
  INSERT INTO public.ai_credit_usage(company_id,conversation_id,agent_id,agent_v2_id,
    duration_sec,duration_min,llm_model,tts_model,cost_real_per_min,cost_billed_per_min,
    cost_real_total,cost_billed_total,margin_total,balance_before,balance_after,call_direction)
  VALUES(p_company_id,c.id,c.agent_id,c.agent_v2_id,coalesce(c.duration_seconds,0),round(minutes,4),
    p_pricing->>'llm_model',p_pricing->>'tts_model',real_rate,billed_rate,real_cost,billed_cost,
    billed_cost-real_cost,(balance->>'balance_before')::numeric,(balance->>'balance_after')::numeric,
    coalesce(c.metadata->>'call_direction','inbound'));
  IF c.agent_v2_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.ai_agents_v2 WHERE id=c.agent_v2_id AND company_id=p_company_id) THEN
      RAISE EXCEPTION 'Agente non appartenente all azienda';
    END IF;
    INSERT INTO public.ai_conversations_v2(company_id,agent_id,contact_id,elevenlabs_conversation_id,
      canale,direzione,stato,durata_secondi,costo_crediti,riassunto,trascrizione_json,
      numero_chiamante,numero_chiamato,terminata_il)
    VALUES(p_company_id,c.agent_v2_id,c.contact_id,c.elevenlabs_conversation_id,'voce',
      coalesce(c.metadata->>'call_direction','inbound'),p_state,c.duration_seconds,billed_cost,
      c.summary,c.transcript,c.metadata->>'caller_phone',c.metadata->>'called_phone',now())
    ON CONFLICT(elevenlabs_conversation_id) DO NOTHING RETURNING id INTO mirror_id;
    IF mirror_id IS NOT NULL THEN
      PERFORM public.increment_agent_stats(c.agent_v2_id,1,
        CASE WHEN p_state='completata' THEN 1 ELSE 0 END,round(minutes,4),0,billed_cost);
    ELSE
      SELECT costo_crediti INTO old_cost FROM public.ai_conversations_v2
        WHERE elevenlabs_conversation_id=c.elevenlabs_conversation_id AND company_id=p_company_id
        AND agent_id=c.agent_v2_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Specchio chiamata non appartenente all azienda'; END IF;
      UPDATE public.ai_conversations_v2 SET costo_crediti=billed_cost
        WHERE elevenlabs_conversation_id=c.elevenlabs_conversation_id;
      PERFORM public.increment_agent_stats(c.agent_v2_id,0,0,0,0,billed_cost-coalesce(old_cost,0));
    END IF;
  END IF;
  UPDATE public.ai_agent_conversations SET metadata=coalesce(metadata,'{}') ||
    '{"voice_billing_settled":true}'::jsonb WHERE id=c.id;
  RETURN balance || jsonb_build_object('already_billed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.settle_voice_conversation(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_voice_conversation(uuid,uuid,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.agent_chat_history(p_company_id uuid, p_page integer DEFAULT 0,
 p_status text DEFAULT 'tutti', p_source text DEFAULT 'tutti', p_search text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  IF p_company_id IS NULL OR p_page < 0 OR p_page > 10000
    OR p_status NOT IN ('tutti','attiva','chiusa') OR p_source NOT IN ('tutti','agente','sito') THEN
    RAISE EXCEPTION 'Filtri chat non validi';
  END IF;
  WITH sessions AS (
    SELECT s.id,'agente'::text source,s.canale,s.stato,s.iniziata_il,s.terminata_il,
      s.messaggi_totali,s.durata_secondi,coalesce(a.nome,'Agente') agent_nome
    FROM public.ai_chat_sessions s LEFT JOIN public.ai_agents_v2 a ON a.id=s.agent_id AND a.company_id=p_company_id
    WHERE s.company_id=p_company_id AND p_source IN ('tutti','agente')
    UNION ALL
    SELECT s.id,'sito','widget sito',
      CASE WHEN s.status IN ('active','qualified') AND s.ended_at IS NULL THEN 'attiva' ELSE 'chiusa' END,
      s.started_at,s.ended_at,s.message_count,
      greatest(0,extract(epoch FROM coalesce(s.ended_at,s.last_message_at,s.started_at)-s.started_at))::integer,
      CASE WHEN nullif(trim(s.collected_name),'') IS NULL THEN 'Visitatore del sito' ELSE s.collected_name END
    FROM public.public_chat_sessions s WHERE s.company_id=p_company_id AND p_source IN ('tutti','sito')
  ), page AS (
    SELECT * FROM sessions WHERE (p_status='tutti' OR stato=p_status)
      AND (p_search='' OR strpos(lower(agent_nome || ' ' || canale || ' ' || stato),lower(left(p_search,120)))>0)
    ORDER BY iniziata_il DESC,id,source LIMIT 51 OFFSET (p_page*50)
  )
  SELECT jsonb_build_object('sessions',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM
    (SELECT * FROM page LIMIT 50) x),'[]'::jsonb),'has_more',(SELECT count(*)>50 FROM page)) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_chat_history(uuid,integer,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_chat_history(uuid,integer,text,text,text) TO service_role;

-- One source of truth for company costs; usage contains actual voice deductions.
-- Non-voice conversations and the site widget are separate runtimes, not mirrored voice costs.
CREATE OR REPLACE FUNCTION public.agent_runtime_totals(p_company_id uuid,p_giorni integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'chats',(SELECT count(*) FROM public.ai_chat_sessions WHERE company_id=p_company_id AND iniziata_il>=now()-make_interval(days=>p_giorni))
      +(SELECT count(*) FROM public.public_chat_sessions WHERE company_id=p_company_id AND started_at>=now()-make_interval(days=>p_giorni)),
    'cost',(SELECT coalesce(sum(cost_billed_total),0) FROM public.ai_credit_usage WHERE company_id=p_company_id AND created_at>=now()-make_interval(days=>p_giorni))
      +(SELECT coalesce(sum(costo_crediti),0) FROM public.ai_conversations_v2 WHERE company_id=p_company_id AND canale<>'voce' AND creato_il>=now()-make_interval(days=>p_giorni))
      +(SELECT coalesce(sum(ai_cost_billed_eur),0) FROM public.public_chat_sessions WHERE company_id=p_company_id AND started_at>=now()-make_interval(days=>p_giorni))
  );
$$;
REVOKE ALL ON FUNCTION public.agent_runtime_totals(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_runtime_totals(uuid,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.get_ai_company_stats(p_company_id uuid,p_giorni integer DEFAULT 30)
RETURNS TABLE(agenti_attivi bigint,conv_totali bigint,minuti_totali double precision,chat_totali bigint,
 tasso_risposta double precision,crediti_usati double precision)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE days integer := greatest(1,least(365,coalesce(p_giorni,30))); totals jsonb;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  totals := public.agent_runtime_totals(p_company_id,days);
  RETURN QUERY SELECT
    (SELECT count(*) FROM public.ai_agents_v2 WHERE company_id=p_company_id AND stato='attivo'),
    (SELECT count(*) FROM public.ai_conversations_v2 WHERE company_id=p_company_id AND creato_il>=now()-make_interval(days=>days))+(totals->>'chats')::bigint,
    (SELECT coalesce(sum(durata_secondi),0)::float/60 FROM public.ai_conversations_v2 WHERE company_id=p_company_id AND canale='voce' AND creato_il>=now()-make_interval(days=>days)),
    (totals->>'chats')::bigint,
    (SELECT CASE WHEN count(*)=0 THEN 0::float ELSE count(*) FILTER(WHERE stato='completata')::float/count(*)*100 END
      FROM public.ai_conversations_v2 WHERE company_id=p_company_id AND canale='voce' AND direzione='outbound' AND creato_il>=now()-make_interval(days=>days)),
    (totals->>'cost')::float;
END;
$$;
REVOKE ALL ON FUNCTION public.get_ai_company_stats(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_ai_company_stats(uuid,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_ai_analytics(p_company_id uuid,p_giorni integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE from_date timestamptz := now()-make_interval(days=>greatest(1,least(365,coalesce(p_giorni,30))));
 v_calls jsonb; v_chats jsonb; v_agents jsonb; v_credits jsonb; v_daily_calls jsonb; v_daily_chats jsonb;
BEGIN
 PERFORM public.assert_company_access(p_company_id);
 SELECT jsonb_build_object('totali',count(*),'completate',count(*) FILTER(WHERE stato='completata'),
  'durata_media_sec',coalesce(avg(durata_secondi),0),'tasso_risposta',CASE WHEN count(*)=0 THEN 0 ELSE round(count(*) FILTER(WHERE stato='completata')::numeric/count(*)*100,1) END)
 INTO v_calls FROM public.ai_conversations_v2 WHERE company_id=p_company_id AND canale='voce' AND creato_il>=from_date;
 WITH chats AS (
  SELECT iniziata_il started,messaggi_totali messages,durata_secondi duration FROM public.ai_chat_sessions WHERE company_id=p_company_id
  UNION ALL SELECT started_at,message_count,greatest(0,extract(epoch FROM coalesce(ended_at,last_message_at,started_at)-started_at))::integer
  FROM public.public_chat_sessions WHERE company_id=p_company_id
 )
 SELECT jsonb_build_object('totali',count(*),'messaggi_totali',coalesce(sum(messages),0),'durata_media_sec',coalesce(avg(duration),0))
 INTO v_chats FROM chats WHERE started>=from_date;
 SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'count',cnt)),'[]') INTO v_agents FROM
  (SELECT tipo,count(*) cnt FROM public.ai_agents_v2 WHERE company_id=p_company_id AND stato='attivo' GROUP BY tipo) x;
 SELECT jsonb_build_object('totale_consumato',public.agent_runtime_totals(p_company_id,greatest(1,least(365,coalesce(p_giorni,30))))->'cost',
  'transazioni',(SELECT count(*) FROM public.ai_credit_usage WHERE company_id=p_company_id AND created_at>=from_date)) INTO v_credits;
 SELECT coalesce(jsonb_agg(jsonb_build_object('data',d,'count',cnt) ORDER BY d),'[]') INTO v_daily_calls FROM
  (SELECT (creato_il AT TIME ZONE 'Europe/Rome')::date d,count(*) cnt FROM public.ai_conversations_v2 WHERE company_id=p_company_id AND canale='voce' AND creato_il>=from_date GROUP BY 1) x;
 WITH chats AS (
  SELECT iniziata_il started FROM public.ai_chat_sessions WHERE company_id=p_company_id
  UNION ALL SELECT started_at FROM public.public_chat_sessions WHERE company_id=p_company_id
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('data',d,'count',cnt) ORDER BY d),'[]') INTO v_daily_chats FROM
  (SELECT (started AT TIME ZONE 'Europe/Rome')::date d,count(*) cnt FROM chats WHERE started>=from_date GROUP BY 1) x;
 RETURN jsonb_build_object('chiamate',v_calls,'chat',v_chats,'agenti',v_agents,'crediti',v_credits,'serie_chiamate',v_daily_calls,'serie_chat',v_daily_chats);
END;
$$;
REVOKE ALL ON FUNCTION public.get_ai_analytics(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_ai_analytics(uuid,integer) TO authenticated,service_role;
