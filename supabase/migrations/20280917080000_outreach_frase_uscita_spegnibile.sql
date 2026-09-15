-- Frase d'uscita automatica spegnibile per brand.
--
-- Nello stile umano il dispatcher aggiunge in fondo «Se non ti interessa,
-- rispondi «no» e non ti scrivo più.» a ogni email che non ha già una via
-- d'uscita. Il titolare di ThermoDMR (15/09/2026) non la vuole in nessuna
-- email: togliendola dai testi la rimetteva il motore. Con questa colonna a
-- false il motore non la aggiunge più; chi risponde «no» viene comunque
-- fermato dal gestore delle risposte.
ALTER TABLE public.outreach_brands
  ADD COLUMN IF NOT EXISTS frase_uscita_automatica boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.outreach_brands.frase_uscita_automatica IS
  'Stile umano: se true il dispatcher aggiunge la frase d''uscita («rispondi no») alle email che non ne hanno una. False = mai.';
