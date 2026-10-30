-- Costi della commessa senza fattura (richiesta Dimora Torino, vale per tutti).
--
-- La tassa del Comune, una marca da bollo, un F24 legato al cantiere: sono costi
-- veri della commessa ma nessuno manderà mai una fattura. Si registravano già in
-- company_costs (order_id → costo_diretto in v_ordine_marginalita), ma solo da
-- Economia → Costi e senza poter allegare la ricevuta. Qui:
--   · allegato_path / allegato_nome: la ricevuta o l'F24 (bucket order-attachments,
--     percorso orders/<commessa>/costi/…, già coperto dalle policy del bucket);
--   · senza_fattura: il costo non aspetta una fattura — dice a chi controlla che
--     non manca niente;
--   · order_work_phase_id: la fase della commessa a cui il costo appartiene,
--     facoltativa. Deve essere della stessa commessa.
-- Il margine non cambia regola: il costo entra come prima, con l'imponibile.

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.company_costs
  ADD COLUMN IF NOT EXISTS allegato_path text,
  ADD COLUMN IF NOT EXISTS allegato_nome text,
  ADD COLUMN IF NOT EXISTS senza_fattura boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS order_work_phase_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_costs_order_work_phase_id_fkey') THEN
    ALTER TABLE public.company_costs
      ADD CONSTRAINT company_costs_order_work_phase_id_fkey
      FOREIGN KEY (order_work_phase_id) REFERENCES public.order_work_phases(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS company_costs_order_work_phase_id_idx
  ON public.company_costs (order_work_phase_id) WHERE order_work_phase_id IS NOT NULL;

COMMENT ON COLUMN public.company_costs.allegato_path IS
  'Ricevuta o F24 del costo, nel bucket order-attachments (orders/<commessa>/costi/...).';
COMMENT ON COLUMN public.company_costs.senza_fattura IS
  'Costo che non avrà fattura (tasse comunali, bolli, F24): non si aspetta un documento del fornitore.';
COMMENT ON COLUMN public.company_costs.order_work_phase_id IS
  'Fase della commessa a cui appartiene il costo (facoltativa, della stessa commessa).';

-- La fase deve essere della commessa del costo: altrimenti si potrebbe agganciare
-- il costo alla fase di un'altra commessa (o di un'altra azienda).
CREATE OR REPLACE FUNCTION public.costo_fase_della_commessa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.order_work_phase_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.order_work_phases f
     WHERE f.id = NEW.order_work_phase_id
       AND f.order_id = NEW.order_id
       AND (f.company_id IS NULL OR f.company_id = NEW.company_id)
  ) THEN
    RAISE EXCEPTION 'La fase scelta non è di questa commessa.' USING errcode = '23514';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.costo_fase_della_commessa() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS costo_fase_della_commessa ON public.company_costs;
CREATE TRIGGER costo_fase_della_commessa
  BEFORE INSERT OR UPDATE OF order_work_phase_id, order_id ON public.company_costs
  FOR EACH ROW EXECUTE FUNCTION public.costo_fase_della_commessa();
