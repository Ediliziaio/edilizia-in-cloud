-- bollette_da_leggere guarda ogni fattura una volta sola (area D, 15/11/2026).
--
-- La prima versione (20290415170000) cercava POD e PDR con tre espressioni regolari nell'XML di
-- tutte le fatture ricevute degli ultimi 120 giorni, a ogni giro: 4,8 secondi misurati sul
-- database vero, ogni 15 minuti. Ora una fattura esaminata si segna in `bollette_viste` e non si
-- riesamina: a ogni giro si guardano al massimo 200 fatture nuove (le più vecchie prima), e solo
-- quelle con un POD o un PDR tornano al giro come bollette da leggere.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.bollette_viste (
  fattura_ricevuta_id uuid PRIMARY KEY REFERENCES public.fatture_ricevute(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  e_bolletta boolean NOT NULL,
  vista_il timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.bollette_viste IS 'Fatture ricevute già esaminate dal giro delle bollette: non si riesaminano.';
ALTER TABLE public.bollette_viste ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bollette_viste FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.bollette_viste TO service_role;

-- Le fatture già lette come bollette sono già viste.
INSERT INTO public.bollette_viste (fattura_ricevuta_id, company_id, e_bolletta)
SELECT b.fattura_ricevuta_id, b.company_id, true FROM public.bollette b
ON CONFLICT (fattura_ricevuta_id) DO NOTHING;

DROP FUNCTION IF EXISTS public.bollette_da_leggere(integer);

CREATE OR REPLACE FUNCTION public.bollette_da_leggere(p_limite integer DEFAULT 30)
RETURNS TABLE (id uuid, company_id uuid, indice_corpo integer, xml_raw text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '20s' AS $$
BEGIN
  -- 1. Le fatture nuove, al massimo 200 per giro: si esaminano e si segnano.
  INSERT INTO public.bollette_viste (fattura_ricevuta_id, company_id, e_bolletta)
  SELECT f.id, f.company_id,
         f.xml_raw IS NOT NULL AND (f.xml_raw ~ 'IT[0-9]{3}E[0-9A-Z]{8}' OR f.xml_raw ~* '<CodiceTipo>\s*PDR' OR f.xml_raw ~* 'PDR[^0-9]{0,12}[0-9]{14}')
    FROM (SELECT x.id, x.company_id, x.xml_raw FROM public.fatture_ricevute x
           WHERE x.created_at >= now() - interval '120 days'
             AND NOT EXISTS (SELECT 1 FROM public.bollette_viste v WHERE v.fattura_ricevuta_id = x.id)
           ORDER BY x.created_at LIMIT 200) f
  ON CONFLICT (fattura_ricevuta_id) DO NOTHING;

  -- 2. Le bollette viste e non ancora lette.
  RETURN QUERY
  SELECT f.id, f.company_id, coalesce(f.indice_corpo, 0), f.xml_raw
    FROM public.bollette_viste v
    JOIN public.fatture_ricevute f ON f.id = v.fattura_ricevuta_id
   WHERE v.e_bolletta
     AND NOT EXISTS (SELECT 1 FROM public.bollette b WHERE b.fattura_ricevuta_id = v.fattura_ricevuta_id)
   ORDER BY v.vista_il
   LIMIT least(greatest(coalesce(p_limite, 30), 1), 100);
END $$;

REVOKE ALL ON FUNCTION public.bollette_da_leggere(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bollette_da_leggere(integer) TO service_role;
