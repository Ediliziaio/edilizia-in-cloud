-- ════════════════════════════════════════════════════════════════════════════
-- Flusso di lavoro commessa: le attività si passano il testimone
-- ════════════════════════════════════════════════════════════════════════════
-- Fino a qui il "Processo standard commessa" (order_task_template) era una
-- LISTA: applicandolo nascevano tutte le attività insieme, tutte assegnate alla
-- stessa persona, tutte con scadenza calcolata dalla data commessa. Nessun
-- legame fra un passo e il successivo: chi firmava il contratto doveva
-- ricordarsi di avvisare l'amministrazione, che doveva ricordarsi di avvisare
-- l'ufficio tecnico. Il passaggio di consegne viveva fuori dal gestionale.
--
-- Qui il template diventa un FLUSSO:
--   • ogni passo può avere un assegnatario proprio (persona; gli uffici/reparti
--     arriveranno dopo — vedi nota in fondo);
--   • ogni passo può dipendere da un altro (`dipende_da_id`): finché il passo
--     precedente non è chiuso, l'attività esiste ma è "In attesa", senza
--     scadenza, quindi non risulta arretrata e nessuno la prende in mano;
--   • quando il passo precedente si chiude, il successivo si sblocca da solo:
--     passa a "Da fare", riceve la scadenza (oggi + giorni_dopo_sblocco) e il
--     suo assegnatario riceve la notifica nella campanella.
--
-- Perché il gancio è `completed_at` e non `status`: gli stati delle attività
-- sono personalizzabili per azienda (src/lib/taskStatuses.ts, con stati custom
-- salvati lato client), quindi il DB non può conoscere il vocabolario. Invece
-- `completed_at` viene valorizzato da TUTTI i percorsi di chiusura (dialog,
-- riga, kanban, azioni multiple, area campo). NB: il trigger preesistente
-- `fire_task_automation` cerca gli stati 'completato'/'completed'/'done'/'fatto'
-- e quindi NON scatta mai, perché lo stato reale dell'app è 'completata'
-- (femminile): non ci si appoggia a quello.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Il template diventa un flusso
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.order_task_template
  ADD COLUMN IF NOT EXISTS assegna_a_utente    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dipende_da_id       uuid REFERENCES public.order_task_template(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS giorni_dopo_sblocco smallint NOT NULL DEFAULT 2;

COMMENT ON COLUMN public.order_task_template.assegna_a_utente IS
  'Chi riceve questo passo. NULL = responsabile della commessa (o chi applica il flusso).';
COMMENT ON COLUMN public.order_task_template.dipende_da_id IS
  'Passo che deve chiudersi prima. NULL = parte subito con la commessa.';
COMMENT ON COLUMN public.order_task_template.giorni_dopo_sblocco IS
  'Giorni concessi al passo DOPO che si è sbloccato. Ignorato sui passi senza dipendenza (che usano giorni_offset dalla data commessa).';

CREATE INDEX IF NOT EXISTS idx_order_task_template_dipende_da
  ON public.order_task_template(dipende_da_id) WHERE dipende_da_id IS NOT NULL;

-- Un passo non può dipendere da sé stesso né chiudere un anello: un anello non
-- darebbe errore, darebbe attività che non si sbloccano MAI e nessuno capirebbe
-- perché. Meglio rifiutarlo qui.
CREATE OR REPLACE FUNCTION public.order_task_template_no_cicli()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _cursore uuid := NEW.dipende_da_id;
  _giri    int  := 0;
BEGIN
  IF NEW.dipende_da_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.dipende_da_id = NEW.id THEN
    RAISE EXCEPTION 'Un passo non può dipendere da sé stesso.';
  END IF;

  WHILE _cursore IS NOT NULL AND _giri < 50 LOOP
    IF _cursore = NEW.id THEN
      RAISE EXCEPTION 'Dipendenza circolare: questi passi si aspetterebbero a vicenda per sempre.';
    END IF;
    SELECT dipende_da_id INTO _cursore FROM public.order_task_template WHERE id = _cursore;
    _giri := _giri + 1;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_task_template_no_cicli ON public.order_task_template;
CREATE TRIGGER trg_order_task_template_no_cicli
  BEFORE INSERT OR UPDATE OF dipende_da_id ON public.order_task_template
  FOR EACH ROW EXECUTE FUNCTION public.order_task_template_no_cicli();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. L'attività sa da chi sta aspettando
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS bloccata_da_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sblocco_giorni      smallint;

COMMENT ON COLUMN public.tasks.bloccata_da_task_id IS
  'Attività che deve chiudersi prima di questa. Resta valorizzata anche dopo lo sblocco: serve a mostrare "parte dopo: …".';
COMMENT ON COLUMN public.tasks.sblocco_giorni IS
  'Giorni concessi a partire dallo sblocco: il trigger ci calcola la due_date quando il passo precedente si chiude.';

CREATE INDEX IF NOT EXISTS idx_tasks_bloccata_da
  ON public.tasks(bloccata_da_task_id) WHERE bloccata_da_task_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Il testimone: chiudo un passo → parte il successivo
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sblocca_task_a_catena()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _passo    record;
  -- Il giorno ITALIANO, non quello UTC: dopo le 22/23 ora italiana la data UTC
  -- è ancora quella di ieri e la scadenza nascerebbe sbagliata di un giorno.
  _oggi     date := (now() AT TIME ZONE 'Europe/Rome')::date;
  _scadenza date;
BEGIN
  -- ── Chiusura: completed_at passa da vuoto a valorizzato ──
  IF OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL THEN
    FOR _passo IN
      SELECT id, title, assigned_to, company_id, order_id, ticket_id,
             COALESCE(sblocco_giorni, 0) AS giorni
        FROM public.tasks
       WHERE bloccata_da_task_id = NEW.id
         AND status = 'in_attesa'
    LOOP
      _scadenza := _oggi + _passo.giorni;

      UPDATE public.tasks
         SET status     = 'da_fare',
             due_date   = _scadenza,
             updated_at = now()
       WHERE id = _passo.id;

      -- Senza notifica lo "sblocco automatico" resta invisibile: la persona
      -- dovrebbe accorgersene passando dalla lista attività.
      IF _passo.assigned_to IS NOT NULL THEN
        INSERT INTO public.notifications
          (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
        VALUES (
          _passo.company_id,
          _passo.assigned_to,
          'task_sbloccata',
          'Tocca a te: ' || _passo.title,
          'Si è chiusa "' || NEW.title || '". Da fare entro il ' || to_char(_scadenza, 'DD/MM/YYYY') || '.',
          'task',
          _passo.id,
          CASE
            WHEN _passo.order_id IS NOT NULL THEN '/azienda/ordini/' || _passo.order_id::text
            ELSE '/azienda/attivita'
          END
        );
      END IF;
    END LOOP;

  -- ── Riapertura: il passo torna aperto, i successivi tornano in attesa ──
  -- Solo quelli ancora intonsi ('da_fare' e mai chiusi): se qualcuno ci ha già
  -- messo le mani (in corso, in revisione, chiuso) non gli si toglie il lavoro
  -- da sotto i piedi.
  ELSIF OLD.completed_at IS NOT NULL AND NEW.completed_at IS NULL THEN
    UPDATE public.tasks
       SET status     = 'in_attesa',
           due_date   = NULL,
           updated_at = now()
     WHERE bloccata_da_task_id = NEW.id
       AND status = 'da_fare'
       AND completed_at IS NULL;
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Un intoppo dell'automazione non deve MAI impedire di chiudere un'attività.
  RAISE LOG 'sblocca_task_a_catena error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sblocca_task_a_catena ON public.tasks;
CREATE TRIGGER trg_sblocca_task_a_catena
  AFTER UPDATE OF completed_at ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.sblocca_task_a_catena();

-- ════════════════════════════════════════════════════════════════════════════
-- Nota per il passo successivo (uffici/reparti)
-- ════════════════════════════════════════════════════════════════════════════
-- Oggi `assegna_a_utente` punta a una persona. Quando arriveranno gli uffici
-- (Amministrazione, Tecnico, Commerciale…) basterà aggiungere
-- `order_task_template.assegna_a_ufficio_id` accanto — la colonna storica
-- `assegna_a_ruolo` è già lì, inutilizzata, e va bonificata in quell'occasione.
-- La catena (dipende_da_id → bloccata_da_task_id → trigger) non cambia: cambia
-- solo CHI viene scritto in tasks.assigned_to al momento della creazione.
-- ════════════════════════════════════════════════════════════════════════════
