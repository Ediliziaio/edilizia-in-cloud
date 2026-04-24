-- =============================================================================
-- Assistenza phase integration + fix bug CRITICO in salvataggio stati ordine
-- =============================================================================
--
-- CONTENUTO
--
-- 1. Nuova colonna `order_statuses.is_support_phase` — identifica LO stato
--    "Assistenza" (fase post-consegna) in maniera stabile anche se il nome
--    viene cambiato. Vincolo: al massimo uno per azienda.
--
-- 2. Back-fill: per ogni azienda senza fase Assistenza, la crea in coda.
--    Promuove a fase support anche stati già chiamati "Assistenza".
--
-- 3. Trigger companies AFTER INSERT → garantisce Assistenza alle aziende nuove
--    create via SQL diretto (le create via create-company edge function
--    saranno coperte dalla logica app-side).
--
-- 4. Trigger tickets AFTER INSERT → se `order_id` valorizzato e l'ordine NON è
--    già in fase Assistenza, sposta l'ordine in Assistenza e logga
--    order_status_history. Integrazione richiesta: "apro ticket → ordine
--    finisce in Assistenza".
--
-- 5. RPC `save_order_statuses(p_company_id, p_statuses jsonb)` — sostituisce
--    la logica frontend DELETE-ALL + INSERT-ALL che è CATASTROFICA:
--    - order_status_history.status_id ha ON DELETE CASCADE → CANCELLA LO
--      STORICO DI TUTTI GLI ORDINI ad ogni click di "Salva"
--    - orders.current_status_id ha ON DELETE SET NULL → tutti gli ordini
--      perdono lo stato ad ogni save
--    La nuova RPC fa UPSERT preservando gli UUID: UPDATE per quelli esistenti,
--    INSERT per i nuovi (id temp-*), DELETE solo per quelli rimossi
--    DAVVERO e che non sono in uso. Protegge la fase Assistenza da
--    cancellazione accidentale.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Colonna is_support_phase
-- -----------------------------------------------------------------------------
ALTER TABLE public.order_statuses
  ADD COLUMN IF NOT EXISTS is_support_phase BOOLEAN NOT NULL DEFAULT FALSE;

-- Un solo stato "Assistenza" per azienda (unique partial index)
CREATE UNIQUE INDEX IF NOT EXISTS order_statuses_one_support_phase_per_company
  ON public.order_statuses (company_id)
  WHERE is_support_phase = TRUE;

COMMENT ON COLUMN public.order_statuses.is_support_phase IS
  'Marca lo stato come "fase Assistenza": quando un ticket viene aperto per un ordine, l''ordine viene spostato automaticamente qui. Max 1 per azienda.';

-- -----------------------------------------------------------------------------
-- 2. Back-fill per aziende esistenti
-- -----------------------------------------------------------------------------

-- Promuovi stati già chiamati "Assistenza" (case insensitive) a fase support
UPDATE public.order_statuses os
SET is_support_phase = TRUE
WHERE lower(trim(os.name)) = 'assistenza'
  AND os.is_support_phase = FALSE
  AND NOT EXISTS (
    SELECT 1 FROM public.order_statuses os2
    WHERE os2.company_id = os.company_id
      AND os2.is_support_phase = TRUE
      AND os2.id <> os.id
  );

-- Crea "Assistenza" per ogni azienda che ancora non ce l'ha
INSERT INTO public.order_statuses
  (company_id, name, icon, color, position, is_default, is_support_phase)
SELECT
  c.id,
  'Assistenza',
  'LifeBuoy',
  '#F59E0B',
  COALESCE(
    (SELECT MAX(position) + 1 FROM public.order_statuses os WHERE os.company_id = c.id),
    0
  ),
  FALSE,
  TRUE
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.order_statuses os
  WHERE os.company_id = c.id AND os.is_support_phase = TRUE
);

-- -----------------------------------------------------------------------------
-- 3. Trigger companies → auto-provisioning Assistenza
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_assistenza_status_on_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.order_statuses
    WHERE company_id = NEW.id AND is_support_phase = TRUE
  ) THEN
    INSERT INTO public.order_statuses
      (company_id, name, icon, color, position, is_default, is_support_phase)
    VALUES
      (NEW.id,
       'Assistenza',
       'LifeBuoy',
       '#F59E0B',
       COALESCE((SELECT MAX(position)+1 FROM public.order_statuses WHERE company_id = NEW.id), 0),
       FALSE,
       TRUE);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_assistenza_status ON public.companies;
CREATE TRIGGER trg_ensure_assistenza_status
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.ensure_assistenza_status_on_company();

-- Nota: il trigger gira in SECURITY DEFINER quindi bypassa RLS. Necessario
-- perché l'INSERT su companies può essere fatto da edge function con service
-- role (che bypassa già RLS) o da super_admin.

-- -----------------------------------------------------------------------------
-- 4. Trigger tickets INSERT → sposta ordine in Assistenza
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auto_move_order_to_assistenza()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_support_status_id UUID;
  v_current_status_id UUID;
  v_order_company_id UUID;
  v_changed_by UUID;
BEGIN
  -- Nessun ordine collegato → niente da fare
  IF NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Carica company + stato corrente dell'ordine
  SELECT company_id, current_status_id
    INTO v_order_company_id, v_current_status_id
  FROM public.orders
  WHERE id = NEW.order_id;

  IF v_order_company_id IS NULL THEN
    -- Ordine non trovato (edge case: order_id punta a riga cancellata)
    RETURN NEW;
  END IF;

  -- Trova la fase Assistenza per questa azienda
  SELECT id INTO v_support_status_id
  FROM public.order_statuses
  WHERE company_id = v_order_company_id
    AND is_support_phase = TRUE
  LIMIT 1;

  IF v_support_status_id IS NULL THEN
    -- Azienda senza fase Assistenza configurata → non bloccare creazione ticket
    RAISE NOTICE 'Company % has no is_support_phase status, ticket % will not move order %',
      v_order_company_id, NEW.id, NEW.order_id;
    RETURN NEW;
  END IF;

  -- Già in Assistenza → idempotente
  IF v_current_status_id IS NOT DISTINCT FROM v_support_status_id THEN
    RETURN NEW;
  END IF;

  -- changed_by: usa auth.uid() se presente, altrimenti created_by del ticket,
  -- altrimenti customer_id. Tutti e 3 sono FK ad auth.users quindi validi per
  -- order_status_history.changed_by (NOT NULL FK).
  v_changed_by := COALESCE(auth.uid(), NEW.created_by, NEW.customer_id, NEW.assigned_to);

  -- Se ancora NULL (edge case estremo) non logghiamo history — ma spostiamo
  -- comunque l'ordine. History ha NOT NULL su changed_by quindi skippiamo.
  UPDATE public.orders
  SET current_status_id = v_support_status_id,
      updated_at = now()
  WHERE id = NEW.order_id;

  IF v_changed_by IS NOT NULL THEN
    INSERT INTO public.order_status_history
      (order_id, status_id, changed_by, changed_at)
    VALUES (NEW.order_id, v_support_status_id, v_changed_by, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_move_order_to_assistenza ON public.tickets;
CREATE TRIGGER trg_ticket_move_order_to_assistenza
  AFTER INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.auto_move_order_to_assistenza();

-- -----------------------------------------------------------------------------
-- 5. RPC save_order_statuses — salvataggio atomico non distruttivo
-- -----------------------------------------------------------------------------
--
-- Input: p_statuses jsonb array di oggetti
--   [{ id?: uuid, name, icon, color, position, is_support_phase? }, ...]
-- - id presente e UUID valido → UPDATE
-- - id mancante, NULL o "temp-*" → INSERT (nuovo)
-- - stati presenti in DB ma NON nel payload → DELETE (se non in uso)
--
-- Protezioni:
-- - is_support_phase = TRUE non può essere rimosso dal payload (restituisce errore)
-- - is_default = TRUE viene ricalcolato (primo position)
-- - se DELETE fallisce per FK (stato in uso), trasforma in errore leggibile
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_order_statuses(
  p_company_id UUID,
  p_statuses JSONB
)
RETURNS TABLE (
  "id" UUID,
  "company_id" UUID,
  "name" TEXT,
  "icon" TEXT,
  "color" TEXT,
  "position" INTEGER,
  "is_default" BOOLEAN,
  "is_support_phase" BOOLEAN,
  "created_at" TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_is_super_admin BOOLEAN;
  v_user_company_id UUID;
  v_existing_support_id UUID;
  v_payload_support_present BOOLEAN;
  v_incoming_ids UUID[];
  v_orphan_status_id UUID;
  v_orphan_name TEXT;
  v_in_use INTEGER;
BEGIN
  -- Autorizzazione: super_admin OR company_admin della stessa company
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_user_id AND ur.role = 'super_admin'
  ) INTO v_is_super_admin;

  IF NOT v_is_super_admin THEN
    SELECT p.company_id INTO v_user_company_id
    FROM public.profiles p WHERE p.id = v_user_id;

    IF v_user_company_id IS DISTINCT FROM p_company_id THEN
      RAISE EXCEPTION 'forbidden: cannot modify statuses of other company';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_user_id AND ur.role = 'company_admin'
    ) THEN
      RAISE EXCEPTION 'forbidden: only company_admin can modify order statuses';
    END IF;
  END IF;

  -- Validazione payload
  IF p_statuses IS NULL OR jsonb_typeof(p_statuses) <> 'array' THEN
    RAISE EXCEPTION 'invalid_payload: p_statuses must be a JSON array';
  END IF;

  IF jsonb_array_length(p_statuses) < 2 THEN
    RAISE EXCEPTION 'invalid_payload: almeno 2 stati richiesti';
  END IF;

  -- La fase Assistenza non può essere rimossa se già esiste
  SELECT id INTO v_existing_support_id
  FROM public.order_statuses
  WHERE company_id = p_company_id AND is_support_phase = TRUE
  LIMIT 1;

  IF v_existing_support_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_statuses) AS elem
      WHERE (elem->>'id')::uuid IS NOT DISTINCT FROM v_existing_support_id
         OR COALESCE((elem->>'is_support_phase')::boolean, FALSE) = TRUE
    ) INTO v_payload_support_present;

    IF NOT v_payload_support_present THEN
      RAISE EXCEPTION 'support_phase_required: la fase Assistenza non può essere rimossa';
    END IF;
  END IF;

  -- Step 1: UPSERT stati dal payload
  WITH incoming AS (
    SELECT
      CASE
        WHEN elem->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (elem->>'id')::uuid
        ELSE NULL
      END AS row_id,
      COALESCE(NULLIF(trim(elem->>'name'), ''), 'Stato') AS row_name,
      COALESCE(NULLIF(elem->>'icon', ''), 'Circle') AS row_icon,
      COALESCE(NULLIF(elem->>'color', ''), '#2563EB') AS row_color,
      COALESCE((elem->>'position')::integer, ord::integer - 1) AS row_position,
      COALESCE((elem->>'is_support_phase')::boolean, FALSE) AS row_support,
      (ord = 1) AS row_is_default
    FROM jsonb_array_elements(p_statuses) WITH ORDINALITY AS arr(elem, ord)
  ),
  upserted_existing AS (
    UPDATE public.order_statuses os
    SET name = i.row_name,
        icon = i.row_icon,
        color = i.row_color,
        position = i.row_position,
        is_default = i.row_is_default,
        -- is_support_phase: se c'era già TRUE lo manteniamo; non lo togliamo mai qui
        is_support_phase = (os.is_support_phase OR i.row_support)
    FROM incoming i
    WHERE os.id = i.row_id AND os.company_id = p_company_id
    RETURNING os.id
  ),
  inserted_new AS (
    INSERT INTO public.order_statuses
      (company_id, name, icon, color, position, is_default, is_support_phase)
    SELECT
      p_company_id, i.row_name, i.row_icon, i.row_color,
      i.row_position, i.row_is_default, i.row_support
    FROM incoming i
    WHERE i.row_id IS NULL
    RETURNING id
  )
  SELECT array_agg(aid) INTO v_incoming_ids
  FROM (
    SELECT id AS aid FROM upserted_existing
    UNION ALL
    SELECT id FROM inserted_new
  ) t;

  -- Step 2: DELETE solo gli stati rimossi dal payload (verificando non siano in uso)
  FOR v_orphan_status_id, v_orphan_name IN
    SELECT os.id, os.name
    FROM public.order_statuses os
    WHERE os.company_id = p_company_id
      AND os.id <> ALL(COALESCE(v_incoming_ids, ARRAY[]::uuid[]))
      AND os.is_support_phase = FALSE  -- doppia protezione
  LOOP
    SELECT COUNT(*) INTO v_in_use
    FROM public.orders o
    WHERE o.current_status_id = v_orphan_status_id;

    IF v_in_use > 0 THEN
      RAISE EXCEPTION 'status_in_use: lo stato "%" è associato a % ordine/i e non può essere eliminato',
        v_orphan_name, v_in_use;
    END IF;

    -- Sicuro eliminare: nessun ordine collegato. History CASCADE via FK se
    -- ci sono righe residue (accettabile: lo stato è stato rimosso
    -- intenzionalmente e non è referenziato da nessun ordine attivo).
    DELETE FROM public.order_statuses WHERE id = v_orphan_status_id;
  END LOOP;

  -- Step 3: restituisci lista aggiornata
  RETURN QUERY
    SELECT os.id, os.company_id, os.name, os.icon, os.color,
           os.position, os.is_default, os.is_support_phase, os.created_at
    FROM public.order_statuses os
    WHERE os.company_id = p_company_id
    ORDER BY os.position;
END;
$$;

COMMENT ON FUNCTION public.save_order_statuses IS
  'Salvataggio atomico non distruttivo degli stati ordine. Sostituisce la logica DELETE-ALL + INSERT-ALL che cancellava storico e nullificava current_status_id di tutti gli ordini ad ogni save. Protegge la fase Assistenza e rifiuta eliminazioni di stati in uso.';

GRANT EXECUTE ON FUNCTION public.save_order_statuses(UUID, JSONB) TO authenticated;

COMMIT;
