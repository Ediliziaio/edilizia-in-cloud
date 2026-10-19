-- La marginalità per commessa letta anche dal bot WhatsApp (18/10/2026).
--
-- Silvio su WhatsApp chiama cg_get_marginalita_commesse con il service role e
-- l'azienda già verificata dal bot (numero, persona, ruolo). La funzione
-- riconosceva solo l'azienda della sessione dell'app, quindi da WhatsApp
-- rispondeva sempre «Accesso negato». Ora per i servizi interni vale lo stesso
-- interruttore dell'app (_cg_assert_enabled: il controllo di gestione deve
-- essere attivo per l'azienda); per gli utenti dell'app non cambia niente.
--
-- Rilanciabile: si tocca solo il controllo d'accesso, e solo se il corpo è
-- quello censito il 18/10/2026 oppure è già aggiornato (impronte md5).

set local lock_timeout = '3s';

do $$
declare
  v_impronta text;
  v_def text;
  v_vecchio constant text := $v$  IF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;$v$;
  v_nuovo constant text := $v$  -- Servizi interni (bot WhatsApp, Silvio dal server): chiamano con il service
  -- role e l'azienda già verificata; vale lo stesso interruttore dell'app.
  IF coalesce(auth.role(), '') = 'service_role' THEN
    PERFORM public._cg_assert_enabled(v_company_id);
  ELSIF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;$v$;
begin
  select md5(p.prosrc), pg_get_functiondef(p.oid) into v_impronta, v_def
    from pg_proc p where p.oid = 'public.cg_get_marginalita_commesse(uuid,integer,text)'::regprocedure;
  if v_impronta = 'b6042b8a33d54e4a1097e13d24131593' then
    return; -- già aggiornata
  end if;
  if v_impronta is distinct from '5c17acce02e642003d4142dd68f1b6d1' then
    raise exception 'cg_get_marginalita_commesse cambiata dopo il censimento del 18/10/2026 (impronta %): rivedere la migrazione', v_impronta;
  end if;
  if (length(v_def) - length(replace(v_def, v_vecchio, ''))) / length(v_vecchio) <> 1 then
    raise exception 'cg_get_marginalita_commesse: il punto da aggiornare non è unico';
  end if;
  execute replace(v_def, v_vecchio, v_nuovo);
end $$;
