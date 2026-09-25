-- Silvio: gli strumenti che mandano e decidono li esegue il servizio; le
-- notifiche vanno solo a chi è dell'azienda, con un collegamento dell'app.
--
-- Trovato il 26/09/2026 nell'audit dei permessi:
--   - undici funzioni SECURITY DEFINER che mandano o decidono (rispondere a
--     un'email del cliente, comporre e inviare un messaggio, mettere in coda un
--     invio, approvare con modifiche o annullare un'azione, salvare una regola
--     decisionale, lanciare un'automazione…) guardavano solo l'accesso
--     all'azienda: Silvio le filtra per ruolo e permessi nella chat, ma
--     chiamate direttamente dal browser le eseguiva qualsiasi membro, e molte
--     prendono l'utente come parametro. Le chiamano solo gli strumenti di
--     Silvio sul server (chat, WhatsApp, Telegram, voce, orchestratore: sempre
--     con la chiave di servizio), il brief del mattino, check-due-dates e altre
--     funzioni SECURITY DEFINER, che girano come proprietario: a loro non
--     cambia niente;
--   - create_notification accettava qualsiasi destinatario e qualsiasi
--     collegamento: si mandava a un utente di un'altra azienda una notifica
--     col testo che si voleva e un link a un sito esterno. Ora un link che non
--     è un percorso dell'app si toglie (la notifica parte lo stesso: un trigger
--     non deve fallire per un link), e chiamata direttamente da un utente
--     avvisa solo chi è dell'azienda. I trigger e le funzioni del server
--     scelgono il destinatario dai dati (il subappaltatore a cui si assegna
--     un'attività, il titolare del documento firmato) e restano come prima.

set local lock_timeout = '3s';

do $revoca$
declare
  elenco constant text[] := array[
    'silvio_tool_componi_e_invia_messaggio', 'silvio_tool_rispondi_a_email', 'silvio_tool_enqueue_creativita',
    'silvio_tool_approve_proposal_with_edits', 'silvio_tool_undo_executed_action',
    'silvio_tool_salva_regola_decisionale', 'silvio_outbound_enqueue', 'silvio_tool_genera_documento_router',
    'silvio_decision_log_propose', 'silvio_brief_promote_alert', 'execute_automation'
  ];
  f record;
  n integer := 0;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = any (elenco)
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    execute format('grant execute on function %s to service_role', f.firma);
    n := n + 1;
  end loop;
  if n <> cardinality(elenco) then
    raise exception 'funzioni trovate % su % in elenco', n, cardinality(elenco);
  end if;
end
$revoca$;

create or replace function pg_temp.aggiungi_controllo(p_firma text, p_segno text, p_ancora text, p_aggiunta text)
 returns void
 language plpgsql
as $function$
declare
  v_def text := pg_catalog.pg_get_functiondef(p_firma::pg_catalog.regprocedure);
  v_volte integer;
begin
  if position(p_segno in v_def) > 0 then
    return;  -- già applicata
  end if;
  v_volte := (length(v_def) - length(replace(v_def, p_ancora, ''))) / length(p_ancora);
  if v_volte <> 1 then
    raise exception '%: punto di aggancio trovato % volte invece di una', p_firma, v_volte;
  end if;
  execute replace(v_def, p_ancora, p_ancora || p_aggiunta);
end;
$function$;

select pg_temp.aggiungi_controllo(
  'public.create_notification(uuid,uuid,text,text,text,text,uuid,text)', 'collegamento dell''app',
  $ancora$  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN NULL;
  END IF;
$ancora$,
  $aggiunta$  -- Solo un collegamento dell'app: un link che porta fuori si toglie.
  IF p_action_url IS NOT NULL AND p_action_url !~ '^/([^/\\]|$)' THEN
    p_action_url := NULL;
  END IF;
  -- Chiamata direttamente da un utente, avvisa solo chi è dell'azienda
  -- (profilo, accesso multi-azienda attivo, studio del commercialista, super
  -- admin); se no si salta, come per l'utente che non esiste. I trigger e il
  -- server scelgono il destinatario dai dati e restano come prima.
  IF pg_trigger_depth() = 0 AND NOT public.is_platform_staff()
     AND NOT EXISTS (SELECT 1 FROM public.profiles pr
                      WHERE pr.id = p_user_id AND pr.company_id = p_company_id)
     AND NOT EXISTS (SELECT 1 FROM public.multi_company_access m
                      WHERE m.user_id = p_user_id AND m.company_id = p_company_id AND m.status = 'active'
                        AND (m.expires_at IS NULL OR m.expires_at > now()))
     AND NOT EXISTS (SELECT 1 FROM public.accountant_company_access aca
                       JOIN public.accountant_firm_members afm ON afm.firm_id = aca.firm_id
                      WHERE aca.company_id = p_company_id AND aca.status = 'active'
                        AND afm.user_id = p_user_id AND afm.status = 'active')
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = p_user_id AND ur.role = 'super_admin') THEN
    RETURN NULL;
  END IF;
$aggiunta$);
