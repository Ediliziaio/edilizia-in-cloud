-- Preserve calendar months as a billing unit. No conversion to days or hours.
SET lock_timeout = '5s';
ALTER TABLE public.tariffe_aziendali
  DROP CONSTRAINT tariffe_aziendali_unita_fatturazione_check,
  ADD CONSTRAINT tariffe_aziendali_unita_fatturazione_check
  CHECK (unita_fatturazione IN
    ('pz','mq','ml','mc','kg','gg','mese','h','a_corpo','km','piano'));
