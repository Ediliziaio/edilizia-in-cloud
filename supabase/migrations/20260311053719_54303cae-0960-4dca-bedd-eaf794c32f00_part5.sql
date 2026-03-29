-- Validation trigger for win_probability
CREATE OR REPLACE FUNCTION validate_win_probability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.win_probability IS NOT NULL AND (NEW.win_probability < 0 OR NEW.win_probability > 100) THEN
    RAISE EXCEPTION 'win_probability must be between 0 and 100';
  END IF;
  RETURN NEW;
END;
$$;
