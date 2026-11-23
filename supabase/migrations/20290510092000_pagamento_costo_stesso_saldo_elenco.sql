-- ════════════════════════════════════════════════════════════════════════════
-- Pagamenti di una fattura ricevuta: il popup dice quello che dice l'elenco (23/11/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Impresa Vulcano: «pagamenti e residuo ancora non funzionanti». Nell'elenco delle
-- fatture ricevute CSI Broker FT-2026/4077 risultava pagata (segnata il 16/11),
-- nel popup dei pagamenti «Pagato 0,00 · Residuo 100,00». Intesa Sanpaolo:
-- pagata, con il movimento di banca già collegato dalla tesoreria, e il popup
-- diceva «Pagato 0,00» più l'avviso «registrazioni storiche da riconciliare».
--
-- Due calcoli diversi dello stesso saldo:
--   · l'elenco usa private.fatture_ricevute_calcola_saldi — prima nota, rate e
--     scadenze pagate, quote di banca, anticipi compensati, «segnata pagata»,
--     note di credito, ritenuta e split payment;
--   · il popup (dettaglio_pagamento_costo) contava SOLO la prima nota.
-- E la tesoreria, quando trova il movimento di una fattura già segnata pagata,
-- lo collega come prova (bank_reconciliations, payment_source tipo «prova»)
-- senza scrivere prima nota, per non contare due volte lo stesso pagamento:
-- 65 collegamenti, 228.362 €, invisibili nel popup.
--
-- Adesso, quando il costo è di fatture ricevute pagabili:
--   · dovuto, pagato e residuo vengono dallo STESSO calcolo dell'elenco;
--   · tra i movimenti compaiono anche i collegamenti di banca della fattura e
--     delle sue rate (`fonte`: «banca» o «prova»), senza ripetere quelli che
--     sono già una riga di prima nota;
--   · `senza_prova`: la parte che risulta pagata ma senza un movimento che lo
--     provi (pagata nel gestionale di prima, segnata a mano) — un'informazione,
--     non un allarme;
--   · `da_verificare` resta per ciò che va davvero guardato: movimenti che
--     superano il dovuto, o un saldo che non si può attribuire alla fattura.
-- Per i costi senza fatture ricevute — e per i casi che il calcolo dell'elenco
-- lascia aperti (costo condiviso fra più fatture, nota di credito sul costo) —
-- tutto resta come prima.
--
-- Idempotente: CREATE OR REPLACE con la stessa firma, i permessi restano.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.dettaglio_pagamento_costo(p_costo uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.company_costs;
  totale numeric; pagato numeric; residuo numeric; compensato numeric; righe jsonb;
  versato_mov numeric; banca jsonb; versato_banca numeric;
  n_fatture integer; n_incerte integer; s_dovuto numeric; s_pagato numeric; s_residuo numeric;
  senza_prova numeric := 0; da_verificare boolean; movimenti jsonb;
begin
 select * into c from public.company_costs where id=p_costo;
 if c.id is null or auth.uid() is null or public.utente_bloccato() or not public.user_can_access_company(c.company_id)
 or not (coalesce(public.puo_vedere_costi(auth.uid(), c.company_id),false) or public.user_can_read_accountant_company(c.company_id))
 then raise exception 'Costo non disponibile' using errcode='42501'; end if;

 -- Il totale come prima (serve ai costi senza fatture ricevute).
 select round(coalesce((select sum(case when tipo_documento in ('TD04','TD08','passive_credit_note') then -abs(totale_documento) else totale_documento end) from public.fatture_ricevute where company_cost_id=c.id and company_id=c.company_id and coalesce(stato,'') not in ('annullata','scartata','rifiutata')),c.amount*(1+coalesce(c.vat_rate,0)/100))-public.costo_stornato_da_note(c.id),2) into totale;

 -- I pagamenti scritti in prima nota, come prima.
 select coalesce(sum(case when p.direction='uscita' then p.amount else -p.amount end),0),coalesce(jsonb_agg(jsonb_build_object('id',p.id,'data',p.entry_date,'importo',p.amount,'direzione',p.direction,'banca',p.bank_transaction_id,'riferimento',p.reference_number,'storno_di',p.reversal_of,'conto',p.account_label,'metodo',p.payment_method,'bank_account_id',p.bank_account_id,'fonte','prima_nota') order by p.entry_date,p.created_at),'[]'::jsonb)
 into versato_mov,righe from public.prima_nota_entries p where p.company_id=c.company_id and (p.cost_id=c.id or exists(select 1 from public.scadenze d where d.id=p.scadenza_id and d.cost_id=c.id and d.company_id=c.company_id));
 compensato:=public.anticipi_compensati_costo(c.company_id,c.id,current_date);

 -- I collegamenti di banca della fattura e delle sue rate che non sono già una riga di prima nota:
 -- pagamenti abbinati dalla tesoreria e prove di pagamenti già segnati.
 select coalesce(sum(r.matched_amount),0), coalesce(jsonb_agg(jsonb_build_object(
          'id',r.id,'data',t.booking_date,'importo',r.matched_amount,'direzione','uscita','banca',r.transaction_id,
          'riferimento',nullif(left(btrim(coalesce(t.description,'')),90),''),'storno_di',null,
          'conto',coalesce(nullif(btrim(a.display_name),''),private.tes_nome_conto(c.company_id,t.account_id),'Banca'),
          'metodo',null,'bank_account_id',t.account_id,
          'fonte',case when r.payment_source->>'tipo'='prova' then 'prova' else 'banca' end)
        order by t.booking_date,r.created_at),'[]'::jsonb)
   into versato_banca, banca
   from public.bank_reconciliations r
   join public.bank_transactions t on t.id=r.transaction_id and t.company_id=c.company_id
   left join public.bank_accounts a on a.id=t.account_id and a.company_id=c.company_id
  where r.company_id=c.company_id and r.unmatched_at is null
    and (r.fattura_ricevuta_id in (select f.id from public.fatture_ricevute f where f.company_cost_id=c.id and f.company_id=c.company_id)
      or r.rata_fornitore_id in (select rf.id from public.rate_fornitori rf where rf.company_cost_id=c.id and rf.company_id=c.company_id))
    and not exists (select 1 from public.prima_nota_entries p
                     where p.company_id=c.company_id and p.bank_transaction_id=r.transaction_id
                       and (p.cost_id=c.id or exists(select 1 from public.scadenze d where d.id=p.scadenza_id and d.cost_id=c.id and d.company_id=c.company_id)));

 -- Lo stesso saldo dell'elenco, fattura per fattura.
 select count(*), count(*) filter (where s.residuo is null or s.pagato is null or s.dovuto is null),
        sum(s.dovuto), sum(s.pagato), sum(s.residuo)
   into n_fatture, n_incerte, s_dovuto, s_pagato, s_residuo
   from public.fatture_ricevute f
   cross join lateral private.fatture_ricevute_calcola_saldi(c.company_id, null, f.id) s
  where f.company_cost_id=c.id and f.company_id=c.company_id
    and coalesce(f.stato,'') not in ('annullata','scartata','rifiutata');

 if n_fatture > 0 and n_incerte = 0 then
   totale := s_dovuto;
   pagato := s_pagato;
   residuo := s_residuo;
   senza_prova := greatest(0, round(s_pagato - (versato_mov + compensato + versato_banca), 2));
   da_verificare := round(versato_mov + compensato + versato_banca, 2) > round(s_dovuto, 2) + 0.01;
   movimenti := righe || banca;
 else
   -- Costo senza fatture ricevute, o saldo che l'elenco non attribuisce: come prima.
   pagato := versato_mov + compensato;
   residuo := greatest(0, totale - pagato);
   da_verificare := (c.is_paid and pagato=0 and totale<>0 and not exists(select 1 from public.rate_fornitori r where r.company_cost_id=c.id and r.stato='stornata'))
     or pagato>totale or n_incerte > 0
     or exists(select 1 from public.scadenze where company_id=c.company_id and cost_id=c.id and paid_amount>pagato);
   movimenti := righe;
 end if;

 select coalesce(jsonb_agg(x order by x->>'data', x->>'id'), '[]'::jsonb) into movimenti from jsonb_array_elements(movimenti) x;

 return jsonb_build_object('id',c.id,'company_id',c.company_id,'nome',c.name,'totale',totale,'pagato',pagato,'residuo',residuo,
   'da_verificare',da_verificare,'senza_prova',senza_prova,'movimenti',movimenti,'compensato',compensato,'puo_compensare',
   c.supplier_id IS NOT NULL AND c.annullato_il IS NULL AND public.contabilita_puo_scrivere(c.company_id)
     AND EXISTS(SELECT 1 FROM public.companies co WHERE co.id=c.company_id AND co.contabilita_generale_attiva));
end $function$;

COMMENT ON FUNCTION public.dettaglio_pagamento_costo(uuid) IS
  'Pagamenti di un costo. Per le fatture ricevute dovuto/pagato/residuo sono quelli dell''elenco '
  '(private.fatture_ricevute_calcola_saldi), con i collegamenti di banca e la parte pagata senza prova.';
