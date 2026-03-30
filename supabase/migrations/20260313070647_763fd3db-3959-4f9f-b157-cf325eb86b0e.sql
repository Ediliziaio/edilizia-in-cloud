-- ─── Trigger 1: Auto Prima Nota on fattura emessa ─────────────────────────
DROP FUNCTION IF EXISTS public.auto_prima_nota_fattura_emessa() CASCADE;
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
    )
ON CONFLICT DO NOTHING;
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
    )
ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
