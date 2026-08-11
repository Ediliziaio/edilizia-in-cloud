-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Normalizza i 2 nomi regione bilingue ISTAT alla forma breve, per coerenza con
-- it_province, il menu filtri automazioni e i valori già scritti via provincia.
-- Evita il mismatch silenzioso del filtro "Regione = ..." in Fase 2.
UPDATE public.it_comuni SET regione = 'Trentino-Alto Adige'
  WHERE regione = 'Trentino-Alto Adige/Südtirol';
UPDATE public.it_comuni SET regione = 'Valle d''Aosta'
  WHERE regione = 'Valle d''Aosta/Vallée d''Aoste';

-- Allinea eventuali contatti già arricchiti con la forma lunga (idempotente)
UPDATE public.marketing_contacts SET region = 'Trentino-Alto Adige'
  WHERE region = 'Trentino-Alto Adige/Südtirol';
UPDATE public.marketing_contacts SET region = 'Valle d''Aosta'
  WHERE region = 'Valle d''Aosta/Vallée d''Aoste';
