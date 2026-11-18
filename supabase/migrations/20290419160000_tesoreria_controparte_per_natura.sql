-- ════════════════════════════════════════════════════════════════════════════
-- Tesoreria: la controparte di un movimento, per natura e con un nome certo
-- (18/11/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- La colonna «Controparte» mostra chi sta dall'altra parte del movimento. Quando
-- la banca non manda il nome — su Impresa Vulcano, 482 movimenti su 482 — finora
-- restava il trattino, o un nome ricavato leggendo la causale.
--
-- Ma il nome quasi sempre lo sappiamo già, e con certezza:
--   · il documento abbinato (linked_cost_id / linked_invoice_id) ha il suo fornitore o cliente;
--   · `tesoreria_esiti.risultato` porta la controparte del candidato forte, calcolata dal motore
--     (su Vulcano: 126 movimenti) e fin qui buttata via;
--   · la natura dice il resto: una commissione, un anticipo fatture, un rientro di finanziamento
--     o una distinta RiBa hanno come controparte LA BANCA DEL CONTO (156), un F24 l'Agenzia delle
--     Entrate (54), un giroconto l'ALTRO CONTO dell'azienda (8).
-- Restano 141 movimenti «sconosciuta», dove la causale è l'unica strada e decide l'interfaccia.
--
-- Qui nasce la regola unica, in un posto solo, perché la stessa risposta serva alla tesoreria,
-- alla prima nota, allo scadenzario e al controllo di gestione: chi mostra un movimento chiede
-- la controparte a questa funzione, non la reinventa.
--
-- `certa`: il nome viene da un documento, dal motore o dalla natura. Falso quando è dedotto:
-- l'interfaccia lo scrive in grigio e lo dice.
--
-- Idempotente: CREATE OR REPLACE.
-- ════════════════════════════════════════════════════════════════════════════

-- La banca del conto: «BPER Banca», «BCC Busto Garolfo e Buguggiate». Senza connessione (conti a
-- mano) resta il nome del conto, che almeno distingue; mai l'intestatario, che siamo noi.
CREATE OR REPLACE FUNCTION private.tes_banca_del_conto(p_company uuid, p_account uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce(nullif(btrim(c.institution_name), ''), nullif(btrim(a.display_name), ''))
    FROM public.bank_accounts a
    LEFT JOIN public.bank_connections c ON c.id = a.connection_id
   WHERE a.id = p_account AND a.company_id = p_company
$function$;

-- Il nome dell'altro conto in un giroconto: banca e ultime quattro cifre dell'IBAN, così fra otto
-- conti si capisce quale. Senza la gamba opposta, il conto stesso.
CREATE OR REPLACE FUNCTION private.tes_altro_conto(p_company uuid, p_account uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce(nullif(btrim(c.institution_name), ''), nullif(btrim(a.display_name), ''), 'Altro conto')
         || coalesce(' ···' || right(nullif(btrim(a.iban), ''), 4), '')
    FROM public.bank_accounts a
    LEFT JOIN public.bank_connections c ON c.id = a.connection_id
   WHERE a.id = p_account AND a.company_id = p_company
$function$;

/**
 * La controparte di un movimento: {nome, certa, origine}.
 *
 * origine: 'banca' (l'ha mandata la banca) · 'documento' (il documento abbinato) ·
 *          'motore' (il candidato forte dell'esito) · 'istituto' · 'ente' · 'conto' ·
 *          null quando non si sa (l'interfaccia prova con la causale).
 */
CREATE OR REPLACE FUNCTION private.tes_controparte(p_company uuid, p_tx uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  t public.bank_transactions%rowtype;
  v_nome text;
  v_natura text;
  v_altro uuid;
BEGIN
  SELECT * INTO t FROM public.bank_transactions WHERE id = p_tx AND company_id = p_company;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- 1. Quello che ha mandato la banca, quando c'è: è la fonte più attendibile.
  --    In uscita paghiamo il creditore, in entrata ci paga il debitore.
  v_nome := nullif(btrim(coalesce(
    CASE WHEN coalesce(t.amount, 0) < 0 THEN t.creditor_name ELSE t.debtor_name END,
    t.counterparty_name)), '');
  IF v_nome IS NOT NULL THEN
    RETURN jsonb_build_object('nome', v_nome, 'certa', true, 'origine', 'banca');
  END IF;

  -- 2. Il documento abbinato: il fornitore del costo, il cliente della fattura emessa.
  IF t.linked_cost_id IS NOT NULL THEN
    SELECT nullif(btrim(s.name), '') INTO v_nome
      FROM public.company_costs cc
      JOIN public.suppliers s ON s.id = cc.supplier_id AND s.company_id = cc.company_id
     WHERE cc.id = t.linked_cost_id AND cc.company_id = p_company;
    IF v_nome IS NOT NULL THEN
      RETURN jsonb_build_object('nome', v_nome, 'certa', true, 'origine', 'documento');
    END IF;
  END IF;
  IF t.linked_invoice_id IS NOT NULL THEN
    SELECT nullif(btrim(coalesce(d.cliente_snapshot->>'ragione_sociale',
             btrim(concat_ws(' ', d.cliente_snapshot->>'nome', d.cliente_snapshot->>'cognome')))), '')
      INTO v_nome
      FROM public.documenti_fiscali d
     WHERE d.id = t.linked_invoice_id AND d.company_id = p_company;
    IF v_nome IS NOT NULL THEN
      RETURN jsonb_build_object('nome', v_nome, 'certa', true, 'origine', 'documento');
    END IF;
  END IF;

  SELECT e.natura,
         (SELECT nullif(btrim(r->>'controparte'), '')
            FROM jsonb_array_elements(coalesce(e.risultato->'candidati', '[]'::jsonb)) c,
                 jsonb_array_elements(coalesce(c->'righe', '[]'::jsonb)) r
           WHERE nullif(btrim(r->>'controparte'), '') IS NOT NULL
           LIMIT 1)
    INTO v_natura, v_nome
    FROM public.tesoreria_esiti e
   WHERE e.transaction_id = p_tx AND e.company_id = p_company;

  -- 3. Il nome che il motore ha già trovato nel candidato: fornitore o cliente del documento
  --    che quel movimento paga o incassa.
  IF v_nome IS NOT NULL THEN
    RETURN jsonb_build_object('nome', v_nome, 'certa', true, 'origine', 'motore');
  END IF;

  -- 4. La natura. Commissioni, canoni, bolli, interessi, anticipi su fatture, rientri di
  --    finanziamento e distinte RiBa sono rapporti con la banca che tiene il conto.
  IF v_natura IN ('spesa_bancaria', 'anticipo_fatture', 'finanziamento', 'riba_distinta') THEN
    v_nome := private.tes_banca_del_conto(p_company, t.account_id);
    IF v_nome IS NOT NULL THEN
      RETURN jsonb_build_object('nome', v_nome, 'certa', true, 'origine', 'istituto');
    END IF;
  END IF;
  IF v_natura = 'f24' THEN
    RETURN jsonb_build_object('nome', 'Agenzia delle Entrate', 'certa', true, 'origine', 'ente');
  END IF;
  -- Giroconto: l'altro conto dell'azienda. La gamba opposta è il movimento di segno contrario e
  -- importo uguale, sullo stesso giorno, su un altro conto nostro.
  IF v_natura = 'giroconto' THEN
    SELECT o.account_id INTO v_altro
      FROM public.bank_transactions o
     WHERE o.company_id = p_company AND o.account_id <> t.account_id
       AND o.amount = -t.amount
       AND abs(coalesce(o.booking_date, o.value_date) - coalesce(t.booking_date, t.value_date)) <= 3
     ORDER BY abs(coalesce(o.booking_date, o.value_date) - coalesce(t.booking_date, t.value_date))
     LIMIT 1;
    IF v_altro IS NOT NULL THEN
      RETURN jsonb_build_object('nome', private.tes_altro_conto(p_company, v_altro), 'certa', true, 'origine', 'conto');
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;

/**
 * Le controparti di un elenco di movimenti, in una chiamata sola: { "<id>": {nome, certa, origine} }.
 * Chi mostra i movimenti (tesoreria, prima nota, scadenzario, controllo di gestione) chiede qui.
 */
CREATE OR REPLACE FUNCTION public.tesoreria_controparti(p_company uuid, p_movimenti uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb := '{}'::jsonb;
  r record;
  v_cp jsonb;
BEGIN
  PERFORM public.assert_company_access(p_company);
  IF p_movimenti IS NULL OR cardinality(p_movimenti) = 0 THEN RETURN v; END IF;
  IF cardinality(p_movimenti) > 500 THEN
    RAISE EXCEPTION 'Troppi movimenti in una volta: al massimo 500.' USING ERRCODE = '22023';
  END IF;
  FOR r IN SELECT unnest(p_movimenti) AS id LOOP
    v_cp := private.tes_controparte(p_company, r.id);
    IF v_cp IS NOT NULL THEN v := v || jsonb_build_object(r.id::text, v_cp); END IF;
  END LOOP;
  RETURN v;
END;
$function$;

REVOKE ALL ON FUNCTION private.tes_banca_del_conto(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tes_altro_conto(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tes_controparte(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tesoreria_controparti(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_controparti(uuid, uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.tesoreria_controparti(uuid, uuid[]) IS
  'Chi sta dall''altra parte di ogni movimento: nome certo dal documento, dal motore o dalla natura '
  '(banca del conto, Agenzia delle Entrate, altro conto). Null dove non si sa: lì decide la causale.';
