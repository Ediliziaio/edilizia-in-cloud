-- Contabilità → «Da verificare» (piano punti aperti 16/11/2026, §10; deciso il 16/11).
--
-- La lista mostra ciò che trova cdg_controllo_doppi(azienda), una riga per anomalia, con il
-- pulsante che apre ogni documento coinvolto. Nessuna correzione automatica: si guarda e si
-- sistema a mano.
--   * cdg_da_verificare(azienda): gli stessi rilievi, più `documenti` (tipo, id, titolo e cosa
--     serve per aprirlo: origine della fattura, movimento di banca della prima nota) e una
--     `chiave` stabile per riga.
--   * I costi annullati (20290417100000) non sono più un'anomalia: importo 0 e scadenze chiuse.
--     cdg_controllo_doppi li salta nei controlli 3, 6 e 7.

-- ── I costi annullati escono dai controlli ───────────────────────────────────
DO $cdg$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.cdg_controllo_doppi(uuid)'::regprocedure);
  IF position('annullato_il' IN d) > 0 THEN RETURN; END IF;
  n := replace(d, $a$WHERE cc.company_id=p_company AND coalesce(cc.senza_fattura,false) AND coalesce(cc.notes,'')~$a$,
                  $a$WHERE cc.company_id=p_company AND cc.annullato_il IS NULL AND coalesce(cc.senza_fattura,false) AND coalesce(cc.notes,'')~$a$);
  n := replace(n, $a$WHERE cc.company_id=p_company AND jsonb_typeof(cc.allocations)='array'$a$,
                  $a$WHERE cc.company_id=p_company AND cc.annullato_il IS NULL AND jsonb_typeof(cc.allocations)='array'$a$);
  n := replace(n, $a$WHERE fr.company_id=p_company AND cc.purchase_order_id IS NULL$a$,
                  $a$WHERE fr.company_id=p_company AND cc.annullato_il IS NULL AND cc.purchase_order_id IS NULL$a$);
  IF (length(n) - length(replace(n, 'annullato_il', ''))) / length('annullato_il') <> 3 THEN
    RAISE EXCEPTION 'cdg_controllo_doppi: forma inattesa, i costi annullati non si sono esclusi';
  END IF;
  EXECUTE n;
END $cdg$;

-- ── Cosa c'è dietro un id: il documento da aprire ────────────────────────────
CREATE OR REPLACE FUNCTION private.cdg_documento_da_aprire(p_company uuid, p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object('tipo', 'movimento', 'id', t.id,
              'titolo', concat_ws(' · ', 'Movimento del ' || to_char(t.booking_date, 'DD/MM/YYYY'), left(coalesce(t.description, t.reference, ''), 50)))
       FROM public.bank_transactions t WHERE t.id = p_id AND t.company_id = p_company),
    (SELECT jsonb_build_object('tipo', 'fattura_emessa', 'id', d.id, 'origine', coalesce(d.origine, 'nativa'),
              'titolo', 'Fattura ' || coalesce(d.numero, 'senza numero'))
       FROM public.documenti_fiscali_elenco_operativo d WHERE d.id = p_id AND d.company_id = p_company),
    (SELECT jsonb_build_object('tipo', 'costo', 'id', c.id, 'titolo', 'Costo «' || coalesce(c.name, '') || '»')
       FROM public.company_costs c WHERE c.id = p_id AND c.company_id = p_company),
    (SELECT jsonb_build_object('tipo', 'scadenza', 'id', s.id, 'costo_id', s.cost_id,
              'titolo', 'Scadenza «' || coalesce(s.description, '') || '»' || coalesce(' del ' || to_char(s.due_date, 'DD/MM/YYYY'), ''))
       FROM public.scadenze s WHERE s.id = p_id AND s.company_id = p_company),
    (SELECT jsonb_build_object('tipo', 'fattura_ricevuta', 'id', f.id, 'numero', f.numero_fattura,
              'titolo', 'Fattura ricevuta ' || coalesce(f.numero_fattura, 'senza numero'))
       FROM public.fatture_ricevute f WHERE f.id = p_id AND f.company_id = p_company),
    (SELECT jsonb_build_object('tipo', 'prima_nota', 'id', p.id, 'movimento_id', p.bank_transaction_id,
              'titolo', 'Prima nota del ' || to_char(p.entry_date, 'DD/MM/YYYY') || ' · ' || coalesce(left(p.description, 40), ''))
       FROM public.prima_nota_entries p WHERE p.id = p_id AND p.company_id = p_company),
    jsonb_build_object('tipo', 'sconosciuto', 'id', p_id, 'titolo', 'Documento'))
$$;
REVOKE ALL ON FUNCTION private.cdg_documento_da_aprire(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── La lista ─────────────────────────────────────────────────────────────────
-- Stessi permessi di cdg_controllo_doppi (controllo di gestione o tesoreria), che la funzione chiama.
CREATE OR REPLACE FUNCTION public.cdg_da_verificare(p_company uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE r jsonb;
BEGIN
  r := public.cdg_controllo_doppi(p_company);
  RETURN coalesce((
    SELECT jsonb_agg(x || jsonb_build_object(
             'chiave', md5((x->>'controllo') || ':' || (x->'ids')::text),
             'documenti', (SELECT coalesce(jsonb_agg(private.cdg_documento_da_aprire(p_company, (i #>> '{}')::uuid) ORDER BY o), '[]')
                             FROM jsonb_array_elements(x->'ids') WITH ORDINALITY e(i, o)
                            WHERE (i #>> '{}') ~ '^[0-9a-fA-F-]{36}$'))
           ORDER BY x->>'controllo', (x->>'importo')::numeric DESC NULLS LAST)
      FROM jsonb_array_elements(r) x), '[]');
END $$;
REVOKE ALL ON FUNCTION public.cdg_da_verificare(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cdg_da_verificare(uuid) TO authenticated, service_role;
