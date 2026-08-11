-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Tabella di riferimento province italiane (sigla → capoluogo/nome → regione).
-- Reference data condivisa (globale, non per-azienda). Usata per arricchire i
-- contatti: regione da provincia, e provincia+regione da città-capoluogo.
CREATE TABLE IF NOT EXISTS public.it_province (
  sigla   text PRIMARY KEY,
  nome    text NOT NULL,
  regione text NOT NULL
);

ALTER TABLE public.it_province ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS it_province_read ON public.it_province;
CREATE POLICY it_province_read ON public.it_province FOR SELECT TO authenticated USING (true);

INSERT INTO public.it_province (sigla, nome, regione) VALUES
  ('AQ','L''Aquila','Abruzzo'),('CH','Chieti','Abruzzo'),('PE','Pescara','Abruzzo'),('TE','Teramo','Abruzzo'),
  ('MT','Matera','Basilicata'),('PZ','Potenza','Basilicata'),
  ('CZ','Catanzaro','Calabria'),('CS','Cosenza','Calabria'),('KR','Crotone','Calabria'),('RC','Reggio Calabria','Calabria'),('VV','Vibo Valentia','Calabria'),
  ('AV','Avellino','Campania'),('BN','Benevento','Campania'),('CE','Caserta','Campania'),('NA','Napoli','Campania'),('SA','Salerno','Campania'),
  ('BO','Bologna','Emilia-Romagna'),('FE','Ferrara','Emilia-Romagna'),('FC','Forlì','Emilia-Romagna'),('MO','Modena','Emilia-Romagna'),('PR','Parma','Emilia-Romagna'),('PC','Piacenza','Emilia-Romagna'),('RA','Ravenna','Emilia-Romagna'),('RE','Reggio Emilia','Emilia-Romagna'),('RN','Rimini','Emilia-Romagna'),
  ('GO','Gorizia','Friuli-Venezia Giulia'),('PN','Pordenone','Friuli-Venezia Giulia'),('TS','Trieste','Friuli-Venezia Giulia'),('UD','Udine','Friuli-Venezia Giulia'),
  ('FR','Frosinone','Lazio'),('LT','Latina','Lazio'),('RI','Rieti','Lazio'),('RM','Roma','Lazio'),('VT','Viterbo','Lazio'),
  ('GE','Genova','Liguria'),('IM','Imperia','Liguria'),('SP','La Spezia','Liguria'),('SV','Savona','Liguria'),
  ('BG','Bergamo','Lombardia'),('BS','Brescia','Lombardia'),('CO','Como','Lombardia'),('CR','Cremona','Lombardia'),('LC','Lecco','Lombardia'),('LO','Lodi','Lombardia'),('MN','Mantova','Lombardia'),('MI','Milano','Lombardia'),('MB','Monza','Lombardia'),('PV','Pavia','Lombardia'),('SO','Sondrio','Lombardia'),('VA','Varese','Lombardia'),
  ('AN','Ancona','Marche'),('AP','Ascoli Piceno','Marche'),('FM','Fermo','Marche'),('MC','Macerata','Marche'),('PU','Pesaro','Marche'),
  ('CB','Campobasso','Molise'),('IS','Isernia','Molise'),
  ('AL','Alessandria','Piemonte'),('AT','Asti','Piemonte'),('BI','Biella','Piemonte'),('CN','Cuneo','Piemonte'),('NO','Novara','Piemonte'),('TO','Torino','Piemonte'),('VB','Verbania','Piemonte'),('VC','Vercelli','Piemonte'),
  ('BA','Bari','Puglia'),('BT','Barletta','Puglia'),('BR','Brindisi','Puglia'),('FG','Foggia','Puglia'),('LE','Lecce','Puglia'),('TA','Taranto','Puglia'),
  ('CA','Cagliari','Sardegna'),('NU','Nuoro','Sardegna'),('OR','Oristano','Sardegna'),('SS','Sassari','Sardegna'),('SU','Carbonia','Sardegna'),
  ('AG','Agrigento','Sicilia'),('CL','Caltanissetta','Sicilia'),('CT','Catania','Sicilia'),('EN','Enna','Sicilia'),('ME','Messina','Sicilia'),('PA','Palermo','Sicilia'),('RG','Ragusa','Sicilia'),('SR','Siracusa','Sicilia'),('TP','Trapani','Sicilia'),
  ('AR','Arezzo','Toscana'),('FI','Firenze','Toscana'),('GR','Grosseto','Toscana'),('LI','Livorno','Toscana'),('LU','Lucca','Toscana'),('MS','Massa','Toscana'),('PI','Pisa','Toscana'),('PT','Pistoia','Toscana'),('PO','Prato','Toscana'),('SI','Siena','Toscana'),
  ('BZ','Bolzano','Trentino-Alto Adige'),('TN','Trento','Trentino-Alto Adige'),
  ('PG','Perugia','Umbria'),('TR','Terni','Umbria'),
  ('AO','Aosta','Valle d''Aosta'),
  ('BL','Belluno','Veneto'),('PD','Padova','Veneto'),('RO','Rovigo','Veneto'),('TV','Treviso','Veneto'),('VE','Venezia','Veneto'),('VR','Verona','Veneto'),('VI','Vicenza','Veneto')
ON CONFLICT (sigla) DO UPDATE SET nome = EXCLUDED.nome, regione = EXCLUDED.regione;

ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS region text;
