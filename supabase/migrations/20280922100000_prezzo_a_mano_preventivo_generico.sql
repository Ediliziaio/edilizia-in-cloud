-- Preventivo generico: anche qui il prezzo si può scrivere a mano, come nei
-- preventivatori di mestiere (serramenti + 8 moduli edili, 21/09/2026).
--
-- Qui però i totali di `quotes` NON li scrive il client: li ricalcola SEMPRE
-- il server con `do_recalculate_quote_totals`, chiamata dai trigger dopo ogni
-- salvataggio delle righe (`save_quote_items_atomic` fa DELETE+INSERT ad ogni
-- autosave) e dopo ogni cambio di sconto. Senza toccare questa funzione, un
-- prezzo scritto a mano sparirebbe dai totali al salvataggio successivo.
--
-- L'IVA qui è per riga (aliquote miste), non un'unica percentuale come nei
-- moduli: con le righe a 0€ non c'è niente da ripartire. Si aggiunge quindi
-- un'aliquota esplicita per il prezzo scritto a mano, sullo stesso modello
-- del campo IVA dei moduli (visibile solo insieme al prezzo).

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS prezzo_manuale numeric(12,2),
  ADD COLUMN IF NOT EXISTS prezzo_manuale_iva_pct numeric(5,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotes_prezzo_manuale_positivo'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_prezzo_manuale_positivo
      CHECK (prezzo_manuale IS NULL OR prezzo_manuale > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotes_prezzo_manuale_iva_pct_range'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_prezzo_manuale_iva_pct_range
      CHECK (prezzo_manuale_iva_pct IS NULL OR prezzo_manuale_iva_pct BETWEEN 0 AND 100);
  END IF;
END $$;

COMMENT ON COLUMN public.quotes.prezzo_manuale IS
  'Prezzo pieno scritto a mano, IVA esclusa: sostituisce la somma delle righe '
  '(quote_items) nel calcolo di subtotal/vat_amount/total fatto da '
  'do_recalculate_quote_totals. NULL = somma delle righe, come sempre. Si '
  'scrive solo se l''azienda ha acceso preventivo_impostazioni.prezzo_finale_a_mano.';
COMMENT ON COLUMN public.quotes.prezzo_manuale_iva_pct IS
  'Aliquota IVA usata SOLO quando prezzo_manuale è impostato: qui le righe '
  'hanno aliquote miste per riga, quindi con le righe a 0€ non c''è niente da '
  'ripartire per calcolare l''IVA del prezzo scritto a mano.';

-- Stessa funzione di sempre: se il preventivo ha un prezzo scritto a mano lo
-- usa al posto della somma delle righe; altrimenti il calcolo è invariato.
CREATE OR REPLACE FUNCTION public.do_recalculate_quote_totals(p_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_subtotale_righe numeric;
  v_iva_lorda_righe numeric;
  v_manuale         numeric;
  v_manuale_iva_pct numeric;
  v_sconto_pct      numeric;
  v_subtotale       numeric;
  v_sconto          numeric;
  v_iva             numeric;
BEGIN
  SELECT
    COALESCE(SUM(line_total), 0),
    COALESCE(SUM(ROUND(line_total * vat_rate / 100, 2)), 0)
  INTO v_subtotale_righe, v_iva_lorda_righe
  FROM public.quote_items
  WHERE quote_id = p_quote_id
    AND COALESCE(is_optional, false) = false;

  SELECT prezzo_manuale, prezzo_manuale_iva_pct, COALESCE(discount_percent, 0)
  INTO v_manuale, v_manuale_iva_pct, v_sconto_pct
  FROM public.quotes
  WHERE id = p_quote_id;

  IF v_manuale > 0 THEN
    v_subtotale := v_manuale;
    v_sconto    := ROUND(v_subtotale * v_sconto_pct / 100, 2);
    -- Prezzo scritto: l'IVA è la sua aliquota esplicita sul netto (prezzo −
    -- sconto), non la somma per riga delle aliquote miste — con le righe a 0€
    -- non c'è niente da ripartire.
    v_iva := ROUND((v_subtotale - v_sconto) * COALESCE(v_manuale_iva_pct, 0) / 100, 2);
  ELSE
    v_subtotale := v_subtotale_righe;
    v_sconto    := ROUND(v_subtotale * v_sconto_pct / 100, 2);
    v_iva       := ROUND(v_iva_lorda_righe * (1 - v_sconto_pct / 100), 2);
  END IF;

  UPDATE public.quotes
  SET subtotal        = v_subtotale,
      discount_amount = v_sconto,
      vat_amount      = v_iva,
      total           = v_subtotale - v_sconto + v_iva,
      updated_at      = now()
  WHERE id = p_quote_id;
END;
$function$;

-- Il trigger sullo sconto ora ricalcola anche quando cambia solo il prezzo
-- scritto a mano (o la sua aliquota), senza toccare le righe: l'autosave del
-- builder salva la testata (client_name/discount_percent/prezzo_manuale) in
-- una chiamata separata da quella delle righe, in quest'ordine o nell'altro a
-- seconda di cosa è cambiato. Senza questo, un prezzo scritto ma non ancora
-- accompagnato da un cambio riga o sconto restava CONGELATO nei totali finché
-- non arrivava un salvataggio successivo delle righe.
CREATE OR REPLACE FUNCTION public.trg_quotes_ricalcola_su_sconto()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.discount_percent IS DISTINCT FROM OLD.discount_percent
     OR NEW.prezzo_manuale IS DISTINCT FROM OLD.prezzo_manuale
     OR NEW.prezzo_manuale_iva_pct IS DISTINCT FROM OLD.prezzo_manuale_iva_pct THEN
    PERFORM public.do_recalculate_quote_totals(NEW.id);
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_quotes_ricalcola_su_sconto ON public.quotes;
CREATE TRIGGER trg_quotes_ricalcola_su_sconto
  AFTER UPDATE OF discount_percent, prezzo_manuale, prezzo_manuale_iva_pct ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.trg_quotes_ricalcola_su_sconto();
