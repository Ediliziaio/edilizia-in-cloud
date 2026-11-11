-- Il conto di costo di una riga di fattura scelto dal piano dei conti (11/11/2026).
--
-- Una riga di fattura ricevuta aveva come «conto» solo una categoria (materie prime, trasporti…),
-- che la scrittura contabile traduceva in un ruolo fisso (30.01, 30.13…). Uno studio che tiene la
-- contabilità con il SUO piano (122 conti di costo) non poteva scegliere i suoi conti, né usarne
-- uno nuovo: un conto creato nel piano non compariva mai sulle righe.
--
-- Ora fatture_ricevute.conti_righe accetta anche «conto:<id del conto>»:
--   - la scrittura contabile mette la riga su quel conto, se è un conto movimentabile e attivo
--     della stessa azienda; altrimenti sul conto della fattura (mai su un conto di un'altra azienda);
--   - nei Costi e nel Controllo di gestione la parte si chiama come il conto (la sua descrizione).
-- Le categorie restano valide come prima.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Il conto di una riga: quello scelto dal piano, oppure quello che discende dalla categoria.
CREATE OR REPLACE FUNCTION public.contabilita_conto_della_riga(k jsonb, p_valore text, p_ruolo_fattura text)
RETURNS text LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE v_azienda uuid; v_id uuid;
BEGIN
  IF p_valore ~* '^conto:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT company_id INTO v_azienda FROM public.contabilita_conti WHERE id = (k->>p_ruolo_fattura)::uuid;
    SELECT id INTO v_id FROM public.contabilita_conti
     WHERE id = substring(p_valore FROM 7)::uuid AND company_id = v_azienda AND movimentabile AND attivo;
    RETURN coalesce(v_id::text, k->>p_ruolo_fattura);
  END IF;
  RETURN k->>public.contabilita_ruolo_disponibile(k, public.contabilita_conto_da_categoria(p_valore));
END $$;
REVOKE ALL ON FUNCTION public.contabilita_conto_della_riga(jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_conto_della_riga(jsonb, text, text) TO authenticated, service_role;

-- La scrittura della fattura divisa per conto: ora le parti sono per conto (id), non per ruolo.
CREATE OR REPLACE FUNCTION public.contabilita_righe_costo(k jsonb, p_righe jsonb, p_conti jsonb, p_imp numeric, p_extra numeric, p_ruolo text, p_descrizione text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  v_somma numeric; v_segno numeric := 1; v_per jsonb := '{}'::jsonb; x record; v_conto text; v_fuori numeric;
  v_out jsonb := '[]'::jsonb; v_della_fattura text := k->>p_ruolo;
BEGIN
  IF p_conti IS NULL OR jsonb_typeof(p_conti) <> 'object' OR p_conti = '{}'::jsonb
     OR p_righe IS NULL OR jsonb_typeof(p_righe) <> 'array' THEN
    RETURN public.contabilita_riga(v_della_fattura, 'dare', p_imp + coalesce(p_extra, 0), p_descrizione);
  END IF;
  SELECT coalesce(sum(coalesce(nullif(r->>'imponibile', '')::numeric, nullif(r->>'prezzo_totale', '')::numeric, 0)), 0)
    INTO v_somma FROM jsonb_array_elements(p_righe) r;
  -- Le righe di una nota di credito sono scritte in positivo come la fattura: il segno lo dà l'imponibile.
  IF v_somma <> 0 AND sign(v_somma) <> sign(p_imp) THEN v_segno := -1; END IF;
  FOR x IN
    SELECT coalesce(nullif(r->>'numero_linea', ''), n::text) AS chiave,
           coalesce(nullif(r->>'imponibile', '')::numeric, nullif(r->>'prezzo_totale', '')::numeric, 0) * v_segno AS importo
      FROM jsonb_array_elements(p_righe) WITH ORDINALITY t(r, n)
  LOOP
    v_conto := CASE WHEN p_conti ? x.chiave AND btrim(p_conti->>x.chiave) <> ''
                    THEN public.contabilita_conto_della_riga(k, p_conti->>x.chiave, p_ruolo)
                    ELSE v_della_fattura END;
    v_per := jsonb_set(v_per, ARRAY[v_conto], to_jsonb(coalesce((v_per->>v_conto)::numeric, 0) + x.importo));
  END LOOP;
  -- Quello che le righe non spiegano (sconti in testata, arrotondamenti) e l'IVA indetraibile: sul conto della fattura.
  v_fuori := round(p_imp - v_somma * v_segno, 2) + coalesce(p_extra, 0);
  v_per := jsonb_set(v_per, ARRAY[v_della_fattura], to_jsonb(coalesce((v_per->>v_della_fattura)::numeric, 0) + v_fuori));
  FOR x IN SELECT key, value::numeric AS importo FROM jsonb_each_text(v_per) ORDER BY key LOOP
    v_out := v_out || public.contabilita_riga(x.key, 'dare', round(x.importo, 2), p_descrizione);
  END LOOP;
  RETURN v_out;
END $$;

-- Il nome di una parte nei Costi: la descrizione del conto scelto, oppure la categoria com'è.
CREATE OR REPLACE FUNCTION public.costo_nome_parte(p_valore text)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN p_valore ~* '^conto:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN coalesce((SELECT c.descrizione FROM public.contabilita_conti c WHERE c.id = substring(p_valore FROM 7)::uuid), 'Conto del piano')
    ELSE p_valore
  END;
$$;
REVOKE ALL ON FUNCTION public.costo_nome_parte(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.costo_nome_parte(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.costo_ripartizione_da_righe(p_righe jsonb, p_conti jsonb, p_categoria text, p_importo numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE v_per jsonb := '{}'::jsonb; x record; v_somma numeric := 0; v_cat text; v_out jsonb := '[]'::jsonb; v_fattore numeric;
  v_resto numeric; v_ultima text;
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
    v_cat := CASE WHEN p_conti ? x.chiave AND btrim(p_conti->>x.chiave) <> '' THEN public.costo_nome_parte(p_conti->>x.chiave) ELSE coalesce(p_categoria, '') END;
    v_per := jsonb_set(v_per, ARRAY[v_cat], to_jsonb(coalesce((v_per->>v_cat)::numeric, 0) + x.imp));
    v_somma := v_somma + x.imp;
  END LOOP;
  IF v_somma = 0 THEN RETURN '[]'::jsonb; END IF;
  -- Le righe danno le proporzioni; l'importo è quello del costo (sconti in testata, arrotondamenti).
  v_fattore := p_importo / v_somma;
  IF (SELECT count(*) FROM jsonb_object_keys(v_per)) = 1 AND v_per ? coalesce(p_categoria, '') THEN RETURN '[]'::jsonb; END IF;
  v_resto := p_importo;
  FOR x IN SELECT key, value::numeric AS v FROM jsonb_each_text(v_per) ORDER BY value::numeric DESC, key LOOP
    v_ultima := x.key;
    v_out := v_out || jsonb_build_array(jsonb_build_object('categoria', nullif(x.key, ''), 'importo', round(x.v * v_fattore, 2)));
    v_resto := v_resto - round(x.v * v_fattore, 2);
  END LOOP;
  -- I centesimi dell'arrotondamento sulla parte più grande: la somma torna all'importo.
  IF v_resto <> 0 THEN
    v_out := jsonb_set(v_out, '{0,importo}', to_jsonb(((v_out->0->>'importo')::numeric + v_resto)));
  END IF;
  RETURN v_out;
END $$;

