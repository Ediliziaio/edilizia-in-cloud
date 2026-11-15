-- Conto economico: niente costi doppi o finti dalla banca, ammortamenti veri (15/11/2026)
--
-- Diagnosi (Demo Azienda 2, 2026): la vista dei costi prendeva come COSTO ogni
-- uscita di banca non collegata a una scadenza o a un costo. Ci finivano:
--   - pagamenti di fatture riconciliati per documento, prima nota o pagamento
--     registrato (contava solo la riconciliazione con fattura o scadenza):
--     il costo c'era già dalla fattura, la banca lo aggiungeva una seconda volta;
--   - stipendi (14.800 €) già contati dai cedolini;
--   - F24 e IVA (4.200 €): un versamento non è un costo del periodo;
--   - acquisto di un cespite (890 €): è un investimento, il costo arriva con
--     l'ammortamento;
--   - rate di mutui, giroconti con nome diverso da «giroconto», anticipi.
-- Una riconciliazione bancaria collega il pagamento al documento: non deve
-- generare una seconda rilevazione del costo.
--
-- Adesso un'uscita di banca è un costo solo se:
--   - non è riconciliata con niente e non è il pagamento di un costo
--     registrato (scadenza, costo, prima nota con costo);
--   - la sua voce di cassa (quella confermata o, se manca, quella che dice il
--     testo del movimento: «F24», «tasse», «leasing»…) è della gestione OPERATIVA e non è
--     IVA/tributi (12), anticipi (02, 24, 25) o personale (06, 07) quando
--     l'anno ha i cedolini;
--   - non è un giroconto.
-- La voce di cassa confermata decide anche la riga del conto economico
-- (`private.cassa_macro_ce`): «Carburante» va nei costi produttivi senza
-- dover scrivere una classificazione a mano. Un movimento ripartito porta ogni
-- quota nella sua riga. Una voce solo dedotta dal testo non scavalca la
-- classificazione scritta a mano dall'azienda.
--
-- Ammortamenti: prima costo × aliquota × mesi del periodo per ogni cespite
-- attivo, anche se acquistato a dicembre o già del tutto ammortizzato.
-- Adesso: quota mensile dai mesi in cui il bene è in uso (dal mese di acquisto
-- al mese della dismissione), fino a esaurire il costo storico.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- La riga del conto economico di una voce di cassa, dal codice della sua categoria.
-- NULL: la voce non è un costo di periodo (finanziamenti, investimenti, tributi,
-- giroconti…) o non è mappata (va nei «non classificati»).
create or replace function private.cassa_macro_ce(p_codice text)
returns text language sql immutable set search_path to '' as $$
  select case left(coalesce(p_codice, ''), 2)
    when '04' then 'acquisti_materie'
    when '05' then 'costi_produttivi'
    when '09' then 'costi_produttivi'
    when '26' then 'costi_produttivi'
    when '27' then 'costi_produttivi'
    when '06' then 'costo_personale'
    when '07' then 'costo_personale'
    when '29' then 'costo_personale'
    when '08' then 'costi_amministrativi'
    when '11' then 'costi_amministrativi'
    when '10' then 'costi_commerciali'
    when '13' then 'oneri_finanziari'
    when '31' then 'oneri_finanziari'
    when '35' then 'oneri_finanziari'
    else null end
$$;
revoke all on function private.cassa_macro_ce(text) from public, anon;
-- La vista gira coi permessi di chi la legge: le due tabelle di corrispondenza
-- (pure, senza dati) devono essere eseguibili da chi è autenticato.
grant execute on function private.cassa_macro_ce(text) to authenticated;
grant execute on function private.cassa_codice_da_testo(text) to authenticated;

create or replace view public.v_cg_costi_classificati with (security_invoker = on) as
 WITH costi_company AS (
         SELECT cc.company_id,
            COALESCE(cc.mese_competenza, cc.documento_data, fr.data_fattura, cc.due_date, cc.paid_date) AS data,
            pc.importo,
            pc.categoria AS source_value,
            'company_costs'::text AS source_table,
            NULL::text AS macro_cassa,
            NULL::text AS macro_testo
           FROM company_costs cc
             LEFT JOIN fatture_ricevute fr ON fr.company_cost_id = cc.id
             CROSS JOIN LATERAL costo_parti_categoria(cc.category, cc.amount, cc.ripartizione_categorie) pc(categoria, importo)
          WHERE cc.amount IS NOT NULL
        ), movimenti_bancari AS (
         SELECT bt.company_id,
            COALESCE(bt.value_date, bt.booking_date) AS data,
            q.importo,
            COALESCE(v.nome, bt.category) AS source_value,
            'bank_transactions'::text AS source_table,
            private.cassa_macro_ce(v.codice) AS macro_cassa,
            private.cassa_macro_ce(vt.codice) AS macro_testo
           FROM bank_transactions bt
             CROSS JOIN LATERAL (
               SELECT CASE WHEN bt.cassa_voce_origine = 'proposta' THEN NULL ELSE (x.value ->> 'voce_id')::uuid END AS voce_id,
                      CASE WHEN bt.cassa_ripartizione IS NULL THEN abs(bt.amount) ELSE (x.value ->> 'cents')::numeric / 100 END AS importo
                 FROM jsonb_array_elements(COALESCE(bt.cassa_ripartizione,
                        jsonb_build_array(jsonb_build_object('voce_id', bt.cassa_voce_id)))) x(value)
             ) q
             LEFT JOIN cassa_voci v ON v.id = q.voce_id AND v.company_id = bt.company_id
             LEFT JOIN cassa_voci vt ON v.id IS NULL AND vt.company_id = bt.company_id
                                    AND vt.codice = private.cassa_codice_da_testo(bt.category)
          WHERE bt.amount < 0::numeric AND COALESCE(bt.status, 'booked') = 'booked'
            AND bt.linked_scadenza_id IS NULL AND bt.linked_cost_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM bank_reconciliations br
                             WHERE br.transaction_id = bt.id AND br.unmatched_at IS NULL)
            AND NOT EXISTS (SELECT 1 FROM bank_reconciliations br
                             WHERE br.transaction_id = bt.id AND (br.invoice_id IS NOT NULL OR br.scadenza_id IS NOT NULL))
            AND NOT EXISTS (SELECT 1 FROM prima_nota_entries p
                             WHERE p.bank_transaction_id = bt.id AND p.cost_id IS NOT NULL)
            AND COALESCE(lower(bt.category), ''::text) !~~ 'girocont%'::text
            AND (COALESCE(v.id, vt.id) IS NULL OR (
                  COALESCE(v.sezione, vt.sezione) = 'operativa'
              AND left(COALESCE(v.codice, vt.codice), 2) NOT IN ('02', '12', '21', '23', '24', '25')
              AND NOT (left(COALESCE(v.codice, vt.codice), 2) IN ('06', '07')
                       AND EXISTS (SELECT 1 FROM cedolini ce
                                    WHERE ce.company_id = bt.company_id
                                      AND ce.anno = EXTRACT(year FROM COALESCE(bt.value_date, bt.booking_date))::integer))))
        )
 SELECT u.company_id,
    u.data,
    u.importo,
    u.source_table,
    u.source_value,
    cl.voce_chiave,
    COALESCE(u.macro_cassa, cl.macro_voce, u.macro_testo) AS macro_voce,
    COALESCE(cl.tipo, CASE WHEN COALESCE(u.macro_cassa, u.macro_testo) IN ('acquisti_materie', 'costi_produttivi') THEN 'V'
                           WHEN COALESCE(u.macro_cassa, u.macro_testo) IS NOT NULL THEN 'F' END) AS tipo,
    EXTRACT(year FROM u.data)::integer AS anno,
    EXTRACT(month FROM u.data)::integer AS mese
   FROM ( SELECT costi_company.company_id, costi_company.data, costi_company.importo,
                 costi_company.source_value, costi_company.source_table, costi_company.macro_cassa, costi_company.macro_testo
           FROM costi_company
        UNION ALL
         SELECT movimenti_bancari.company_id, movimenti_bancari.data, movimenti_bancari.importo,
                movimenti_bancari.source_value, movimenti_bancari.source_table, movimenti_bancari.macro_cassa, movimenti_bancari.macro_testo
           FROM movimenti_bancari) u
     LEFT JOIN LATERAL ( SELECT c.voce_chiave, c.macro_voce, c.tipo
           FROM cg_classificazione_voci c
          WHERE c.company_id = u.company_id AND c.source_table = u.source_table AND c.is_active
            AND cg_norm_voce(c.source_value) = cg_norm_voce(u.source_value)
          ORDER BY (c.source_value = u.source_value) DESC, c.voce_chiave
         LIMIT 1) cl ON true;

-- Ammortamenti: mesi di uso nel periodo, fino a esaurire il costo storico.
do $f$
declare def text; vecchio text; nuovo text;
begin
  def := pg_get_functiondef('public.cg_get_conto_economico_riclassificato'::regproc);
  vecchio := $v$  WITH amm_anno AS (
    SELECT CASE
        WHEN c.aliquota_amm > 0 THEN c.costo_storico * (c.aliquota_amm / 100.0)
        WHEN c.vita_utile_mesi IS NOT NULL AND c.vita_utile_mesi > 0 THEN c.costo_storico / (c.vita_utile_mesi / 12.0)
        ELSE 0 END AS quota_annua
    FROM public.cespiti c
    WHERE c.company_id = v_company_id AND c.is_active
      AND c.data_acquisto <= make_date(p_anno, p_mese_a, 28)
      AND (c.data_dismissione IS NULL OR c.data_dismissione >= make_date(p_anno, p_mese_da, 1))
  )
  SELECT COALESCE(sum(quota_annua * (p_mese_a - p_mese_da + 1) / 12.0), 0) INTO v_amm FROM amm_anno;$v$;
  nuovo := $n$  WITH amm_base AS (
    SELECT c.costo_storico,
           CASE
             WHEN c.aliquota_amm > 0 THEN c.costo_storico * (c.aliquota_amm / 100.0)
             WHEN c.vita_utile_mesi IS NOT NULL AND c.vita_utile_mesi > 0 THEN c.costo_storico / (c.vita_utile_mesi / 12.0)
             ELSE 0 END / 12.0 AS quota_mese,
           (EXTRACT(year FROM c.data_acquisto) * 12 + EXTRACT(month FROM c.data_acquisto))::integer AS mese_acquisto,
           CASE WHEN c.data_dismissione IS NULL THEN 999999
                ELSE (EXTRACT(year FROM c.data_dismissione) * 12 + EXTRACT(month FROM c.data_dismissione))::integer END AS mese_fine
    FROM public.cespiti c
    WHERE c.company_id = v_company_id AND c.is_active AND c.data_acquisto IS NOT NULL
  ), amm_anno AS (
    -- Mesi di uso nel periodo e prima del periodo; la quota si ferma quando il costo è esaurito.
    SELECT b.*,
           greatest(0, least(p_anno * 12 + p_mese_a, b.mese_fine) - greatest(p_anno * 12 + p_mese_da, b.mese_acquisto) + 1) AS mesi_periodo,
           greatest(0, least(p_anno * 12 + p_mese_da - 1, b.mese_fine) - b.mese_acquisto + 1) AS mesi_prima
      FROM amm_base b
  )
  SELECT COALESCE(sum(least(quota_mese * mesi_periodo, greatest(costo_storico - quota_mese * mesi_prima, 0))), 0)
    INTO v_amm FROM amm_anno;$n$;
  if position(vecchio in def) = 0 then
    raise exception 'Blocco degli ammortamenti non trovato in cg_get_conto_economico_riclassificato: la funzione è cambiata, rivedere la migrazione';
  end if;
  execute replace(def, vecchio, nuovo);
end $f$;
