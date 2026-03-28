-- Validation trigger for lost_reason_category
CREATE OR REPLACE FUNCTION validate_lost_reason_category()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lost_reason_category IS NOT NULL AND NEW.lost_reason_category NOT IN (
    'prezzo', 'concorrente', 'budget_non_disponibile', 'timing',
    'prodotto_non_adatto', 'nessuna_risposta', 'altro'
  ) THEN
    RAISE EXCEPTION 'Invalid lost_reason_category: %', NEW.lost_reason_category;
  END IF;
  RETURN NEW;
END;
$$;
