-- ════════════════════════════════════════════════════════════════════════════
-- DDT da un'uscita di magazzino: causale giusta, indirizzo pulito, dati di trasporto
-- ════════════════════════════════════════════════════════════════════════════
-- Richiesta di Florin del 29/10/2026: «migliora il magazzino e i DDT di uscita».
--
-- Provato su Demo 2 (transazione annullata, uscita U-2026-0004 verso un
-- cantiere): `create_ddt_from_uscita` funziona, ma
--   · la causale era sempre «Vendita», con la maiuscola: per materiale portato
--     su un proprio cantiere non è una vendita, e nell'editor «Vendita» non
--     corrisponde a nessuna voce (i codici sono minuscoli: `vendita`…), quindi
--     la tendina restava vuota e il PDF stampava il testo grezzo;
--   · l'indirizzo usciva «Via Manzoni 8, 00187 Roma,»: la virgola finale della
--     provincia vuota (concat_ws salta i NULL, non le stringhe vuote);
--   · per un cantiere senza indirizzo nello snapshot non si guardava la
--     commessa (indirizzo dei lavori);
--   · 3 uscite verso un cantiere (Demo 2) non hanno lo snapshot del
--     destinatario: il DDT si fermava su `cliente_snapshot` NOT NULL e non si
--     poteva creare affatto.
--
-- Ora:
--   · causale: quella scelta in `p_ddt_extra.causale_trasporto`; altrimenti
--     `trasferimento_cantiere` per un cantiere, `vendita` per gli altri. Stessa
--     regola di `causalePerDestinatario` in src/lib/ddt/causaliTrasporto.ts;
--   · indirizzo: pezzi vuoti saltati; per un cantiere, se lo snapshot non ha
--     la via, l'indirizzo dei lavori della commessa;
--   · destinatario mancante: per un cantiere si ricostruisce dalla commessa
--     (cliente, altrimenti «Commessa <codice>», e indirizzo dei lavori); per
--     un destinatario libero dai dati scritti a mano;
--   · i DDT esistenti con la causale scritta come etichetta («Vendita»,
--     «Trasferimento a cantiere») passano al codice. Sono 1 riga, misurato il
--     29/10/2026.
--
-- Stessa firma, stesso tipo restituito, stesse sicurezze (SECURITY DEFINER,
-- azienda di chi chiama, permesso DDT). Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.create_ddt_from_uscita(p_uscita_id uuid, p_ddt_extra jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(documento_id uuid, numero_ddt text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid := public.get_my_company_id();
  v_u public.warehouse_uscite%ROWTYPE;
  v_year integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_numero_ddt text; v_progressivo integer; v_documento_id uuid;
  v_indirizzo text;
  v_causale text;
  v_snapshot jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'No company context'; END IF;
  IF NOT public.puo_gestire_documento_fiscale(v_company_id, 'ddt') THEN
    RAISE EXCEPTION 'Non hai il permesso di creare DDT (servono magazzino, commesse o «Fatturazione»).' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_u FROM public.warehouse_uscite WHERE id = p_uscita_id AND company_id = v_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Uscita non trovata'; END IF;
  IF v_u.documento_id IS NOT NULL THEN
    RETURN QUERY SELECT v_u.documento_id, (SELECT numero FROM public.documenti_fiscali WHERE id = v_u.documento_id);
    RETURN;
  END IF;
  IF jsonb_array_length(COALESCE(v_u.righe,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Uscita senza righe'; END IF;

  v_numero_ddt := public.genera_numero_documento_native(v_company_id, 'ddt'::text, v_year);
  v_progressivo := COALESCE(NULLIF(split_part(v_numero_ddt, '-', array_length(string_to_array(v_numero_ddt, '-'), 1)), '')::integer, 1);

  -- Indirizzo di consegna: quello scritto ora, poi lo snapshot del
  -- destinatario (senza pezzi vuoti), poi il destinatario libero, poi — per un
  -- cantiere — l'indirizzo dei lavori della commessa.
  v_indirizzo := COALESCE(
    NULLIF(btrim(p_ddt_extra->>'indirizzo_consegna'), ''),
    NULLIF(btrim(concat_ws(', ',
      NULLIF(btrim(v_u.cliente_snapshot->>'indirizzo_via'), ''),
      NULLIF(btrim(concat_ws(' ',
        NULLIF(btrim(v_u.cliente_snapshot->>'indirizzo_cap'), ''),
        NULLIF(btrim(v_u.cliente_snapshot->>'indirizzo_comune'), ''))), ''),
      NULLIF(btrim(v_u.cliente_snapshot->>'indirizzo_provincia'), ''))), ''),
    NULLIF(btrim(v_u.destinatario_libero->>'indirizzo'), ''),
    CASE WHEN v_u.order_id IS NOT NULL THEN
      (SELECT NULLIF(btrim(COALESCE(NULLIF(btrim(o.indirizzo_lavori), ''), NULLIF(btrim(o.work_address), ''))), '')
         FROM public.orders o WHERE o.id = v_u.order_id AND o.company_id = v_company_id)
    END
  );

  -- Il destinatario del documento: lo snapshot dell'uscita; se manca, la
  -- commessa (cantiere) o i dati scritti a mano (libero).
  v_snapshot := v_u.cliente_snapshot;
  IF v_snapshot IS NULL OR v_snapshot = '{}'::jsonb THEN
    IF v_u.order_id IS NOT NULL THEN
      SELECT jsonb_strip_nulls(jsonb_build_object(
               'ragione_sociale', COALESCE(
                 NULLIF(btrim(concat_ws(' ', NULLIF(btrim(c.first_name), ''), NULLIF(btrim(c.last_name), ''))), ''),
                 'Commessa ' || o.order_code),
               'indirizzo_via', NULLIF(btrim(COALESCE(NULLIF(btrim(o.indirizzo_lavori), ''), o.work_address)), ''),
               'indirizzo_nazione', 'IT',
               'tipo_cliente', 'B2B'))
        INTO v_snapshot
        FROM public.orders o
        LEFT JOIN public.profiles c ON c.id = o.customer_id
       WHERE o.id = v_u.order_id AND o.company_id = v_company_id;
    ELSIF v_u.destinatario_libero IS NOT NULL THEN
      v_snapshot := jsonb_strip_nulls(jsonb_build_object(
        'ragione_sociale', v_u.destinatario_libero->>'ragione_sociale',
        'partita_iva', v_u.destinatario_libero->>'partita_iva',
        'indirizzo_via', v_u.destinatario_libero->>'indirizzo',
        'indirizzo_nazione', 'IT'));
    END IF;
  END IF;
  v_snapshot := COALESCE(v_snapshot, '{}'::jsonb);

  -- Materiale portato su un proprio cantiere non è una vendita.
  v_causale := COALESCE(
    NULLIF(btrim(p_ddt_extra->>'causale_trasporto'), ''),
    CASE WHEN v_u.destinatario_tipo = 'cantiere' THEN 'trasferimento_cantiere' ELSE 'vendita' END
  );

  INSERT INTO public.documenti_fiscali (
    company_id, tipo, numero, numero_progressivo, anno, data_emissione, stato,
    ordine_id, anagrafica_id, cliente_snapshot, righe, note_documento,
    ddt_causale_trasporto, ddt_aspetto_beni, ddt_numero_colli, ddt_peso,
    ddt_mezzo_trasporto, ddt_porto, ddt_vettore, ddt_indirizzo_consegna
  ) VALUES (
    v_company_id, 'ddt', v_numero_ddt, v_progressivo, v_year, CURRENT_DATE, 'bozza',
    v_u.order_id, v_u.customer_id, v_snapshot, v_u.righe,
    NULLIF(concat_ws(' · ', NULLIF(btrim(p_ddt_extra->>'note_documento'), ''), v_u.note), ''),
    v_causale,
    NULLIF(btrim(p_ddt_extra->>'aspetto_beni'), ''),
    NULLIF(NULLIF(btrim(p_ddt_extra->>'numero_colli'), '')::integer, 0),
    NULLIF(btrim(p_ddt_extra->>'peso'), ''),
    NULLIF(btrim(p_ddt_extra->>'mezzo_trasporto'), ''),
    COALESCE(NULLIF(btrim(p_ddt_extra->>'porto'), ''), 'Franco'),
    COALESCE(v_u.vettore, CASE WHEN NULLIF(btrim(p_ddt_extra->>'vettore'), '') IS NOT NULL THEN jsonb_build_object('descrizione', p_ddt_extra->>'vettore') END),
    CASE WHEN v_indirizzo IS NOT NULL THEN jsonb_build_object('indirizzo', v_indirizzo) END
  ) RETURNING id INTO v_documento_id;

  UPDATE public.warehouse_uscite SET documento_id = v_documento_id, stato = 'ddt_creato', updated_at = now() WHERE id = p_uscita_id;
  UPDATE public.warehouse_movements SET notes = 'Uscita ' || v_u.numero || ' · DDT ' || v_numero_ddt WHERE uscita_id = p_uscita_id;

  RETURN QUERY SELECT v_documento_id, v_numero_ddt;
END;
$function$;

revoke all on function public.create_ddt_from_uscita(uuid, jsonb) from public, anon;
grant execute on function public.create_ddt_from_uscita(uuid, jsonb) to authenticated, service_role;

-- Le causali scritte come etichetta tornano codici, come le scrive l'editor.
update public.documenti_fiscali
   set ddt_causale_trasporto = case ddt_causale_trasporto
         when 'Vendita' then 'vendita'
         when 'Trasferimento a cantiere' then 'trasferimento_cantiere'
       end
 where tipo = 'ddt'
   and ddt_causale_trasporto in ('Vendita', 'Trasferimento a cantiere');
