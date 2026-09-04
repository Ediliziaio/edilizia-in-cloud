-- Ondata 2.2 — i costi di un intervento arrivano al margine di commessa
--
-- I ticket registrano già tre costi: materiali (`costo_materiale`), trasferta
-- (`costo_trasferta`) e manodopera (`ore_effettive` × `costo_orario_applicato`,
-- con `durata_ore` come ripiego quando le ore effettive non sono state
-- inserite). Nessuno di questi arrivava da nessuna parte.
--
-- Verificato: nessuna funzione del database scrive in company_costs partendo da
-- un ticket. Le due che citano entrambe le tabelle — get_dashboard_kpis e
-- get_cruscotto_stats — le leggono soltanto.
--
-- Perché finisce nel margine: v_ordine_marginalita calcola il consuntivo come
--     acquisti + errori + manodopera + provvigioni + costo_diretto
-- dove `costo_diretto` è la somma di company_costs con `order_id` valorizzato e
-- `purchase_order_id` nullo. Basta quindi che il costo dell'intervento diventi
-- una riga di company_costs legata alla commessa: entra nel margine da solo,
-- senza toccare la vista.
--
-- Un intervento da 400 € fa scendere il margine di 400 €.
--
-- ── Perché una colonna ticket_id e non solo una nota ───────────────────────
-- Senza un riferimento non c'è modo di sapere se il costo di quel ticket è già
-- stato registrato: alla seconda modifica del ticket ne nascerebbe un secondo,
-- e il margine crollerebbe due volte per lo stesso intervento. Con ticket_id e
-- un indice unico, la riga è una sola e si aggiorna.
--
-- Idempotente.

ALTER TABLE public.company_costs
  ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.company_costs.ticket_id IS
  'Ticket da cui il costo è stato generato. Serve a tenerne una sola riga: '
  'senza, ogni modifica del ticket creerebbe un costo in più.';

-- Un solo costo per ticket. Parziale, così le righe non generate da un ticket
-- non occupano spazio nell''indice.
CREATE UNIQUE INDEX IF NOT EXISTS ux_company_costs_ticket
  ON public.company_costs (ticket_id) WHERE ticket_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_costs_order
  ON public.company_costs (order_id) WHERE order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sincronizza_costo_da_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ore    numeric;
  v_totale numeric;
  v_nome   text;
BEGIN
  -- Le ore effettive se ci sono, altrimenti quelle preventivate: un intervento
  -- chiuso senza consuntivo ore non deve valere zero manodopera.
  v_ore := coalesce(NEW.ore_effettive, NEW.durata_ore, 0);

  v_totale := round(
      coalesce(NEW.costo_materiale, 0)
    + coalesce(NEW.costo_trasferta, 0)
    + v_ore * coalesce(NEW.costo_orario_applicato, 0)
  , 2);

  -- Nessuna commessa a cui imputarlo, o costo nullo: la riga non deve esistere.
  -- Vale anche quando un ticket viene staccato dalla commessa o azzerato: il
  -- costo va tolto dal margine, non lasciato lì.
  IF NEW.order_id IS NULL OR v_totale <= 0 THEN
    DELETE FROM public.company_costs WHERE ticket_id = NEW.id;
    RETURN NEW;
  END IF;

  v_nome := 'Intervento: ' || coalesce(nullif(btrim(NEW.subject), ''), NEW.id::text);

  INSERT INTO public.company_costs (
    company_id, order_id, ticket_id, name, cost_type, amount,
    recurrence, due_date, is_paid, category, notes
  ) VALUES (
    NEW.company_id, NEW.order_id, NEW.id, v_nome, 'variable', v_totale,
    'once', coalesce(NEW.created_at::date, CURRENT_DATE), false, 'manutenzione',
    format('Generato dal ticket %s — materiali %s, trasferta %s, manodopera %s h × %s',
           NEW.id, coalesce(NEW.costo_materiale,0), coalesce(NEW.costo_trasferta,0),
           v_ore, coalesce(NEW.costo_orario_applicato,0))
  )
  ON CONFLICT (ticket_id) WHERE ticket_id IS NOT NULL DO UPDATE SET
    order_id   = EXCLUDED.order_id,
    company_id = EXCLUDED.company_id,
    name       = EXCLUDED.name,
    amount     = EXCLUDED.amount,
    notes      = EXCLUDED.notes,
    updated_at = now();

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_costo_da_ticket ON public.tickets;
CREATE TRIGGER trg_costo_da_ticket
  AFTER INSERT OR UPDATE OF order_id, costo_materiale, costo_trasferta,
                            costo_orario_applicato, ore_effettive, durata_ore, subject
  ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.sincronizza_costo_da_ticket();

-- Lo storico: i ticket che hanno già costi e una commessa entrano subito nel
-- margine, senza aspettare la prossima modifica.
INSERT INTO public.company_costs (
  company_id, order_id, ticket_id, name, cost_type, amount,
  recurrence, due_date, is_paid, category, notes
)
SELECT t.company_id, t.order_id, t.id,
       'Intervento: ' || coalesce(nullif(btrim(t.subject), ''), t.id::text),
       'variable',
       round(coalesce(t.costo_materiale,0) + coalesce(t.costo_trasferta,0)
             + coalesce(t.ore_effettive, t.durata_ore, 0) * coalesce(t.costo_orario_applicato,0), 2),
       'once', coalesce(t.created_at::date, CURRENT_DATE), false, 'manutenzione',
       'Recupero storico dal ticket ' || t.id
FROM public.tickets t
WHERE t.order_id IS NOT NULL
  AND round(coalesce(t.costo_materiale,0) + coalesce(t.costo_trasferta,0)
            + coalesce(t.ore_effettive, t.durata_ore, 0) * coalesce(t.costo_orario_applicato,0), 2) > 0
ON CONFLICT (ticket_id) WHERE ticket_id IS NOT NULL DO NOTHING;
