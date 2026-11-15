-- Conto economico: un pagamento a un fornitore che fattura non è un secondo costo (15/11/2026)
--
-- I costi del conto economico vengono dalle fatture ricevute registrate e, per
-- le spese senza fattura, dai movimenti di banca in uscita non abbinati. Un
-- bonifico a un fornitore che manda fatture però salda una di quelle fatture:
-- se il movimento non è stato abbinato, il costo entrava due volte, la seconda
-- IVA compresa. Demo 2, 2026: 43.350 € di «Materiali» da sei bonifici a Rehau,
-- Aluplast e altri, le cui fatture (tutte registrate) erano già tra i costi.
--
-- Adesso un'uscita di banca non entra nei costi se la controparte è un
-- fornitore con fatture ricevute: stesso nome (senza forma giuridica e
-- punteggiatura) o stesso IBAN dell'anagrafica fornitori. Restano nei costi le
-- uscite verso chi non fattura (commissioni, canoni, spese senza fattura).
-- Se quelle fatture non sono ancora registrate, il conto economico lo dice già
-- (migrazione 20290331120000) e porta a registrarle.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function private.cg_nome_norm(p_nome text)
returns text language sql immutable parallel safe set search_path to '' as $$
  select nullif(btrim(regexp_replace(
           regexp_replace(
             regexp_replace(lower(coalesce(p_nome, '')), '[^a-z0-9]+', ' ', 'g'),
             '\m(s r l s|s r l|srls|srl|s p a|spa|s n c|snc|s a s|sas|soc coop|s c a r l|scarl|unipersonale)\M', ' ', 'g'),
           '\s+', ' ', 'g')), '')
$$;
revoke all on function private.cg_nome_norm(text) from public, anon;
grant execute on function private.cg_nome_norm(text) to authenticated;

create index if not exists fatture_ricevute_company_cedente_norm_idx
  on public.fatture_ricevute (company_id, private.cg_nome_norm(cedente_ragione_sociale));

-- La vista gira coi permessi di chi legge: la funzione guarda le fatture ricevute
-- solo dell'azienda di chi chiama (o senza utente, dentro le funzioni del database).
create or replace function private.cg_paga_fornitore_con_fatture(p_company uuid, p_nome text, p_iban text)
returns boolean language sql stable security definer set search_path to '' as $$
  select (auth.uid() is null
          or p_company = public.get_my_company_id()
          or public.has_role(auth.uid(), 'super_admin'::public.app_role))
     and (
       (length(coalesce(private.cg_nome_norm(p_nome), '')) >= 3 and exists (
          select 1 from public.fatture_ricevute fr
           where fr.company_id = p_company
             and private.cg_nome_norm(fr.cedente_ragione_sociale) = private.cg_nome_norm(p_nome)
             and coalesce(fr.stato, '') <> 'rifiutata'))
       or (length(coalesce(p_iban, '')) >= 15 and exists (
          select 1 from public.suppliers s
            join public.fatture_ricevute fr on fr.company_id = p_company and fr.fornitore_id = s.id
           where s.company_id = p_company
             and upper(replace(s.iban, ' ', '')) = upper(replace(p_iban, ' ', ''))
             and coalesce(fr.stato, '') <> 'rifiutata'))
     )
$$;
revoke all on function private.cg_paga_fornitore_con_fatture(uuid, text, text) from public, anon;
grant execute on function private.cg_paga_fornitore_con_fatture(uuid, text, text) to authenticated, service_role;

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
            -- Pagamento a chi manda fatture: salda una fattura ricevuta, il costo è quella.
            AND NOT private.cg_paga_fornitore_con_fatture(bt.company_id,
                  COALESCE(NULLIF(bt.counterparty_name, ''), bt.creditor_name),
                  COALESCE(NULLIF(bt.counterparty_iban, ''), bt.creditor_iban))
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
