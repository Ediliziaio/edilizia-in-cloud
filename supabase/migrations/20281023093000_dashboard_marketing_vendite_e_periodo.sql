-- Dashboard marketing (get_marketing_dashboard_stats), dalla rilettura del 23/10.
-- Si modifica il testo live: ogni punto deve esserci una volta sola, altrimenti
-- la migrazione si ferma. Idempotente: se la funzione è già corretta non la tocca.
--
-- 1. Il periodo precedente è lungo gli stessi GIORNI di calendario del periodo,
--    non lo stesso tempo: dal cambio dell'ora (25/10) un periodo a cavallo
--    durava un'ora in più, e il precedente cominciava un giorno prima.
-- 2. La tabella per commerciale conta anche lo staff dell'azienda che ha il
--    profilo in un'altra (staff_permissions), come marketing_attivita_team.
-- 3. Le vendite di chi non c'è più, o senza venditore, vanno in una riga
--    «Non assegnati o utenti rimossi»: la somma delle righe torna col riquadro
--    «Vendite» (un'azienda ne perdeva 21 su 41, 268.900 € in 90 giorni).

do $$
declare
  v_firma constant regprocedure := 'public.get_marketing_dashboard_stats(uuid,timestamptz,timestamptz,uuid[],text[],uuid)'::regprocedure;
  v_def text;
  v_nuovo text;
  v_punto text;
begin
  select pg_get_functiondef(v_firma) into v_def;
  if position('Non assegnati o utenti rimossi' in v_def) > 0 then
    return;
  end if;
  v_nuovo := v_def;

  v_punto := '  v_period_length interval := v_date_to - v_date_from;
  v_prev_from timestamptz := v_date_from - v_period_length;';
  if (length(v_nuovo) - length(replace(v_nuovo, v_punto, ''))) <> length(v_punto) then
    raise exception 'periodo: punto non trovato una volta sola';
  end if;
  v_nuovo := replace(v_nuovo, v_punto,
'  -- i giorni di calendario del periodo (ora italiana), non la sua durata:
  -- a cavallo del cambio dell''ora la durata ha un''ora in più o in meno
  v_period_length interval := ((v_date_to AT TIME ZONE ''Europe/Rome'')::date - (v_date_from AT TIME ZONE ''Europe/Rome'')::date + 1) * interval ''1 day'';
  v_prev_from timestamptz := ((v_date_from AT TIME ZONE ''Europe/Rome'') - v_period_length) AT TIME ZONE ''Europe/Rome'';');

  v_punto := '    WHERE p.company_id = p_company_id
      AND (p_assigned_user_ids IS NULL OR p.id = ANY(p_assigned_user_ids))';
  if (length(v_nuovo) - length(replace(v_nuovo, v_punto, ''))) <> length(v_punto) then
    raise exception 'sales_users: punto non trovato una volta sola';
  end if;
  v_nuovo := replace(v_nuovo, v_punto,
'    WHERE (p.company_id = p_company_id
           OR EXISTS (SELECT 1 FROM staff_permissions sp WHERE sp.user_id = p.id AND sp.company_id = p_company_id))
      AND (p_assigned_user_ids IS NULL OR p.id = ANY(p_assigned_user_ids))');

  v_punto := '    FROM sales_users su
    LEFT JOIN appuntamenti ap ON ap.user_id = su.user_id
    LEFT JOIN vendite ve ON ve.user_id = su.user_id
    LEFT JOIN esiti es ON es.user_id = su.user_id
  ) s;';
  if (length(v_nuovo) - length(replace(v_nuovo, v_punto, ''))) <> length(v_punto) then
    raise exception 'tabella commerciali: punto non trovato una volta sola';
  end if;
  v_nuovo := replace(v_nuovo, v_punto,
'    FROM sales_users su
    LEFT JOIN appuntamenti ap ON ap.user_id = su.user_id
    LEFT JOIN vendite ve ON ve.user_id = su.user_id
    LEFT JOIN esiti es ON es.user_id = su.user_id
    UNION ALL
    -- vendite senza venditore o di chi non è più in azienda: senza questa riga
    -- la tabella non tornava col riquadro «Vendite»
    SELECT NULL::uuid, ''Non assegnati o utenti rimossi'', 0, 0,
      SUM(ve.cnt), SUM(ve.total_value), 0, 0::numeric, 0::numeric
    FROM vendite ve
    WHERE p_assigned_user_ids IS NULL
      AND (ve.user_id IS NULL OR NOT EXISTS (SELECT 1 FROM sales_users su2 WHERE su2.user_id = ve.user_id))
    HAVING COALESCE(SUM(ve.cnt), 0) > 0
  ) s;');

  execute v_nuovo;
end $$;
