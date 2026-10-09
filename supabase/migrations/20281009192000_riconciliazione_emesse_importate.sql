-- Ricostruisce l'anagrafica di fatturazione senza generare lead, email, account o commesse.
-- I clienti operativi mancanti passano dalla creazione cliente esistente, con portale OFF.
CREATE OR REPLACE FUNCTION public.riconcilia_cliente_emessa_importata(
  p_company_id uuid, p_invoice_id uuid, p_apply boolean DEFAULT false, p_order_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
SET lock_timeout = '3s' SET statement_timeout = '15s'
AS $$
DECLARE
  f public.invoices%ROWTYPE;
  a public.anagrafiche_native%ROWTYPE;
  cf text; iva text; cliente uuid; contatto uuid; anagrafica uuid;
  candidati uuid[]; quanti integer; puo_clienti boolean; puo_ordini boolean;
  servizio boolean := coalesce(auth.role(), '') = 'service_role';
BEGIN
  IF p_company_id IS NULL OR p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Azienda e fattura obbligatorie' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_company_access(p_company_id);
  puo_clienti := servizio OR public.has_role(auth.uid(), 'super_admin') OR public.e_amministratore_di(p_company_id);
  puo_ordini := puo_clienti;
  IF NOT puo_clienti AND NOT public.utente_bloccato() THEN
    -- Permessi di QUESTA azienda e solo per ruoli interni, mai cliente/contabile.
    IF EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND (
        (p.company_id = p_company_id AND EXISTS (SELECT 1 FROM public.user_roles r
          WHERE r.user_id = p.id AND r.role IN ('company_staff', 'salesperson', 'company_admin')))
        OR EXISTS (SELECT 1 FROM public.multi_company_access m WHERE m.user_id = p.id AND m.company_id = p_company_id
          AND m.status = 'active' AND m.access_role IN ('company_staff', 'salesperson', 'company_admin')
          AND (m.expires_at IS NULL OR m.expires_at > now()))
      )
    ) THEN
      SELECT coalesce(can_edit_customers, false) OR coalesce(can_edit_orders, false), coalesce(can_edit_orders, false)
        INTO puo_clienti, puo_ordini FROM public.staff_permissions
        WHERE user_id = auth.uid() AND company_id = p_company_id;
    END IF;
  END IF;
  IF NOT coalesce(puo_clienti, false) OR (p_order_id IS NOT NULL AND NOT coalesce(puo_ordini, false)) THEN
    RAISE EXCEPTION 'Permesso di modifica clienti/commesse richiesto' USING ERRCODE = '42501';
  END IF;
  IF p_apply THEN
    -- Serializza il recupero dello stesso cliente anche da fatture diverse; non serve un UNIQUE sul CF storico.
    PERFORM pg_advisory_xact_lock(hashtextextended('emesse-clienti:' || p_company_id::text, 0));
  END IF;
  SELECT * INTO f FROM public.invoices WHERE id = p_invoice_id AND company_id = p_company_id
    AND deleted_at IS NULL AND external_provider IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fattura importata non trovata' USING ERRCODE = 'P0002'; END IF;
  IF p_apply THEN
    SELECT * INTO f FROM public.invoices WHERE id = p_invoice_id AND company_id = p_company_id
      AND deleted_at IS NULL AND external_provider IS NOT NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fattura importata non trovata' USING ERRCODE = 'P0002'; END IF;
  END IF;
  cf := public.norm_id_fiscale(f.client_fiscal_code);
  iva := public.norm_id_fiscale(f.client_vat_number);
  IF (cf IS NULL AND iva IS NULL) OR (cf IS NOT NULL AND NOT public.codice_fiscale_valido(cf))
      OR (iva IS NOT NULL AND NOT public.piva_valida(iva)) THEN
    RETURN jsonb_build_object('status','da_verificare','motivo','CF/P.IVA assenti o non validi: nessun cliente creato.', 'order_id',f.order_id);
  END IF;

  -- Conta TUTTE le corrispondenze, non prende la prima; conflitti CF/P.IVA richiedono verifica.
  SELECT array_agg(p.id) INTO candidati FROM public.profiles p
    WHERE p.company_id = p_company_id AND p.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'customer')
      AND ((cf IS NOT NULL AND public.norm_id_fiscale(p.fiscal_code) = cf)
        OR (iva IS NOT NULL AND public.norm_id_fiscale(p.vat_number) = iva));
  IF coalesce(cardinality(candidati),0) > 1 THEN
    RETURN jsonb_build_object('status','da_verificare','motivo','Più clienti hanno lo stesso CF/P.IVA.', 'order_id',f.order_id);
  END IF;
  cliente := candidati[1];
  IF cliente IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cliente AND (
      (cf IS NOT NULL AND public.norm_id_fiscale(p.fiscal_code) IS NOT NULL AND public.norm_id_fiscale(p.fiscal_code) <> cf)
      OR (iva IS NOT NULL AND public.norm_id_fiscale(p.vat_number) IS NOT NULL AND public.norm_id_fiscale(p.vat_number) <> iva))) THEN
    RETURN jsonb_build_object('status','da_verificare','motivo','Dati fiscali del cliente in conflitto con la fattura.', 'order_id',f.order_id);
  END IF;
  SELECT array_agg(m.id) INTO candidati FROM public.marketing_contacts m
    WHERE m.company_id = p_company_id AND m.deleted_at IS NULL
      AND ((cf IS NOT NULL AND public.norm_id_fiscale(m.fiscal_code) = cf)
        OR (iva IS NOT NULL AND public.norm_id_fiscale(m.vat_number) = iva));
  contatto := CASE WHEN cardinality(candidati) = 1 THEN candidati[1] ELSE NULL END;
  SELECT array_agg(n.id) INTO candidati FROM public.anagrafiche_native n
    WHERE n.company_id = p_company_id
      AND ((cf IS NOT NULL AND public.norm_id_fiscale(n.codice_fiscale) = cf)
        OR (iva IS NOT NULL AND public.norm_id_fiscale(n.partita_iva) = iva));
  quanti := coalesce(cardinality(candidati),0);
  IF quanti > 1 THEN
    RETURN jsonb_build_object('status','da_verificare','motivo','Più anagrafiche fiscali corrispondono: evita un duplicato.', 'customer_id',cliente,'order_id',f.order_id);
  END IF;
  anagrafica := candidati[1];
  IF anagrafica IS NOT NULL THEN
    SELECT * INTO a FROM public.anagrafiche_native WHERE id = anagrafica AND company_id = p_company_id;
    IF NOT coalesce(a.attivo, true) OR a.tipo = 'fornitore'
        OR (a.cliente_id IS NOT NULL AND a.cliente_id IS DISTINCT FROM cliente)
        OR (cf IS NOT NULL AND public.norm_id_fiscale(a.codice_fiscale) IS NOT NULL AND public.norm_id_fiscale(a.codice_fiscale) <> cf)
        OR (iva IS NOT NULL AND public.norm_id_fiscale(a.partita_iva) IS NOT NULL AND public.norm_id_fiscale(a.partita_iva) <> iva) THEN
      RETURN jsonb_build_object('status','da_verificare','motivo','Anagrafica esistente inattiva o con collegamento/dati diversi.', 'customer_id',cliente,'order_id',f.order_id);
    END IF;
  END IF;
  IF p_order_id IS NOT NULL THEN
    IF cliente IS NULL OR NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id=p_order_id AND o.company_id=p_company_id
      AND o.customer_id=cliente AND o.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'La commessa non appartiene a questo cliente e azienda' USING ERRCODE='42501';
    END IF;
    IF f.order_id IS NOT NULL AND f.order_id <> p_order_id THEN
      RAISE EXCEPTION 'Fattura già collegata: non sovrascrivere la commessa' USING ERRCODE='23505';
    END IF;
  END IF;
  IF p_apply THEN
    IF anagrafica IS NULL THEN
      IF nullif(btrim(f.client_company_name),'') IS NULL THEN
        RETURN jsonb_build_object('status','da_verificare','motivo','Intestatario assente: verifica il documento.');
      END IF;
      INSERT INTO public.anagrafiche_native(company_id,tipo,tipo_soggetto,tipo_cliente,ragione_sociale,
        partita_iva,codice_fiscale,indirizzo_via,indirizzo_comune,indirizzo_cap,indirizzo_nazione,
        codice_sdi,pec,email,cliente_id,sync_from_cliente,note)
      VALUES(p_company_id,'cliente',CASE WHEN coalesce(nullif(f.client_country,''),'IT') <> 'IT' THEN 'estero' WHEN iva IS NULL OR length(cf)=16 THEN 'fisico' ELSE 'giuridico' END,
        CASE WHEN coalesce(nullif(f.client_country,''),'IT') <> 'IT' THEN 'Estero' WHEN iva IS NULL THEN 'B2C' ELSE 'B2B' END, f.client_company_name,iva,cf,
        f.client_address,f.client_city,f.client_zip,coalesce(nullif(f.client_country,''),'IT'),
        f.client_sdi_code,f.client_pec,f.client_email,cliente,false,
        'Anagrafica recuperata dalla fattura importata ' || f.invoice_number || '. Indirizzo di fatturazione, non del cantiere.')
      RETURNING id INTO anagrafica;
    ELSE
      UPDATE public.anagrafiche_native SET
        cliente_id=coalesce(cliente_id,cliente),
        sync_from_cliente=CASE WHEN cliente_id IS NULL AND cliente IS NOT NULL THEN false ELSE sync_from_cliente END,
        codice_fiscale=coalesce(nullif(btrim(codice_fiscale),''),cf),
        partita_iva=coalesce(nullif(btrim(partita_iva),''),iva),
        indirizzo_via=coalesce(nullif(btrim(indirizzo_via),''),nullif(btrim(f.client_address),'')),
        indirizzo_comune=coalesce(nullif(btrim(indirizzo_comune),''),nullif(btrim(f.client_city),'')),
        indirizzo_cap=coalesce(nullif(btrim(indirizzo_cap),''),nullif(btrim(f.client_zip),'')),
        codice_sdi=coalesce(nullif(btrim(codice_sdi),''),nullif(btrim(f.client_sdi_code),'')),
        pec=coalesce(nullif(btrim(pec),''),nullif(btrim(f.client_pec),'')),
        email=coalesce(nullif(btrim(email),''),nullif(btrim(f.client_email),''))
      WHERE id=anagrafica AND company_id=p_company_id AND (
        (cliente_id IS NULL AND cliente IS NOT NULL)
        OR (nullif(btrim(codice_fiscale),'') IS NULL AND cf IS NOT NULL)
        OR (nullif(btrim(partita_iva),'') IS NULL AND iva IS NOT NULL)
        OR (nullif(btrim(indirizzo_via),'') IS NULL AND nullif(btrim(f.client_address),'') IS NOT NULL)
        OR (nullif(btrim(indirizzo_comune),'') IS NULL AND nullif(btrim(f.client_city),'') IS NOT NULL)
        OR (nullif(btrim(indirizzo_cap),'') IS NULL AND nullif(btrim(f.client_zip),'') IS NOT NULL)
        OR (nullif(btrim(codice_sdi),'') IS NULL AND nullif(btrim(f.client_sdi_code),'') IS NOT NULL)
        OR (nullif(btrim(pec),'') IS NULL AND nullif(btrim(f.client_pec),'') IS NOT NULL)
        OR (nullif(btrim(email),'') IS NULL AND nullif(btrim(f.client_email),'') IS NOT NULL)
      );
    END IF;
    -- Non crea contatti CRM: altrimenti lo storico farebbe partire automazioni contact_created.
    IF (f.client_id IS NULL AND contatto IS NOT NULL) OR (p_order_id IS NOT NULL AND f.order_id IS NULL) THEN
      UPDATE public.invoices SET client_id=coalesce(client_id,contatto),order_id=coalesce(order_id,p_order_id),
        order_match_origine=CASE WHEN order_id IS NULL AND p_order_id IS NOT NULL THEN 'manuale' ELSE order_match_origine END
      WHERE id=f.id AND company_id=p_company_id;
    END IF;
  END IF;
  RETURN jsonb_build_object('status','ok','anagrafica_id',anagrafica,'customer_id',cliente,
    'contact_id',contatto,'order_id',coalesce(f.order_id,p_order_id),'crea_anagrafica',quanti=0,
    'cliente_operativo_mancante',cliente IS NULL,'applicato',p_apply);
END;
$$;
REVOKE ALL ON FUNCTION public.riconcilia_cliente_emessa_importata(uuid,uuid,boolean,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.riconcilia_cliente_emessa_importata(uuid,uuid,boolean,uuid) TO authenticated,service_role;
