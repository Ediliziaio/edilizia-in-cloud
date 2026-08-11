-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Ammette i nuovi tipi inviabili dal dipendente dalla pagina timbrature
ALTER TABLE public.hr_richieste DROP CONSTRAINT IF EXISTS hr_richieste_tipo_check;
ALTER TABLE public.hr_richieste ADD CONSTRAINT hr_richieste_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'ferie','permesso','malattia','straordinario','cambio_turno','rimborso',
    'altro','rol','infortunio','maternita','paternita','lutto',
    'smart_working','trasferta','formazione',
    'rettifica_timbratura','segnalazione'
  ]::text[]));
