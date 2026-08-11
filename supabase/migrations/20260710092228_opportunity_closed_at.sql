-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Vinta/Persa senza data di chiusura: i report contavano il vinto per periodo
-- con updated_at come proxy → qualsiasi edit successivo (nota, tag, blur)
-- "spostava" la vittoria nel mese corrente. Colonne dedicate + trigger DB:
-- copre TUTTI i percorsi di scrittura (dialog, drag kanban, bulk, automazioni).
ALTER TABLE public.marketing_opportunities
  ADD COLUMN IF NOT EXISTS won_at timestamptz,
  ADD COLUMN IF NOT EXISTS lost_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_opportunity_closed_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'won' THEN NEW.won_at := COALESCE(NEW.won_at, now()); END IF;
    IF NEW.status = 'lost' THEN NEW.lost_at := COALESCE(NEW.lost_at, now()); END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'won' AND OLD.status IS DISTINCT FROM 'won' THEN
    NEW.won_at := now();
  ELSIF NEW.status = 'lost' AND OLD.status IS DISTINCT FROM 'lost' THEN
    NEW.lost_at := now();
  ELSIF NEW.status = 'open' AND OLD.status IN ('won','lost') THEN
    -- riaperta: la chiusura non vale più
    NEW.won_at := NULL;
    NEW.lost_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunity_closed_at ON public.marketing_opportunities;
CREATE TRIGGER trg_opportunity_closed_at
  BEFORE INSERT OR UPDATE OF status ON public.marketing_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_opportunity_closed_at();

-- Backfill: per le già chiuse il miglior proxy disponibile resta updated_at.
UPDATE public.marketing_opportunities SET won_at = updated_at WHERE status = 'won' AND won_at IS NULL;
UPDATE public.marketing_opportunities SET lost_at = updated_at WHERE status = 'lost' AND lost_at IS NULL;
