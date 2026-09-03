-- ════════════════════════════════════════════════════════════════════════════
-- Uffici aziendali: un passo del flusso può andare a un reparto, non a una persona
-- ════════════════════════════════════════════════════════════════════════════
-- Finora un passo del flusso commessa si assegnava a UNA persona. Ma "la
-- fattura di acconto la fa l'amministrazione" non è una persona: è un ufficio
-- con tre amministrativi dentro, e se quella persona è in ferie o cambia
-- azienda il flusso si rompe in silenzio.
--
-- Qui nascono gli uffici (Amministrazione, Tecnico, Commerciale, Cantiere…),
-- con i loro membri e un responsabile. Un passo può andare a una persona
-- OPPURE a un ufficio: chi configura il flusso sceglie.
--
-- Cosa succede quando un passo di un ufficio si sblocca:
--   • l'attività prende `ufficio_id`;
--   • `assigned_to` va al responsabile dell'ufficio se c'è (così non resta
--     orfana — le attività senza assegnatario erano il grosso delle scadute);
--   • TUTTI i membri dell'ufficio ricevono l'avviso e vedono l'attività, così
--     chi è libero la prende in carico.
--
-- NB sulle policy: quelle di `tasks` sono restrittive (un dipendente vede solo
-- ciò che è assegnato a lui). Senza una policy dedicata, un'attività di ufficio
-- senza assegnatario sarebbe INVISIBILE proprio a chi deve farla. Le policy
-- permissive si sommano in OR, quindi qui si aggiunge visibilità, non se ne
-- toglie: e si aggiunge solo ai membri di quell'ufficio.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Gli uffici e chi ci sta dentro
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_uffici (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  descrizione     text,
  -- Chi risponde dell'ufficio: riceve in carico le attività dell'ufficio.
  responsabile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  colore          text,
  sort_order      integer NOT NULL DEFAULT 100,
  attivo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, nome)
);
CREATE INDEX IF NOT EXISTS idx_company_uffici_company
  ON public.company_uffici(company_id, sort_order);

CREATE TABLE IF NOT EXISTS public.ufficio_membri (
  ufficio_id uuid NOT NULL REFERENCES public.company_uffici(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Ridondante ma voluto: le policy filtrano per azienda senza dover risalire
  -- all'ufficio a ogni riga.
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ufficio_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_ufficio_membri_profilo
  ON public.ufficio_membri(profile_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. "Questo utente è in questo ufficio?" — SECURITY DEFINER perché serve
--    dentro le policy di `tasks` senza innescare ricorsione di RLS.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.utente_in_ufficio(_user uuid, _ufficio uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ufficio_membri m
     WHERE m.profile_id = _user
       AND m.ufficio_id = _ufficio
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Policy sugli uffici
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.company_uffici  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ufficio_membri  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membri azienda leggono gli uffici" ON public.company_uffici;
CREATE POLICY "Membri azienda leggono gli uffici"
  ON public.company_uffici FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id((SELECT auth.uid())));

-- Gli uffici sono struttura aziendale, non una preferenza personale: li cambia
-- solo chi amministra.
DROP POLICY IF EXISTS "Admin azienda gestiscono gli uffici" ON public.company_uffici;
CREATE POLICY "Admin azienda gestiscono gli uffici"
  ON public.company_uffici FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id((SELECT auth.uid()))
    AND (public.has_role((SELECT auth.uid()), 'company_admin'::app_role)
      OR public.has_role((SELECT auth.uid()), 'super_admin'::app_role))
  )
  WITH CHECK (
    company_id = public.get_user_company_id((SELECT auth.uid()))
    AND (public.has_role((SELECT auth.uid()), 'company_admin'::app_role)
      OR public.has_role((SELECT auth.uid()), 'super_admin'::app_role))
  );

DROP POLICY IF EXISTS "Membri azienda leggono le appartenenze" ON public.ufficio_membri;
CREATE POLICY "Membri azienda leggono le appartenenze"
  ON public.ufficio_membri FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admin azienda gestiscono le appartenenze" ON public.ufficio_membri;
CREATE POLICY "Admin azienda gestiscono le appartenenze"
  ON public.ufficio_membri FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id((SELECT auth.uid()))
    AND (public.has_role((SELECT auth.uid()), 'company_admin'::app_role)
      OR public.has_role((SELECT auth.uid()), 'super_admin'::app_role))
  )
  WITH CHECK (
    company_id = public.get_user_company_id((SELECT auth.uid()))
    AND (public.has_role((SELECT auth.uid()), 'company_admin'::app_role)
      OR public.has_role((SELECT auth.uid()), 'super_admin'::app_role))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Il flusso e le attività sanno di uffici
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.order_task_template
  ADD COLUMN IF NOT EXISTS assegna_a_ufficio_id uuid REFERENCES public.company_uffici(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.order_task_template.assegna_a_ufficio_id IS
  'Ufficio che riceve il passo. Alternativo ad assegna_a_utente: se valorizzato vince lui.';

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS ufficio_id uuid REFERENCES public.company_uffici(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tasks.ufficio_id IS
  'Ufficio in carico. assigned_to resta la persona che ci mette le mani (di norma il responsabile), ma tutti i membri vedono e possono prendere l''attività.';

CREATE INDEX IF NOT EXISTS idx_tasks_ufficio
  ON public.tasks(ufficio_id) WHERE ufficio_id IS NOT NULL;

-- Senza queste due, un'attività di ufficio senza assegnatario sarebbe invisibile
-- proprio a chi deve farla (le policy di tasks guardano assigned_to).
DROP POLICY IF EXISTS "Membri ufficio vedono le attivita del loro ufficio" ON public.tasks;
CREATE POLICY "Membri ufficio vedono le attivita del loro ufficio"
  ON public.tasks FOR SELECT TO authenticated
  USING (ufficio_id IS NOT NULL AND public.utente_in_ufficio((SELECT auth.uid()), ufficio_id));

DROP POLICY IF EXISTS "Membri ufficio aggiornano le attivita del loro ufficio" ON public.tasks;
CREATE POLICY "Membri ufficio aggiornano le attivita del loro ufficio"
  ON public.tasks FOR UPDATE TO authenticated
  USING (ufficio_id IS NOT NULL AND public.utente_in_ufficio((SELECT auth.uid()), ufficio_id))
  WITH CHECK (ufficio_id IS NOT NULL AND public.utente_in_ufficio((SELECT auth.uid()), ufficio_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Lo sblocco avvisa l'ufficio, non una persona sola
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
        WHEN _passo.order_id IS NOT NULL THEN '/azienda/ordini/' || _passo.order_id::text
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
