-- Il PDF classic ha sempre centrato titolo e riga meta, ma la colonna
-- header_alignment nasceva con default 'left' e nessun template l'ha mai
-- scelta davvero (in produzione tutte le righe valgono 'left'). Ora che il PDF
-- legge il campo, 'left' avrebbe spostato a sinistra ogni offerta esistente:
-- il default diventa 'center', coerente con l'aspetto che i clienti conoscono.
-- Idempotente.
ALTER TABLE public.quote_templates ALTER COLUMN header_alignment SET DEFAULT 'center';

UPDATE public.quote_templates
   SET header_alignment = 'center'
 WHERE header_alignment IS NULL OR header_alignment = 'left';
