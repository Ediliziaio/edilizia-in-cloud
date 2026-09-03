-- ════════════════════════════════════════════════════════════════════════════
-- Sblocco automatico: il passo "aspetta l'incasso" si chiude da solo
-- ════════════════════════════════════════════════════════════════════════════
-- Nel flusso reale c'è sempre un passo che non è lavoro di nessuno: "attendere
-- l'incasso dell'acconto". Finora qualcuno doveva accorgersi che i soldi erano
-- arrivati e spuntare a mano un'attività — cioè dire al gestionale una cosa che
-- il gestionale sapeva già, perché la rata è segnata incassata lì dentro.
--
-- Qui quel passo si chiude da solo. E siccome chiudere un passo È il modo in cui
-- parte il successivo (trigger `sblocca_task_a_catena`), non serve nessun
-- secondo meccanismo di sblocco: l'ufficio tecnico riceve la sua attività senza
-- che nessuno abbia toccato niente.
--
-- Tre strade portano allo stesso evento, perché in azienda un incasso si
-- registra in tre posti diversi:
--   • `order_installments.is_paid` → la rata della commessa segnata incassata;
--   • `invoice_payments` (INSERT)  → un pagamento su una fattura di commessa;
--   • `tickets.pagato`             → l'intervento di assistenza saldato.
--
-- Il caso dell'incasso ANTICIPATO: se i soldi arrivano mentre il passo è ancora
-- "In attesa" del suo predecessore, chiuderlo subito salterebbe la catena. Si
-- annota invece che l'evento è già avvenuto (`evento_gia_avvenuto`), e il passo
-- si chiuderà da sé nell'istante in cui tocca a lui — senza fermare nessuno e
-- senza avvisare una persona di un lavoro che non deve fare.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Il passo può dichiarare da quale fatto si considera concluso
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.order_task_template
  ADD COLUMN IF NOT EXISTS chiudi_su_evento text;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS chiudi_su_evento    text,
  ADD COLUMN IF NOT EXISTS evento_gia_avvenuto boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_task_template_chiudi_su_evento_check') THEN
    ALTER TABLE public.order_task_template
      ADD CONSTRAINT order_task_template_chiudi_su_evento_check
      CHECK (chiudi_su_evento IS NULL OR chiudi_su_evento IN ('incasso_registrato'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_chiudi_su_evento_check') THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_chiudi_su_evento_check
      CHECK (chiudi_su_evento IS NULL OR chiudi_su_evento IN ('incasso_registrato'));
  END IF;
END $$;

COMMENT ON COLUMN public.order_task_template.chiudi_su_evento IS
  'Fatto che chiude il passo da solo, senza spunta. NULL = si chiude a mano. Oggi: incasso_registrato.';
COMMENT ON COLUMN public.tasks.chiudi_su_evento IS
  'Fatto che chiude l''attività da sola (copiato dal passo del flusso).';
COMMENT ON COLUMN public.tasks.evento_gia_avvenuto IS
  'L''evento è arrivato mentre l''attività era ancora In attesa: si chiuderà da sé appena sbloccata.';

CREATE INDEX IF NOT EXISTS idx_tasks_chiudi_su_evento
  ON public.tasks(chiudi_su_evento) WHERE chiudi_su_evento IS NOT NULL AND completed_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. "È successo il fatto X su questa commessa / questo ticket"
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chiudi_passi_su_evento(
  _evento    text,
  _order_id  uuid DEFAULT NULL,
  _ticket_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _order_id IS NULL AND _ticket_id IS NULL THEN
    RETURN;
  END IF;

  -- Passo già sbloccato e aperto: si chiude adesso. L'UPDATE su completed_at fa
  -- scattare sblocca_task_a_catena, che manda avanti la catena.
  UPDATE public.tasks
     SET status       = 'completata',
         completed_at = now(),
         updated_at   = now()
   WHERE chiudi_su_evento = _evento
     AND completed_at IS NULL
     AND status <> 'in_attesa'
     AND ((_order_id  IS NOT NULL AND order_id  = _order_id)
       OR (_ticket_id IS NOT NULL AND ticket_id = _ticket_id));

  -- Passo ancora in attesa del predecessore: chiuderlo ora salterebbe la fila.
  -- Si annota il fatto; ci pensa lo sblocco.
  UPDATE public.tasks
     SET evento_gia_avvenuto = true,
         updated_at          = now()
   WHERE chiudi_su_evento = _evento
     AND completed_at IS NULL
     AND status = 'in_attesa'
     AND evento_gia_avvenuto = false
     AND ((_order_id  IS NOT NULL AND order_id  = _order_id)
       OR (_ticket_id IS NOT NULL AND ticket_id = _ticket_id));
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Lo sblocco tiene conto degli eventi già avvenuti
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sblocca_task_a_catena()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _passo    record;
  _dest     record;
  -- Il giorno ITALIANO, non quello UTC: dopo le 22/23 ora italiana la data UTC
  -- è ancora quella di ieri e la scadenza nascerebbe sbagliata di un giorno.
  _oggi     date := (now() AT TIME ZONE 'Europe/Rome')::date;
  _scadenza date;
  _titolo   text;
  _link     text;
BEGIN
  IF OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL THEN
    FOR _passo IN
      SELECT id, title, assigned_to, company_id, order_id, ticket_id, ufficio_id,
             chiudi_su_evento, evento_gia_avvenuto,
             COALESCE(sblocco_giorni, 0) AS giorni
        FROM public.tasks
       WHERE bloccata_da_task_id = NEW.id
         AND status = 'in_attesa'
    LOOP
      -- L'incasso era già arrivato mentre questo passo aspettava il suo turno:
      -- non c'è niente da far fare a nessuno, si chiude e la catena prosegue
      -- (l'UPDATE rifà scattare questo stesso trigger sul passo successivo).
      IF _passo.chiudi_su_evento IS NOT NULL AND _passo.evento_gia_avvenuto THEN
        UPDATE public.tasks
           SET status       = 'completata',
               due_date     = _oggi,
               completed_at = now(),
               updated_at   = now()
         WHERE id = _passo.id;
        CONTINUE;
      END IF;

      _scadenza := _oggi + _passo.giorni;

      UPDATE public.tasks
         SET status     = 'da_fare',
             due_date   = _scadenza,
             updated_at = now()
       WHERE id = _passo.id;

      _link := CASE
        WHEN _passo.order_id  IS NOT NULL THEN '/azienda/ordini/'     || _passo.order_id::text
        WHEN _passo.ticket_id IS NOT NULL THEN '/azienda/assistenza/' || _passo.ticket_id::text
        ELSE '/azienda/attivita'
      END;

      -- Ufficio: avvisa tutti i membri, così chi è libero se la prende.
      -- Persona: avvisa lei. Senza avviso lo sblocco resta invisibile.
      IF _passo.ufficio_id IS NOT NULL THEN
        _titolo := 'Tocca al tuo ufficio: ' || _passo.title;
        FOR _dest IN
          SELECT m.profile_id FROM public.ufficio_membri m WHERE m.ufficio_id = _passo.ufficio_id
        LOOP
          INSERT INTO public.notifications
            (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
          VALUES (
            _passo.company_id, _dest.profile_id, 'task_sbloccata', _titolo,
            'Si è chiusa "' || NEW.title || '". Da fare entro il ' || to_char(_scadenza, 'DD/MM/YYYY') || '.',
            'task', _passo.id, _link
          );
        END LOOP;
      ELSIF _passo.assigned_to IS NOT NULL THEN
        INSERT INTO public.notifications
          (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
        VALUES (
          _passo.company_id, _passo.assigned_to, 'task_sbloccata',
          'Tocca a te: ' || _passo.title,
          'Si è chiusa "' || NEW.title || '". Da fare entro il ' || to_char(_scadenza, 'DD/MM/YYYY') || '.',
          'task', _passo.id, _link
        );
      END IF;
    END LOOP;

  -- Riapertura: tornano in attesa solo i passi ancora intonsi.
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
  RAISE LOG 'sblocca_task_a_catena error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Le tre porte da cui entra un incasso
-- ─────────────────────────────────────────────────────────────────────────────

-- 4a. Rata della commessa segnata incassata.
CREATE OR REPLACE FUNCTION public.fire_incasso_da_rata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_paid = true AND (TG_OP = 'INSERT' OR OLD.is_paid IS DISTINCT FROM true) THEN
    PERFORM public.chiudi_passi_su_evento('incasso_registrato', NEW.order_id, NULL);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Un intoppo del flusso non deve impedire di segnare incassata una rata.
  RAISE LOG 'fire_incasso_da_rata error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fire_incasso_da_rata ON public.order_installments;
CREATE TRIGGER trg_fire_incasso_da_rata
  AFTER INSERT OR UPDATE OF is_paid ON public.order_installments
  FOR EACH ROW EXECUTE FUNCTION public.fire_incasso_da_rata();

-- 4b. Pagamento registrato su una fattura collegata a una commessa.
CREATE OR REPLACE FUNCTION public.fire_incasso_da_pagamento_fattura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _order_id uuid;
BEGIN
  SELECT i.order_id INTO _order_id FROM public.invoices i WHERE i.id = NEW.invoice_id;
  IF _order_id IS NOT NULL THEN
    PERFORM public.chiudi_passi_su_evento('incasso_registrato', _order_id, NULL);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fire_incasso_da_pagamento_fattura error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fire_incasso_da_pagamento_fattura ON public.invoice_payments;
CREATE TRIGGER trg_fire_incasso_da_pagamento_fattura
  AFTER INSERT ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.fire_incasso_da_pagamento_fattura();

-- 4c. Intervento di assistenza saldato.
CREATE OR REPLACE FUNCTION public.fire_incasso_da_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.pagato = true AND OLD.pagato IS DISTINCT FROM true THEN
    PERFORM public.chiudi_passi_su_evento('incasso_registrato', NULL, NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fire_incasso_da_ticket error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fire_incasso_da_ticket ON public.tickets;
CREATE TRIGGER trg_fire_incasso_da_ticket
  AFTER UPDATE OF pagato ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.fire_incasso_da_ticket();
