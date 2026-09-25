-- Senza azienda non vuol dire tutte le aziende.
--
-- Trovato il 26/09/2026 nell'audit dei permessi. 27 funzioni SECURITY
-- DEFINER controllavano l'azienda con `x <> get_my_company_id()` (o
-- get_effective_company_id()). Per chi non ha un'azienda quella funzione vale
-- NULL, il confronto dà NULL e l'IF non scatta. Chi non ha azienda è, per
-- esempio, chi entra con Google senza essere stato invitato: Supabase crea
-- l'utente lo stesso (ce ne sono 4, senza profilo). Con quel token si
-- leggevano, di QUALSIASI azienda:
--   - il Controllo di Gestione: conto economico, stato patrimoniale, rating,
--     marginalità delle commesse, cash flow, imposte, simulazioni;
--   - la valorizzazione e i lotti in scadenza del magazzino;
--   - il tracciamento di un contatto;
-- e si cambiava il magazzino predefinito di un'altra azienda. Passavano
-- anche i commercialisti, che non hanno un'azienda nel profilo, per
-- qualsiasi azienda e non solo per i clienti dello studio.
--
-- Ora il confronto è `IS DISTINCT FROM`: per chi ha un'azienda non cambia
-- niente, per chi non ce l'ha il valore è «diverso» e la funzione si ferma.
-- Le cinque delle sequenze e della coda di Silvio erano già protette dal
-- secondo controllo (is_email_staff_interno): si correggono lo stesso.
--
-- Poi:
--   - get_ai_economics_dashboard fermava solo la vista globale: con l'id di
--     un'azienda, qualsiasi utente leggeva costi veri, margini, modelli e
--     ricariche AI di quell'azienda. La usa solo il pannello del super
--     admin: ora è solo sua;
--   - ai_get_prompt_variant (i testi dei prompt in prova) e
--     silvio_canale_risolvi_utente (da un numero o un id Telegram all'utente e
--     alla sua azienda) le chiama solo il server con la chiave di servizio:
--     ora solo il servizio.

set local lock_timeout = '3s';

do $confronti$
declare
  elenco constant text[] := array[
    'cg_get_aging', 'cg_get_bep', 'cg_get_budget_consuntivo_forecast', 'cg_get_cash_flow_prospettico',
    'cg_get_ce_mensile', 'cg_get_ce_mensile_dettaglio', 'cg_get_conto_economico_riclassificato',
    'cg_get_dettaglio_voce_mese', 'cg_get_health_check', 'cg_get_imposte_dettaglio', 'cg_get_indici_avanzati',
    'cg_get_marginalita_commesse', 'cg_get_pfn', 'cg_get_rating', 'cg_get_riconciliazione',
    'cg_get_stato_patrimoniale_riclassificato', 'cg_simula_piano_industriale', 'cg_simulazione_what_if',
    'get_contact_tracking', 'sequenza_approva_attiva', 'sequenza_enroll', 'sequenza_esecuzione_stato',
    'sequenza_invio_conferma', 'set_default_warehouse', 'silvio_coda_risolvi', 'wh_get_lotti_in_scadenza',
    'wh_get_valorizzazione'
  ];
  confronto constant text := '(\S+) <> public\.(get_my_company_id|get_effective_company_id)\(\)';
  f record;
  v_def text;
  v_volte integer;
begin
  if (select count(distinct p.proname) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and p.proname = any (elenco)) <> cardinality(elenco) then
    raise exception 'non tutte le % funzioni in elenco esistono', cardinality(elenco);
  end if;
  for f in
    select p.oid, p.oid::regprocedure::text as firma
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = any (elenco)
  loop
    v_def := pg_catalog.pg_get_functiondef(f.oid);
    v_volte := (select count(*) from regexp_matches(v_def, confronto, 'g'));
    if v_volte = 0 then
      continue;  -- già corretta
    end if;
    if v_volte <> 1 then
      raise exception '%: confronto trovato % volte invece di una', f.firma, v_volte;
    end if;
    execute regexp_replace(v_def, confronto, '\1 IS DISTINCT FROM public.\2()');
  end loop;
end
$confronti$;

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
  'public.get_ai_economics_dashboard(text,uuid)', 'costi veri e i margini della piattaforma',
  $ancora$  IF NOT v_is_super AND p_company_id IS NULL THEN
    RAISE EXCEPTION 'Permesso negato: solo super_admin può vedere dati globali (p_company_id=NULL)'
      USING ERRCODE = '42501';
  END IF;
$ancora$,
  $aggiunta$  -- Anche per una sola azienda: sono i costi veri e i margini della piattaforma.
  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Permesso negato: solo super_admin' USING ERRCODE = '42501';
  END IF;
$aggiunta$);

revoke all on function public.ai_get_prompt_variant(text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_get_prompt_variant(text, uuid, uuid, uuid) to service_role;
revoke all on function public.silvio_canale_risolvi_utente(text, text) from public, anon, authenticated;
grant execute on function public.silvio_canale_risolvi_utente(text, text) to service_role;
