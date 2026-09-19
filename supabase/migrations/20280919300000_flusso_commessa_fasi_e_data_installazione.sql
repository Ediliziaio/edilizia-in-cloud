-- Flusso commessa: il passaggio chiuso fa avanzare la fase, il flusso parte da
-- solo su ogni commessa nuova, e la data di installazione diventa un evento.
--
-- Richiesta di Green Energy Group ed Energia Più (19/09/2026): dieci passaggi
-- con un ufficio responsabile ciascuno, e a ogni passaggio chiuso l'ufficio
-- dopo deve saperlo. La catena dei compiti c'era già (sblocca_task_a_catena),
-- ma mancavano tre pezzi:
--
-- 1. Il passaggio chiuso non spostava la fase della commessa. Le fasi e i
--    compiti erano due mondi separati: l'elenco commesse non diceva a che punto
--    era una pratica, e le automazioni «stato commessa cambiato» non partivano.
--    Ora ogni passo del flusso può dire in che fase entra la commessa quando
--    lui si chiude (order_task_template.fase_raggiunta_id), il compito se lo
--    porta dietro (tasks.fase_al_completamento_id), e alla chiusura la commessa
--    avanza. Solo in avanti: una commessa già oltre non torna indietro.
--
-- 2. Il flusso si applicava da solo solo dalla pagina «Nuova commessa»
--    (CreateOrder chiama applicaFlusso lato browser). Una commessa nata da
--    un'opportunità vinta, da un preventivo firmato o da un'automazione restava
--    senza compiti. Ora lo applica il database a ogni commessa nuova, quando
--    l'azienda ha acceso playbook_auto_apply. Stesse regole di applicaFlusso
--    (src/lib/flussoLavoro.ts): idempotente sui titoli, compiti di ufficio in
--    carico al responsabile, passi con un predecessore «in attesa» e senza
--    scadenza. La chiamata del browser resta e non crea doppioni.
--
-- 3. Nessun evento per la data di installazione (orders.expected_date): serve
--    all'email «Data installazione» per il cliente.

ALTER TABLE public.order_task_template
  ADD COLUMN IF NOT EXISTS fase_raggiunta_id uuid REFERENCES public.order_statuses(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.order_task_template.fase_raggiunta_id IS
  'Fase in cui entra la commessa quando questo passo si chiude. NULL = la fase non cambia.';

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS fase_al_completamento_id uuid REFERENCES public.order_statuses(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.tasks.fase_al_completamento_id IS
  'Copiata dal passo del flusso: alla chiusura del compito la commessa avanza in questa fase.';

-- ── 1. Passo chiuso → fase della commessa ────────────────────────────────
CREATE OR REPLACE FUNCTION public.avanza_fase_da_passo_chiuso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _pos_nuova    integer;
  _nome_nuova   text;
  _attuale      uuid;
  _pos_attuale  integer;
  _nome_attuale text;
BEGIN
  IF NEW.order_id IS NULL OR NEW.fase_al_completamento_id IS NULL THEN RETURN NEW; END IF;
  IF NOT (OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL) THEN RETURN NEW; END IF;

  SELECT s.position, s.name INTO _pos_nuova, _nome_nuova
    FROM public.order_statuses s
   WHERE s.id = NEW.fase_al_completamento_id AND s.company_id = NEW.company_id;
  IF _nome_nuova IS NULL THEN RETURN NEW; END IF;

  SELECT o.current_status_id, s.position, s.name
    INTO _attuale, _pos_attuale, _nome_attuale
    FROM public.orders o
    LEFT JOIN public.order_statuses s ON s.id = o.current_status_id
   WHERE o.id = NEW.order_id AND o.company_id = NEW.company_id AND o.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Solo in avanti.
  IF _attuale = NEW.fase_al_completamento_id
     OR (_pos_attuale IS NOT NULL AND _pos_attuale >= _pos_nuova) THEN
    RETURN NEW;
  END IF;

  UPDATE public.orders
     SET current_status_id = NEW.fase_al_completamento_id, updated_at = now()
   WHERE id = NEW.order_id;

  INSERT INTO public.order_status_history (order_id, status_id, changed_by)
  VALUES (NEW.order_id, NEW.fase_al_completamento_id, auth.uid())
  ON CONFLICT DO NOTHING;

  -- La cronologia della commessa: se non si riesce a scriverla, la fase
  -- avanza lo stesso (blocco a parte, così un errore qui non annulla l'UPDATE).
  BEGIN
    INSERT INTO public.order_events (order_id, company_id, event_type, payload, actor_id, actor_name)
    VALUES (
      NEW.order_id, NEW.company_id, 'stato_cambiato',
      jsonb_build_object(
        'from_status', _nome_attuale, 'to_status', _nome_nuova,
        'origine', 'flusso_di_lavoro', 'task_id', NEW.id, 'task', NEW.title),
      auth.uid(),
      (SELECT TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''))
         FROM public.profiles p WHERE p.id = auth.uid())
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'avanza_fase_da_passo_chiuso: cronologia non scritta: %', SQLERRM;
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'avanza_fase_da_passo_chiuso: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_avanza_fase_da_passo_chiuso ON public.tasks;
CREATE TRIGGER trg_avanza_fase_da_passo_chiuso
AFTER UPDATE OF completed_at ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.avanza_fase_da_passo_chiuso();

-- ── 2. Il flusso su ogni commessa nuova ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.applica_flusso_commessa(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _o          record;
  _vertical   text;
  _creato_da  uuid;
  _oggi       date := (now() AT TIME ZONE 'Europe/Rome')::date;
  _passo      record;
  _mappa      jsonb := '{}'::jsonb;   -- id passo del flusso → id compito
  _nuovo      uuid;
  _pred       uuid;
  _assegnato  uuid;
  _progresso  boolean;
  _forza      boolean := false;
  _giro       integer := 0;
  _creati     integer := 0;
BEGIN
  SELECT o.id, o.company_id, o.assigned_to, o.created_by, c.vertical
    INTO _o
    FROM public.orders o JOIN public.companies c ON c.id = o.company_id
   WHERE o.id = p_order_id AND o.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Stessa regola di useVertical(): un settore non riconosciuto vale «generico».
  _vertical := CASE
    WHEN _o.vertical IN ('serramentista','fotovoltaico','tetti','bagno','ristrutturazione',
                         'tende_da_sole','vetrate','caldaie','clima','generico')
    THEN _o.vertical ELSE 'generico' END;

  -- tasks.created_by è obbligatorio.
  _creato_da := COALESCE(
    _o.created_by,
    auth.uid(),
    (SELECT ur.user_id FROM public.user_roles ur
       JOIN public.profiles p ON p.id = ur.user_id
      WHERE p.company_id = _o.company_id AND ur.role = 'company_admin'
      ORDER BY p.created_at LIMIT 1));
  IF _creato_da IS NULL THEN RETURN 0; END IF;

  -- Idempotente: i passi già presenti sulla commessa (stesso titolo) non si
  -- ricreano, ma fanno da ancora per chi dipende da loro.
  FOR _passo IN
    SELECT t.id, lower(trim(t.titolo)) AS chiave
      FROM public.order_task_template t
     WHERE t.company_id = _o.company_id AND t.attivo
       AND COALESCE(t.ambito, 'commessa') = 'commessa' AND t.vertical = _vertical
  LOOP
    SELECT k.id INTO _nuovo
      FROM public.tasks k
     WHERE k.order_id = p_order_id AND lower(trim(k.title)) = _passo.chiave
     LIMIT 1;
    IF _nuovo IS NOT NULL THEN
      _mappa := _mappa || jsonb_build_object(_passo.id::text, _nuovo);
    END IF;
  END LOOP;

  -- A ondate, come applicaFlusso: prima i passi che possono partire, poi
  -- quelli che li aspettano. Se nessuno può partire (dipendenza verso un passo
  -- spento) si creano tutti come partenze: meglio un flusso piatto che fermo.
  LOOP
    _giro := _giro + 1;
    _progresso := false;
    FOR _passo IN
      SELECT t.*
        FROM public.order_task_template t
       WHERE t.company_id = _o.company_id AND t.attivo
         AND COALESCE(t.ambito, 'commessa') = 'commessa' AND t.vertical = _vertical
         AND NOT (_mappa ? t.id::text)
       ORDER BY t.sort_order
    LOOP
      IF NOT _forza
         AND _passo.dipende_da_id IS NOT NULL
         AND NOT (_mappa ? _passo.dipende_da_id::text) THEN
        CONTINUE;
      END IF;

      _pred := CASE
        WHEN _passo.dipende_da_id IS NOT NULL AND (_mappa ? _passo.dipende_da_id::text)
        THEN (_mappa ->> _passo.dipende_da_id::text)::uuid END;

      _assegnato := CASE
        WHEN _passo.assegna_a_ufficio_id IS NOT NULL THEN
          (SELECT u.responsabile_id FROM public.company_uffici u WHERE u.id = _passo.assegna_a_ufficio_id)
        ELSE COALESCE(_passo.assegna_a_utente, _o.assigned_to, _creato_da) END;

      INSERT INTO public.tasks (
        company_id, order_id, title, notes, status, due_date,
        bloccata_da_task_id, sblocco_giorni, priority, category,
        chiudi_su_evento, ufficio_id, assigned_to, created_by, fase_al_completamento_id)
      VALUES (
        _o.company_id, p_order_id, _passo.titolo, _passo.descrizione,
        CASE WHEN _pred IS NULL THEN 'da_fare' ELSE 'in_attesa' END,
        CASE WHEN _pred IS NULL THEN _oggi + COALESCE(_passo.giorni_offset, 0) END,
        _pred,
        CASE WHEN _pred IS NOT NULL THEN COALESCE(_passo.giorni_dopo_sblocco, 0) END,
        COALESCE(_passo.priorita, 'normale'), 'ordini',
        _passo.chiudi_su_evento, _passo.assegna_a_ufficio_id, _assegnato, _creato_da,
        _passo.fase_raggiunta_id)
      RETURNING id INTO _nuovo;

      _mappa := _mappa || jsonb_build_object(_passo.id::text, _nuovo);
      _creati := _creati + 1;
      _progresso := true;
    END LOOP;

    EXIT WHEN _giro > 60;
    IF NOT _progresso THEN
      EXIT WHEN _forza OR NOT EXISTS (
        SELECT 1 FROM public.order_task_template t
         WHERE t.company_id = _o.company_id AND t.attivo
           AND COALESCE(t.ambito, 'commessa') = 'commessa' AND t.vertical = _vertical
           AND NOT (_mappa ? t.id::text));
      _forza := true;
    END IF;
  END LOOP;

  RETURN _creati;
END;
$$;

REVOKE ALL ON FUNCTION public.applica_flusso_commessa(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.applica_flusso_commessa(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_applica_flusso_su_commessa_nuova()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.company_id IS NULL OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.companies c WHERE c.id = NEW.company_id AND c.playbook_auto_apply
  ) THEN
    RETURN NEW;
  END IF;
  -- Mai bloccare la creazione di una commessa per colpa del flusso.
  BEGIN
    PERFORM public.applica_flusso_commessa(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'applica_flusso_commessa (%): %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flusso_su_commessa_nuova ON public.orders;
CREATE TRIGGER trg_flusso_su_commessa_nuova
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_applica_flusso_su_commessa_nuova();

-- ── 3. Evento «data di installazione fissata» ────────────────────────────
-- Stesso corpo di prima, più l'evento order_installation_date_set quando
-- orders.expected_date viene impostata o spostata (anche alla creazione).
CREATE OR REPLACE FUNCTION public.fire_order_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _status_name text;
  _old_status_name text;
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
    VALUES (NEW.company_id, 'order_created', NEW.id::text, 'order',
      jsonb_build_object('order_id', NEW.id, 'order_code', NEW.order_code, 'total_amount', NEW.total_amount,
        'customer_id', NEW.customer_id, 'current_status_id', NEW.current_status_id, 'status', NEW.status,
        'order_type', NEW.order_type, 'assigned_to', NEW.assigned_to, 'description', NEW.description,
        'work_start_date', NEW.work_start_date, 'work_end_date', NEW.work_end_date, 'created_at', NEW.created_at));
    IF NEW.expected_date IS NOT NULL THEN
      INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
      VALUES (NEW.company_id, 'order_installation_date_set', NEW.id::text, 'order',
        jsonb_build_object('order_id', NEW.id, 'order_code', NEW.order_code, 'customer_id', NEW.customer_id,
          'expected_date', NEW.expected_date, 'old_expected_date', NULL,
          'current_status_id', NEW.current_status_id));
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (NEW.current_status_id IS DISTINCT FROM OLD.current_status_id) OR (NEW.status IS DISTINCT FROM OLD.status) THEN
      SELECT name INTO _status_name FROM public.order_statuses WHERE id = NEW.current_status_id;
      SELECT name INTO _old_status_name FROM public.order_statuses WHERE id = OLD.current_status_id;
      INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
      VALUES (NEW.company_id, 'order_status_changed', NEW.id::text, 'order',
        jsonb_build_object('order_id', NEW.id, 'order_code', NEW.order_code, 'current_status_id', NEW.current_status_id,
          'old_status_id', OLD.current_status_id, 'status', NEW.status, 'old_status', OLD.status,
          'status_name', _status_name, 'old_status_name', _old_status_name, 'customer_id', NEW.customer_id,
          'total_amount', NEW.total_amount, 'order_type', NEW.order_type));
    END IF;
    IF NEW.expected_date IS NOT NULL AND NEW.expected_date IS DISTINCT FROM OLD.expected_date THEN
      INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
      VALUES (NEW.company_id, 'order_installation_date_set', NEW.id::text, 'order',
        jsonb_build_object('order_id', NEW.id, 'order_code', NEW.order_code, 'customer_id', NEW.customer_id,
          'expected_date', NEW.expected_date, 'old_expected_date', OLD.expected_date,
          'current_status_id', NEW.current_status_id));
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fire_order_automation error: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.avanza_fase_da_passo_chiuso() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trg_applica_flusso_su_commessa_nuova() FROM PUBLIC, anon;
