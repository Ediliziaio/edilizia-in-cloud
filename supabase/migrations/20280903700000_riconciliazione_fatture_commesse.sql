-- ════════════════════════════════════════════════════════════════════════════
-- Riconciliazione fatture ↔ commesse ↔ importi
-- ════════════════════════════════════════════════════════════════════════════
-- Chi fattura da un gestionale esterno (Fatture in Cloud, Aruba, il
-- commercialista) non scrive il codice commessa dentro la fattura. Oggi
-- l'import prova SOLO quella strada — "se il codice compare nel testo" — e in
-- produzione ha agganciato ZERO fatture su 201 importate: tutte le fatture che
-- hanno una commessa sono quelle nate dentro EiC.
--
-- Qui si aggiunge quello che mancava per ricucire:
--   • `invoices.order_match_origine` — PERCHÉ una fattura è attaccata a una
--     commessa (codice, cliente, importo, a mano). Senza, fra sei mesi nessuno
--     sa più se quel collegamento è stato deciso da una persona o indovinato da
--     un automatismo, e non c'è modo di rivedere gli errori.
--   • `order_installments.invoice_id` — QUALE fattura copre quella rata. È il
--     pezzo che lega gli IMPORTI, non solo i documenti.
--
-- E si chiude il cerchio con l'incasso: quando la fattura agganciata a una rata
-- risulta pagata, la rata diventa incassata da sola. Da lì in poi vale quanto
-- già costruito — `chiudi_passi_su_evento` chiude il passo "attendi incasso" e
-- il flusso di lavoro riparte verso l'ufficio successivo.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS order_match_origine text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_order_match_origine_check') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_order_match_origine_check
      CHECK (order_match_origine IS NULL OR order_match_origine IN
        ('codice', 'cliente', 'importo', 'manuale', 'interna'));
  END IF;
END $$;

COMMENT ON COLUMN public.invoices.order_match_origine IS
  'Perché questa fattura è legata alla commessa: codice scritto in fattura, cliente, importo di una rata, scelta manuale, oppure interna (nata in EiC).';

ALTER TABLE public.order_installments
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.order_installments.invoice_id IS
  'Fattura che copre questa rata. Quando la fattura risulta pagata, la rata diventa incassata da sola.';

-- Una fattura copre al massimo una rata: senza questo vincolo lo stesso
-- documento potrebbe risultare incassato due volte su rate diverse, e il
-- cruscotto della commessa direbbe di aver preso il doppio dei soldi.
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_installments_invoice
  ON public.order_installments(invoice_id) WHERE invoice_id IS NOT NULL;

-- Le fatture già collegate sono nate dentro EiC: si dichiara, così la colonna
-- non parte con 89 righe di provenienza ignota.
UPDATE public.invoices
   SET order_match_origine = 'interna'
 WHERE order_id IS NOT NULL AND order_match_origine IS NULL AND external_provider IS NULL;

UPDATE public.invoices
   SET order_match_origine = 'codice'
 WHERE order_id IS NOT NULL AND order_match_origine IS NULL AND external_provider IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fattura pagata → rata incassata → il flusso di lavoro riparte
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.incassa_rata_da_fattura_pagata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _pagata_ora boolean;
BEGIN
  -- "Pagata" senza fidarsi di un solo campo: alcuni provider aggiornano lo
  -- stato, altri solo l'importo incassato. Tolleranza di un centesimo per gli
  -- arrotondamenti dell'IVA.
  _pagata_ora := (
    (COALESCE(NEW.paid_amount, 0) >= COALESCE(NEW.total, 0) - 0.01 AND COALESCE(NEW.total, 0) > 0)
    OR lower(COALESCE(NEW.status::text, '')) IN ('paid', 'pagata', 'incassata')
  ) AND NOT (
    (COALESCE(OLD.paid_amount, 0) >= COALESCE(OLD.total, 0) - 0.01 AND COALESCE(OLD.total, 0) > 0)
    OR lower(COALESCE(OLD.status::text, '')) IN ('paid', 'pagata', 'incassata')
  );

  IF _pagata_ora THEN
    -- L'UPDATE fa scattare fire_incasso_da_rata → chiudi_passi_su_evento:
    -- il passo "attendi incasso" si chiude e la catena prosegue.
    UPDATE public.order_installments
       SET is_paid   = true,
           paid_date = COALESCE(paid_date, (now() AT TIME ZONE 'Europe/Rome')::date)
     WHERE invoice_id = NEW.id
       AND is_paid = false;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Un intoppo qui non deve impedire di registrare una fattura pagata.
  RAISE LOG 'incassa_rata_da_fattura_pagata error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incassa_rata_da_fattura_pagata ON public.invoices;
CREATE TRIGGER trg_incassa_rata_da_fattura_pagata
  AFTER UPDATE OF paid_amount, status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.incassa_rata_da_fattura_pagata();
