-- Assistenza (richiesta Ke Bei Serramenti, 07/09/2026):
--  1. «quante volte il cliente ha richiamato per la stessa assistenza» — non
--     esisteva alcun modo di segnarlo: si perdeva nelle note libere.
--  2. «merce arrivata incompleta»: oggi l'arrivo parziale esiste SOLO sull'ordine
--     a fornitore collegato al ticket (purchase_orders), che però molte aziende
--     non usano — Ke Bei ha 0 ordini e 0 bolle. Serve lo stato della merce sul
--     ticket stesso, con il dettaglio di che cosa manca.
-- Applicata sul live via Management API (lock_timeout breve) e poi
-- `supabase migration repair --status applied 20280911000002 --linked`.

-- ── Richiami del cliente ─────────────────────────────────────────────────────
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS richiami_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_richiamo_at timestamptz,
  ADD COLUMN IF NOT EXISTS note_richiami text;

COMMENT ON COLUMN public.tickets.richiami_count IS
  'Quante volte il cliente ha ricontattato per QUESTO intervento (solleciti).';
COMMENT ON COLUMN public.tickets.ultimo_richiamo_at IS
  'Data dell''ultimo sollecito del cliente.';

-- ── Stato della merce sul ticket ─────────────────────────────────────────────
-- null = nessuna merce necessaria. Gli altri valori raccontano il ciclo:
-- da_ordinare → ordinata → arrivata_parziale (con merce_mancante) → arrivata.
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS merce_stato text,
  ADD COLUMN IF NOT EXISTS merce_mancante text,
  ADD COLUMN IF NOT EXISTS merce_arrivata_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tickets_merce_stato_valido'
  ) THEN
    ALTER TABLE public.tickets
      ADD CONSTRAINT tickets_merce_stato_valido
      CHECK (merce_stato IS NULL OR merce_stato IN
        ('da_ordinare', 'ordinata', 'arrivata_parziale', 'arrivata'));
  END IF;
END $$;

COMMENT ON COLUMN public.tickets.merce_stato IS
  'Ciclo merce sul ticket: da_ordinare | ordinata | arrivata_parziale | arrivata. NULL = non serve merce.';
COMMENT ON COLUMN public.tickets.merce_mancante IS
  'Che cosa manca quando la merce è arrivata solo in parte (bolla incompleta).';

-- Indice per i filtri della lista assistenza (merce da arrivare / arrivata).
CREATE INDEX IF NOT EXISTS idx_tickets_company_merce_stato
  ON public.tickets (company_id, merce_stato)
  WHERE merce_stato IS NOT NULL;

-- ── Coerenza automatica ──────────────────────────────────────────────────────
-- Tiene allineato il vecchio flag booleano `merce_richiesta` (usato altrove)
-- e marca la data di arrivo quando la merce risulta completa.
CREATE OR REPLACE FUNCTION public.trg_fn_ticket_merce_coerenza()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.merce_richiesta := NEW.merce_stato IS NOT NULL;

  IF NEW.merce_stato = 'arrivata' AND NEW.merce_arrivata_at IS NULL THEN
    NEW.merce_arrivata_at := now();
  END IF;
  IF NEW.merce_stato IS DISTINCT FROM 'arrivata' THEN
    NEW.merce_arrivata_at := NULL;
  END IF;

  -- Se la merce non è più parziale, il dettaglio di cosa manca non ha più senso.
  IF NEW.merce_stato IS DISTINCT FROM 'arrivata_parziale' THEN
    NEW.merce_mancante := NULL;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_ticket_merce_coerenza ON public.tickets;
CREATE TRIGGER trg_ticket_merce_coerenza
  BEFORE INSERT OR UPDATE OF merce_stato, merce_mancante ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_ticket_merce_coerenza();

-- ── Segnare un richiamo in modo atomico ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ticket_segna_richiamo(
  p_ticket_id uuid, p_nota text DEFAULT NULL
) RETURNS TABLE (richiami_count integer, ultimo_richiamo_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.tickets t
     SET richiami_count = t.richiami_count + 1,
         ultimo_richiamo_at = now(),
         note_richiami = CASE
           WHEN p_nota IS NULL OR btrim(p_nota) = '' THEN t.note_richiami
           ELSE coalesce(t.note_richiami || E'\n', '')
                || to_char(now() AT TIME ZONE 'Europe/Rome', 'DD/MM/YYYY HH24:MI') || ' — ' || btrim(p_nota)
         END
   WHERE t.id = p_ticket_id
  RETURNING t.richiami_count, t.ultimo_richiamo_at;
END
$$;
