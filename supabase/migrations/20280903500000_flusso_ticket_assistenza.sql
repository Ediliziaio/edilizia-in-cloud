-- ════════════════════════════════════════════════════════════════════════════
-- Flusso di lavoro anche per i ticket di assistenza
-- ════════════════════════════════════════════════════════════════════════════
-- Il motore della catena è già generico: le attività hanno sia `order_id` sia
-- `ticket_id`, e `sblocca_task_a_catena` non guarda a cosa sono attaccate.
-- Mancava solo il template: `order_task_template` sapeva parlare solo di
-- commesse.
--
-- Si aggiunge `ambito` invece di creare una seconda tabella gemella: il flusso
-- è lo stesso concetto (passi, dipendenze, assegnatario, giorni), cambia solo
-- a cosa si applica. Una tabella sola vuol dire un editor solo e un motore
-- solo — due tabelle avrebbero voluto dire due di tutto, e la seconda copia
-- sarebbe rimasta indietro alla prima modifica.
--
-- Per i ticket la colonna `vertical` porta la CATEGORIA del ticket
-- (`tickets.category`), come per le commesse porta il mestiere: così
-- un'assistenza in garanzia può avere un percorso diverso da una a pagamento.
-- NULL = flusso valido per tutte le categorie.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.order_task_template
  ADD COLUMN IF NOT EXISTS ambito text NOT NULL DEFAULT 'commessa';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_task_template_ambito_check'
  ) THEN
    ALTER TABLE public.order_task_template
      ADD CONSTRAINT order_task_template_ambito_check
      CHECK (ambito IN ('commessa', 'ticket'));
  END IF;
END $$;

COMMENT ON COLUMN public.order_task_template.ambito IS
  'A cosa si applica il flusso: commessa oppure ticket di assistenza. Le righe storiche restano commessa.';
COMMENT ON COLUMN public.order_task_template.vertical IS
  'ambito=commessa → mestiere (serramentista, fotovoltaico…). ambito=ticket → categoria del ticket. NULL = vale per tutti.';

-- L'indice serve alle due letture reali: "dammi il flusso di questo ambito per
-- questa azienda", fatta a ogni applicazione e a ogni apertura dell'editor.
CREATE INDEX IF NOT EXISTS idx_order_task_template_ambito
  ON public.order_task_template(company_id, ambito, sort_order);

-- Interruttore separato da quello delle commesse: chi vuole il flusso
-- automatico sulle commesse non vuole per forza anche quello sui ticket.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ticket_playbook_auto_apply boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.ticket_playbook_auto_apply IS
  'Se true, ogni nuovo ticket di assistenza parte già col flusso di lavoro applicato.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Lo sblocco porta al ticket, non alla lista attività
-- ─────────────────────────────────────────────────────────────────────────────
-- Prima un passo di ticket mandava su /azienda/attivita: chi riceveva l'avviso
-- doveva poi ricercarsi a mano il ticket di cui si stava parlando.
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
