-- Fotovoltaico: duplicare un progetto, anche emesso o firmato.
--
-- Il wizard mostrava «Duplica» e «Clona» e in cinque punti diceva di clonare un
-- preventivo emesso per correggerlo, ma i due pulsanti aprivano solo un avviso:
-- la duplicazione non esisteva. Un PDF uscito con un prezzo sbagliato si poteva
-- solo annullare e rifare da capo, analisi del tetto compresa.
--
-- Copia il progetto come nuova bozza (numero nuovo, versione + 1,
-- versione_padre_id sull'originale) con componenti, manodopera, servizi, layout
-- dei pannelli e il calcolo finanziario attivo. Emissione, firma, PDF,
-- annullamento e commessa restano sull'originale.
--
-- SECURITY DEFINER perché la numerazione deve vedere tutti i progetti
-- dell'azienda (vincolo unico company_id + numero): le regole delle policy
-- co_fv_progetti_all e blocco_utente_bloccato sono riscritte qui dentro.

CREATE OR REPLACE FUNCTION public.fv_duplica_progetto(p_progetto_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_utente uuid := auth.uid();
  v_src    public.fv_progetti%ROWTYPE;
  v_nuovo  uuid := gen_random_uuid();
BEGIN
  IF v_utente IS NULL OR public.utente_bloccato() OR public.utente_e_cliente_esterno() THEN
    RAISE EXCEPTION 'Non autorizzato' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_src
    FROM public.fv_progetti
   WHERE id = p_progetto_id
     AND deleted_at IS NULL
     AND company_id = public.get_effective_company_id()
     AND public.check_staff_visibility(v_utente, created_by);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Progetto non trovato' USING ERRCODE = 'P0002';
  END IF;

  -- Due duplicazioni insieme non devono prendere lo stesso numero.
  PERFORM pg_advisory_xact_lock(hashtext('fv_numero_progetto_' || v_src.company_id::text));

  INSERT INTO public.fv_progetti
  SELECT (jsonb_populate_record(
    NULL::public.fv_progetti,
    to_jsonb(v_src) || jsonb_build_object(
      'id', v_nuovo,
      'numero', public.fv_genera_numero_progetto(v_src.company_id),
      'stato', 'bozza',
      'versione', coalesce(v_src.versione, 1) + 1,
      'versione_padre_id', v_src.id,
      'created_at', now(),
      'updated_at', now(),
      'created_by', v_utente,
      'ultima_modifica_by', v_utente,
      'updated_by', v_utente,
      'emesso_il', NULL,
      'firmato_il', NULL,
      'annullato', false,
      'annullato_il', NULL,
      'annullato_motivo', NULL,
      'pdf_vendita_url', NULL,
      'pdf_tecnico_url', NULL,
      'pdf_mobile_url', NULL,
      'ordine_id', NULL
    )
  )).*;

  INSERT INTO public.fv_componenti_progetto
        (progetto_id, articolo_id, categoria, descrizione, marca, modello, quantita, unita_misura,
         prezzo_unitario_netto, prezzo_unitario_vendita, margine_pct, potenza_unitaria_w,
         potenza_unitaria_kw, capacita_kwh, garanzia_anni, ordinamento)
  SELECT v_nuovo, articolo_id, categoria, descrizione, marca, modello, quantita, unita_misura,
         prezzo_unitario_netto, prezzo_unitario_vendita, margine_pct, potenza_unitaria_w,
         potenza_unitaria_kw, capacita_kwh, garanzia_anni, ordinamento
    FROM public.fv_componenti_progetto
   WHERE progetto_id = v_src.id;

  INSERT INTO public.fv_manodopera_progetto
        (progetto_id, tariffa_id, descrizione, ore, tariffa_oraria_netta, tariffa_oraria_vendita,
         margine_pct, ordinamento)
  SELECT v_nuovo, tariffa_id, descrizione, ore, tariffa_oraria_netta, tariffa_oraria_vendita,
         margine_pct, ordinamento
    FROM public.fv_manodopera_progetto
   WHERE progetto_id = v_src.id;

  INSERT INTO public.fv_servizi_progetto
        (progetto_id, tipo, descrizione, quantita, prezzo_netto, prezzo_vendita, ordinamento, note_operative)
  SELECT v_nuovo, tipo, descrizione, quantita, prezzo_netto, prezzo_vendita, ordinamento, note_operative
    FROM public.fv_servizi_progetto
   WHERE progetto_id = v_src.id;

  INSERT INTO public.fv_pannelli_layout
        (progetto_id, segment_index, centro_lat, centro_lng, azimuth_deg, tilt_deg, orientamento,
         larghezza_m, altezza_m, produzione_annua_kwh, attivo, origine)
  SELECT v_nuovo, segment_index, centro_lat, centro_lng, azimuth_deg, tilt_deg, orientamento,
         larghezza_m, altezza_m, produzione_annua_kwh, attivo, origine
    FROM public.fv_pannelli_layout
   WHERE progetto_id = v_src.id;

  INSERT INTO public.fv_calcolo_finanziario
  SELECT (jsonb_populate_record(
    NULL::public.fv_calcolo_finanziario,
    to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'progetto_id', v_nuovo, 'created_at', now())
  )).*
    FROM public.fv_calcolo_finanziario c
   WHERE c.progetto_id = v_src.id
     AND c.attivo;

  RETURN v_nuovo;
END;
$function$;

REVOKE ALL ON FUNCTION public.fv_duplica_progetto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fv_duplica_progetto(uuid) TO authenticated;
