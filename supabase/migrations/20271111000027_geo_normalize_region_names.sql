-- Normalizza i 2 nomi regione bilingue ISTAT alla forma breve, per coerenza con
-- it_province, il menu filtri (src/lib/italianRegions.ts) e i valori già scritti
-- via provincia. Evita il mismatch silenzioso del filtro "Regione = ..." (Fase 2).
-- Applicata in prod via MCP il 2026-06-30. L'edge function load-comuni-geo applica
-- la stessa normalizzazione in fase di load (REGION_FIX).
UPDATE public.it_comuni SET regione = 'Trentino-Alto Adige'
  WHERE regione = 'Trentino-Alto Adige/Südtirol';
UPDATE public.it_comuni SET regione = 'Valle d''Aosta'
  WHERE regione = 'Valle d''Aosta/Vallée d''Aoste';

UPDATE public.marketing_contacts SET region = 'Trentino-Alto Adige'
  WHERE region = 'Trentino-Alto Adige/Südtirol';
UPDATE public.marketing_contacts SET region = 'Valle d''Aosta'
  WHERE region = 'Valle d''Aosta/Vallée d''Aoste';
