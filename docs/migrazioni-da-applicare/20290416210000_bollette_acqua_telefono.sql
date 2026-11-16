-- Bollette di acqua e telefono nel giro delle bollette (16/11/2026).
--
-- NON ANCORA APPLICATA. Sta fuori da supabase/migrations/ perché un file lì dentro va in
-- produzione al primo push: si applica con apply_migration, si riallinea la versione e poi si
-- sposta in supabase/migrations/ con lo stesso nome (vedi CLAUDE.md). Il test
-- src/test/logic/bolletteSql.test.ts la carica da qui; dopo lo spostamento, aggiornare il percorso.
--
-- Fino a oggi `bollette_da_leggere` passava al giro solo le fatture con un POD o un PDR. Acqua e
-- telefono non hanno un codice di formato fisso: le riconosce la lettura (shared/bollette/lettura.ts)
-- dal gestore e dal codice che il gestore scrive. Qui cambia solo il filtro veloce, in una
-- funzione sola, `private.sembra_bolletta`, con le stesse regole di `sembraBolletta`:
-- - POD o PDR (come prima);
-- - partita IVA di un gestore di acqua o telefono (stesso elenco di GESTORI_ACQUA e GESTORI_TELEFONO);
-- - «servizio idrico» nel testo, o parole dell'acqua insieme a un codice utenza/fornitura.
-- Una fattura che passa il filtro ma non è una bolletta (un allacciamento, una fattura dei soli
-- telefoni a rate) la lettura la registra «senza utenze» e non torna più.
--
-- Le fatture già esaminate negli ultimi 120 giorni e segnate «non bolletta» si riesaminano col
-- filtro nuovo (al più qualche centinaio di righe di `bollette_viste`, nessun costo toccato).

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION private.sembra_bolletta(p_piva text, p_xml text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT p_xml IS NOT NULL AND (
       p_xml ~ 'IT[0-9]{3}E[0-9A-Z]{8}'
    OR p_xml ~* '<CodiceTipo>\s*PDR'
    OR p_xml ~* 'PDR[^0-9]{0,12}[0-9]{14}'
    OR regexp_replace(upper(coalesce(p_piva, '')), '^IT', '') IN (
         -- acqua
         '07937540016', '13187590156', '05848061007',
         -- telefono
         '00488410010', '13378520152', '12878470157', '08539010010', '13970161009')
    OR p_xml ~* 'servizio idrico'
    OR (p_xml ~* '(fognatura|acquedott|depurazion)'
        AND p_xml ~* '(cod\.?\s*utenza|codice\s+utenza|<TipoDato>\s*Fornitura\s*</TipoDato>)'));
$$;
REVOKE ALL ON FUNCTION private.sembra_bolletta(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bollette_da_leggere(p_limite integer DEFAULT 30)
RETURNS TABLE (id uuid, company_id uuid, indice_corpo integer, xml_raw text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '20s' AS $$
BEGIN
  -- 1. Le fatture nuove, al massimo 200 per giro: si esaminano e si segnano.
  INSERT INTO public.bollette_viste (fattura_ricevuta_id, company_id, e_bolletta)
  SELECT f.id, f.company_id, private.sembra_bolletta(f.cedente_piva, f.xml_raw)
    FROM (SELECT x.id, x.company_id, x.cedente_piva, x.xml_raw FROM public.fatture_ricevute x
           WHERE x.created_at >= now() - interval '120 days'
             AND x.xml_raw IS NOT NULL  -- senza XML non si decide: torna quando l'XML arriva
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

-- Le fatture recenti già segnate «non bolletta» che col filtro nuovo lo sono: tornano in coda.
UPDATE public.bollette_viste v
   SET e_bolletta = true
  FROM public.fatture_ricevute f
 WHERE f.id = v.fattura_ricevuta_id
   AND NOT v.e_bolletta
   AND f.created_at >= now() - interval '120 days'
   AND private.sembra_bolletta(f.cedente_piva, f.xml_raw);
