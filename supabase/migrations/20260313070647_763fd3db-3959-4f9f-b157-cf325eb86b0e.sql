
-- ─── Trigger 1: Auto Prima Nota on fattura emessa ─────────────────────────
CREATE OR REPLACE FUNCTION public.auto_prima_nota_fattura_emessa()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when stato changes TO 'emessa' from a non-emessa state
  IF NEW.stato = 'emessa'
     AND (OLD.stato IS DISTINCT FROM 'emessa')
     AND NEW.tipo IN ('fattura', 'fattura_pa', 'fattura_accompagnatoria', 'autofattura')
  THEN
    INSERT INTO public.prima_nota_entries (
      company_id, direction, category, description, amount,
      entry_date, invoice_id, is_auto, auto_source, account_label
    ) VALUES (
      NEW.company_id,
      'entrata',
      'incasso',
      'Fattura n. ' || NEW.numero || ' emessa',
      NEW.totale_da_pagare,
      NEW.data_emissione,
      NEW.id,
      true,
      'fattura_emessa',
      'crediti_clienti'
    );
  END IF;

  -- Trigger 3 inline: Nota di credito emessa → storno
  IF NEW.stato = 'emessa'
     AND (OLD.stato IS DISTINCT FROM 'emessa')
     AND NEW.tipo = 'nota_credito'
  THEN
    INSERT INTO public.prima_nota_entries (
      company_id, direction, category, description, amount,
      entry_date, invoice_id, is_auto, auto_source, account_label
    ) VALUES (
      NEW.company_id,
      'uscita',
      'incasso',
      'Nota di credito n. ' || NEW.numero || ' — storno',
      NEW.totale_da_pagare,
      NEW.data_emissione,
      NEW.id,
      true,
      'nota_credito',
      'crediti_clienti'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_prima_nota_on_fattura_emessa
  AFTER UPDATE ON public.documenti_fiscali
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_prima_nota_fattura_emessa();

-- ─── Trigger 2: Auto Prima Nota on incasso (movimenti_cassa_native) ───────
CREATE OR REPLACE FUNCTION public.auto_prima_nota_incasso()
RETURNS TRIGGER AS $$
DECLARE
  v_numero TEXT;
  v_company UUID;
BEGIN
  -- Only for incoming payments linked to a document
  IF NEW.documento_id IS NULL OR NEW.tipo != 'entrata' THEN
    RETURN NEW;
  END IF;

  SELECT numero, company_id INTO v_numero, v_company
  FROM public.documenti_fiscali
  WHERE id = NEW.documento_id;

  IF v_numero IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.prima_nota_entries (
    company_id, direction, category, description, amount,
    entry_date, invoice_id, is_auto, auto_source,
    payment_method, account_label
  ) VALUES (
    v_company,
    'entrata',
    'incasso',
    'Incasso fattura n. ' || v_numero,
    NEW.importo,
    NEW.data_movimento,
    NEW.documento_id,
    true,
    'incasso_fattura',
    COALESCE(NEW.metodo, 'banca')
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_prima_nota_on_incasso
  AFTER INSERT ON public.movimenti_cassa_native
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_prima_nota_incasso();
