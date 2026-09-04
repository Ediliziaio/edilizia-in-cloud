-- Ondata 2.1 — la scheda cliente vede anche i preventivi dei verticali
--
-- Tre cose trovate guardando i dati, che cambiano la ricetta del briefing:
--
-- 1. LA COLONNA C'È GIÀ. Tutti e dieci i verticali hanno `cliente_id`, che
--    punta a marketing_contacts. Non va aggiunta.
--
-- 2. L'ABBINAMENTO UNA TANTUM NON RECUPEREREBBE NIENTE. I progetti senza
--    riferimento sono 26 su 43, tutti del fotovoltaico, e non hanno né email né
--    telefono né nome del cliente: non esiste una chiave su cui abbinarli.
--
-- 3. IL BUCO VERO È CHE NESSUNO GUARDA LÌ. CompanyCustomerDetail cerca i
--    preventivi solo in `quotes`:
--        .from("quotes").eq("contact_id", customer.marketing_contact_id)
--        oppure  .eq("client_email", email)
--    I progetti dei verticali vivono in dieci tabelle separate e non vengono
--    interrogati mai: anche con `cliente_id` scritto alla perfezione, la scheda
--    non li vedrebbe. Non è un dato mancante, è che nessuno guarda lì.
--    In più il ponte anagrafico (profiles.marketing_contact_id) è valorizzato
--    su 0 clienti su 943, perché collega solo per partita IVA o codice fiscale
--    e i clienti non ne hanno (0 su 943 con P.IVA).
--
-- Questa funzione risponde alla domanda che la scheda deve fare — «tutto quello
-- che ho preventivato a questo cliente» — cercando in `quotes` e nei verticali,
-- e risolvendo l'identità con tutte le chiavi disponibili: il ponte se c'è,
-- altrimenti l'email, altrimenti il telefono.
--
-- Il corpo si GENERA dal catalogo invece di essere scritto a mano dieci volte,
-- perché i dieci schemi non sono uguali: `code` c'è in nove su dieci (il
-- fotovoltaico usa `numero`), `totale` in otto, `tipo_intervento` in nove. Un
-- verticale nuovo entra da solo, senza che nessuno si ricordi di aggiungerlo.
--
-- Prova, su un cliente vero dell'azienda demo:
--   prima  la scheda vede 0 preventivi
--   creato un progetto rst da 24.000 € per il contatto con la stessa email
--   la scheda continua a vedere 0
--   la funzione trova  rst ZZ-RST-001 24000 (agganciato per contatto)

DO $genera$
DECLARE
  t        record;
  v_rami   text := '';
  v_codice text;
  v_titolo text;
  v_totale text;
  v_corpo  text;
BEGIN
  FOR t IN
    SELECT c.table_name::text AS tab, replace(c.table_name::text, '_progetti', '') AS sigla,
           array_agg(c.column_name::text) AS colonne
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name::text LIKE '%\_progetti'
    GROUP BY c.table_name
    HAVING array_agg(c.column_name::text) @> ARRAY['company_id','cliente_id','cliente_email','cliente_telefono','stato','created_at']
    ORDER BY c.table_name
  LOOP
    v_codice := CASE WHEN 'code'   = ANY(t.colonne) THEN 'p.code'
                     WHEN 'numero' = ANY(t.colonne) THEN 'p.numero'
                     ELSE 'NULL::text' END;
    v_titolo := CASE WHEN 'tipo_intervento' = ANY(t.colonne) THEN 'p.tipo_intervento'
                     WHEN 'titolo'          = ANY(t.colonne) THEN 'p.titolo'
                     ELSE 'NULL::text' END;
    v_totale := CASE WHEN 'totale'                     = ANY(t.colonne) THEN 'p.totale'
                     WHEN 'prezzo_vendita_iva_inclusa' = ANY(t.colonne) THEN 'p.prezzo_vendita_iva_inclusa'
                     WHEN 'totale_max'                 = ANY(t.colonne) THEN 'p.totale_max'
                     ELSE 'NULL::numeric' END;

    v_rami := v_rami || format($ramo$
    UNION ALL
    SELECT %L::text, p.id, %s::text, %s::text, %s::numeric, p.stato::text, p.created_at,
           CASE WHEN v_contact IS NOT NULL AND p.cliente_id = v_contact THEN 'contatto'
                WHEN v_email IS NOT NULL AND lower(btrim(p.cliente_email)) = v_email THEN 'email'
                ELSE 'telefono' END
    FROM public.%I p
    WHERE p.company_id = v_company
      AND ( (v_contact IS NOT NULL AND p.cliente_id = v_contact)
         OR (v_email   IS NOT NULL AND lower(btrim(p.cliente_email)) = v_email)
         OR (v_tel     IS NOT NULL AND nullif(regexp_replace(coalesce(p.cliente_telefono,''), '[^0-9]', '', 'g'),'') = v_tel) )$ramo$,
      t.sigla, v_codice, v_titolo, v_totale, t.tab);
  END LOOP;

  IF v_rami = '' THEN
    RAISE EXCEPTION 'nessuna tabella *_progetti riconosciuta: la funzione sarebbe vuota';
  END IF;

  v_corpo := format($fn$
CREATE OR REPLACE FUNCTION public.cliente_preventivi_e_progetti(p_customer_id uuid)
RETURNS TABLE(
  origine text, id uuid, codice text, titolo text, totale numeric,
  stato text, creato_il timestamptz, agganciato_da text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $corpo$
DECLARE
  v_company uuid; v_contact uuid; v_email text; v_tel text;
BEGIN
  SELECT pr.company_id, pr.marketing_contact_id,
         nullif(lower(btrim(pr.email)), ''),
         nullif(regexp_replace(coalesce(pr.phone,''), '[^0-9]', '', 'g'), '')
    INTO v_company, v_contact, v_email, v_tel
  FROM public.profiles pr WHERE pr.id = p_customer_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Cliente non trovato' USING ERRCODE = 'P0002';
  END IF;
  IF public.user_can_access_company(v_company) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  -- Il ponte anagrafico se qualcuno l'ha scritto; altrimenti si prova a
  -- ricavarlo ora dall'email, senza scrivere niente: questa funzione legge.
  IF v_contact IS NULL AND v_email IS NOT NULL THEN
    SELECT mc.id INTO v_contact
    FROM public.marketing_contacts mc
    WHERE mc.company_id = v_company AND lower(btrim(mc.email)) = v_email
      AND mc.deleted_at IS NULL
    LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT 'quotes'::text, q.id, q.quote_number::text, q.title::text, q.total::numeric,
         q.status::text, q.created_at,
         CASE WHEN v_contact IS NOT NULL AND q.contact_id = v_contact THEN 'contatto' ELSE 'email' END
  FROM public.quotes q
  WHERE q.company_id = v_company
    AND ( (v_contact IS NOT NULL AND q.contact_id = v_contact)
       OR (v_email   IS NOT NULL AND lower(btrim(q.client_email)) = v_email) )
  %s
  ORDER BY 7 DESC;
END;
$corpo$;
$fn$, v_rami);

  EXECUTE v_corpo;
END;
$genera$;

COMMENT ON FUNCTION public.cliente_preventivi_e_progetti(uuid) IS
  'Tutto cio che e stato preventivato a un cliente: quotes piu i verticali. Il corpo e generato dal catalogo, cosi i verticali nuovi entrano da soli e le differenze di schema non vanno ricopiate a mano.';

REVOKE ALL ON FUNCTION public.cliente_preventivi_e_progetti(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliente_preventivi_e_progetti(uuid) TO authenticated, service_role;
