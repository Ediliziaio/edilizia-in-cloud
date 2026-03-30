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
