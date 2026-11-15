-- Le fatture ricevute da leggere come bollette (area D, 15/11/2026).
--
-- Le usa il giro del server `bollette-riconosci`: fatture degli ultimi 120 giorni con un POD o
-- un PDR nell'XML e senza ancora una riga in `bollette`. Una fattura letta, anche «senza utenze»,
-- non torna più. Le più vecchie prima, così nessuna resta indietro. Solo il service role.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.bollette_da_leggere(p_limite integer DEFAULT 30)
RETURNS TABLE (id uuid, company_id uuid, indice_corpo integer, xml_raw text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT f.id, f.company_id, coalesce(f.indice_corpo, 0), f.xml_raw
    FROM public.fatture_ricevute f
   WHERE f.created_at >= now() - interval '120 days'
     AND f.xml_raw IS NOT NULL
     AND (f.xml_raw ~ 'IT[0-9]{3}E[0-9A-Z]{8}' OR f.xml_raw ~* '<CodiceTipo>\s*PDR' OR f.xml_raw ~* 'PDR[^0-9]{0,12}[0-9]{14}')
     AND NOT EXISTS (SELECT 1 FROM public.bollette b WHERE b.fattura_ricevuta_id = f.id)
   ORDER BY f.created_at
   LIMIT least(greatest(coalesce(p_limite, 30), 1), 100)
$$;

REVOKE ALL ON FUNCTION public.bollette_da_leggere(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bollette_da_leggere(integer) TO service_role;
