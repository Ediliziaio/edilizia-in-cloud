-- I piani possono appartenere direttamente all'impianto, anche senza contratto.
ALTER TABLE public.piani_manutenzione ADD COLUMN IF NOT EXISTS impianto_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS impianti_cliente_id_company_uidx
  ON public.impianti_cliente(id, company_id);

ALTER TABLE public.piani_manutenzione
  ADD CONSTRAINT piani_manutenzione_impianto_company_fkey
  FOREIGN KEY (impianto_id, company_id) REFERENCES public.impianti_cliente(id, company_id)
  ON DELETE CASCADE;

UPDATE public.piani_manutenzione AS piano
SET impianto_id = contratto.impianto_id
FROM public.contratti_manutenzione AS contratto
JOIN public.impianti_cliente AS impianto
  ON impianto.id = contratto.impianto_id AND impianto.company_id = contratto.company_id
WHERE piano.contratto_id = contratto.id AND piano.company_id = contratto.company_id
  AND piano.impianto_id IS NULL;

CREATE INDEX IF NOT EXISTS piani_manutenzione_impianto_company_idx
  ON public.piani_manutenzione(impianto_id, company_id);

CREATE OR REPLACE FUNCTION public.manutenzione_collega_impianto()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_impianto uuid;
BEGIN
  IF NEW.contratto_id IS NOT NULL THEN
    SELECT contratto.impianto_id INTO v_impianto
      FROM public.contratti_manutenzione AS contratto
      WHERE contratto.id = NEW.contratto_id AND contratto.company_id = NEW.company_id
      FOR SHARE;
    IF NOT FOUND OR (NEW.impianto_id IS NOT NULL AND NEW.impianto_id <> v_impianto) THEN
      RAISE EXCEPTION 'Il contratto di manutenzione non appartiene a questo impianto e azienda'
        USING ERRCODE = '23514';
    END IF;
    NEW.impianto_id := v_impianto;
  END IF;

  IF NEW.impianto_id IS NULL THEN
    RAISE EXCEPTION 'Seleziona un impianto per il piano di manutenzione' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.manutenzione_collega_impianto() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER manutenzione_collega_impianto
  BEFORE INSERT OR UPDATE OF impianto_id, contratto_id, company_id
  ON public.piani_manutenzione
  FOR EACH ROW EXECUTE FUNCTION public.manutenzione_collega_impianto();

CREATE OR REPLACE FUNCTION public.manutenzione_registra_esecuzione(
  p_piano_id uuid,
  p_impianto_id uuid,
  p_operazione uuid,
  p_data date,
  p_esito text DEFAULT 'ok',
  p_note text DEFAULT NULL,
  p_da_elenco boolean DEFAULT false,
  p_ultima_attesa date DEFAULT NULL,
  p_scadenza_attesa date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_piano public.piani_manutenzione%ROWTYPE;
  v_esecuzione public.esecuzioni_manutenzione%ROWTYPE;
  v_giorni integer;
BEGIN
  IF auth.uid() IS NULL OR p_operazione IS NULL OR p_data IS NULL OR p_esito IS NULL THEN
    RAISE EXCEPTION 'Dati mancanti per registrare la manutenzione' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_piano FROM public.piani_manutenzione
    WHERE id = p_piano_id AND impianto_id = p_impianto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Piano di manutenzione non disponibile per questo impianto' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_esecuzione FROM public.esecuzioni_manutenzione WHERE id = p_operazione;
  IF FOUND THEN
    IF (v_esecuzione.piano_id, v_esecuzione.data_esecuzione, v_esecuzione.esito, v_esecuzione.note)
       IS DISTINCT FROM (p_piano_id, p_data, p_esito, NULLIF(btrim(p_note), '')) THEN
      RAISE EXCEPTION 'Operazione già registrata con dati diversi' USING ERRCODE = '23505';
    END IF;
    RETURN v_esecuzione.id;
  END IF;

  IF p_da_elenco AND (v_piano.ultima_esecuzione, v_piano.prossima_scadenza)
      IS DISTINCT FROM (p_ultima_attesa, p_scadenza_attesa) THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Il piano è cambiato. Aggiorna l’elenco prima di completare la manutenzione.';
  END IF;
  INSERT INTO public.esecuzioni_manutenzione(id, piano_id, tecnico_id, data_esecuzione, esito, note)
  VALUES (p_operazione, p_piano_id, CASE WHEN p_da_elenco THEN v_piano.tecnico_preferito ELSE auth.uid() END,
    p_data, p_esito, NULLIF(btrim(p_note), ''));

  -- Un intervento arretrato completa lo storico senza far retrocedere la scadenza.
  IF p_esito <> 'rinviata' AND (v_piano.ultima_esecuzione IS NULL OR p_data > v_piano.ultima_esecuzione) THEN
    v_giorni := coalesce(v_piano.frequenza_giorni, CASE v_piano.frequenza_tipo
      WHEN 'mensile' THEN 30 WHEN 'trimestrale' THEN 90 WHEN 'semestrale' THEN 180 ELSE 365 END);
    UPDATE public.piani_manutenzione
    SET ultima_esecuzione = p_data, prossima_scadenza = p_data + v_giorni
    WHERE id = v_piano.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Impossibile aggiornare il piano di manutenzione' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN p_operazione;
END;
$$;

REVOKE ALL ON FUNCTION public.manutenzione_registra_esecuzione(uuid, uuid, uuid, date, text, text, boolean, date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manutenzione_registra_esecuzione(uuid, uuid, uuid, date, text, text, boolean, date, date)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
