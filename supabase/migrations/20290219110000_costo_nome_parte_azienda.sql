-- Il nome di una parte nei Costi solo da un conto della stessa azienda (11/11/2026).
--
-- 20290219100000 dava a una riga «conto:<id>» il nome del conto nei Costi, ma senza guardare di chi
-- fosse il conto: chi scriveva su una sua fattura l'id di un conto di un'altra azienda ne avrebbe
-- letto la descrizione (il trigger che calcola la divisione gira come SECURITY DEFINER). La
-- scrittura contabile era già protetta. Ora l'azienda arriva fino al nome: un conto di un'altra
-- azienda si chiama «Conto del piano», senza descrizione.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.costo_nome_parte(p_valore text, p_company uuid)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN p_valore ~* '^conto:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN coalesce((SELECT c.descrizione FROM public.contabilita_conti c
                      WHERE c.id = substring(p_valore FROM 7)::uuid AND c.company_id = p_company), 'Conto del piano')
    ELSE p_valore
  END;
$$;
REVOKE ALL ON FUNCTION public.costo_nome_parte(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.costo_nome_parte(text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.costo_ripartizione_da_righe(p_righe jsonb, p_conti jsonb, p_categoria text, p_importo numeric, p_company uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE v_per jsonb := '{}'::jsonb; x record; v_somma numeric := 0; v_cat text; v_out jsonb := '[]'::jsonb; v_fattore numeric;
  v_resto numeric;
BEGIN
  IF p_conti IS NULL OR jsonb_typeof(p_conti) <> 'object' OR p_conti = '{}'::jsonb
     OR p_righe IS NULL OR jsonb_typeof(p_righe) <> 'array' OR coalesce(p_importo, 0) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;
  FOR x IN
    SELECT coalesce(nullif(r->>'numero_linea', ''), n::text) AS chiave,
           coalesce(nullif(r->>'imponibile', '')::numeric, nullif(r->>'prezzo_totale', '')::numeric, 0) AS imp
      FROM jsonb_array_elements(p_righe) WITH ORDINALITY t(r, n)
  LOOP
    v_cat := CASE WHEN p_conti ? x.chiave AND btrim(p_conti->>x.chiave) <> '' THEN public.costo_nome_parte(p_conti->>x.chiave, p_company) ELSE coalesce(p_categoria, '') END;
    v_per := jsonb_set(v_per, ARRAY[v_cat], to_jsonb(coalesce((v_per->>v_cat)::numeric, 0) + x.imp));
    v_somma := v_somma + x.imp;
  END LOOP;
  IF v_somma = 0 THEN RETURN '[]'::jsonb; END IF;
  -- Le righe danno le proporzioni; l'importo è quello del costo (sconti in testata, arrotondamenti).
  v_fattore := p_importo / v_somma;
  IF (SELECT count(*) FROM jsonb_object_keys(v_per)) = 1 AND v_per ? coalesce(p_categoria, '') THEN RETURN '[]'::jsonb; END IF;
  v_resto := p_importo;
  FOR x IN SELECT key, value::numeric AS v FROM jsonb_each_text(v_per) ORDER BY value::numeric DESC, key LOOP
    v_out := v_out || jsonb_build_array(jsonb_build_object('categoria', nullif(x.key, ''), 'importo', round(x.v * v_fattore, 2)));
    v_resto := v_resto - round(x.v * v_fattore, 2);
  END LOOP;
  -- I centesimi dell'arrotondamento sulla parte più grande: la somma torna all'importo.
  IF v_resto <> 0 THEN
    v_out := jsonb_set(v_out, '{0,importo}', to_jsonb(((v_out->0->>'importo')::numeric + v_resto)));
  END IF;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.costo_ripartizione_da_righe(jsonb, jsonb, text, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.costo_ripartizione_da_righe(jsonb, jsonb, text, numeric, uuid) TO authenticated, service_role;

-- I due trigger passano l'azienda della riga.
CREATE OR REPLACE FUNCTION public.costo_ripartizione_categorie_su_costo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE f record;
BEGIN
  SELECT righe, conti_righe INTO f FROM public.fatture_ricevute
   WHERE company_cost_id = NEW.id AND company_id = NEW.company_id ORDER BY created_at LIMIT 1;
  NEW.ripartizione_categorie := CASE WHEN f IS NULL THEN '[]'::jsonb
    ELSE public.costo_ripartizione_da_righe(f.righe, f.conti_righe, NEW.category, NEW.amount, NEW.company_id) END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.costo_ripartizione_categorie_su_costo() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.costo_ripartizione_categorie_da_fattura()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.company_cost_id IS NOT NULL THEN
    UPDATE public.company_costs c
       SET ripartizione_categorie = public.costo_ripartizione_da_righe(NEW.righe, NEW.conti_righe, c.category, c.amount, NEW.company_id)
     WHERE c.id = NEW.company_cost_id AND c.company_id = NEW.company_id
       AND c.ripartizione_categorie IS DISTINCT FROM public.costo_ripartizione_da_righe(NEW.righe, NEW.conti_righe, c.category, c.amount, NEW.company_id);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.costo_ripartizione_categorie_da_fattura() FROM PUBLIC, anon, authenticated;

-- Le versioni senza azienda non le chiama più nessuno.
DROP FUNCTION IF EXISTS public.costo_ripartizione_da_righe(jsonb, jsonb, text, numeric);
DROP FUNCTION IF EXISTS public.costo_nome_parte(text);
