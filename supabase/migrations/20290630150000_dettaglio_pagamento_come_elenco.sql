-- Il pannello «Pagamenti e residuo» della fattura ricevuta dice quello che dice l'elenco
-- (28/11/2026).
--
-- `fatture_ricevute_saldi` (elenco, 20290628120000) rimette nel residuo le rate «pagata» il cui
-- residuo vero (`private.fornitore_residuo_rata`, cioè le scritture di prima nota) è ancora
-- scoperto: il flag da solo non è un pagamento. `dettaglio_pagamento_costo` invece leggeva i saldi
-- grezzi di `private.fatture_ricevute_calcola_saldi` e mostrava «Pagato 37,54 · Residuo 0,00 ·
-- Nessun pagamento registrato» sulla stessa fattura che l'elenco e la riconciliazione davano da
-- pagare. Qui il calcolo è lo stesso dell'elenco, fattura per fattura; in più escono
-- `segnata_non_registrata` (l'importo segnato pagato senza una scrittura) e
-- `rate_segnate_non_registrate` (quali rate), perché pannello e riepilogo lo dicano.
--
-- Solo lettura: nessuna riga cambia. Firma, SECURITY DEFINER, search_path e permessi invariati.

create or replace function public.dettaglio_pagamento_costo(p_costo uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  c public.company_costs;
  totale numeric; pagato numeric; residuo numeric; compensato numeric; righe jsonb;
  versato_mov numeric; banca jsonb; versato_banca numeric;
  n_fatture integer; n_incerte integer; s_dovuto numeric; s_pagato numeric; s_residuo numeric;
  s_scoperto numeric; rate_scoperte jsonb := '[]'::jsonb;
  senza_prova numeric := 0; da_verificare boolean; movimenti jsonb;
begin
 select * into c from public.company_costs where id=p_costo;
 if c.id is null or auth.uid() is null or public.utente_bloccato() or not public.user_can_access_company(c.company_id)
 or not (coalesce(public.puo_vedere_costi(auth.uid(), c.company_id),false) or public.user_can_read_accountant_company(c.company_id))
 then raise exception 'Costo non disponibile' using errcode='42501'; end if;

 -- Il totale come prima (serve ai costi senza fatture ricevute).
 select round(coalesce((select sum(case when tipo_documento in ('TD04','TD08','passive_credit_note') then -abs(totale_documento) else totale_documento end) from public.fatture_ricevute where company_cost_id=c.id and company_id=c.company_id and coalesce(stato,'') not in ('annullata','scartata','rifiutata')),c.amount*(1+coalesce(c.vat_rate,0)/100))-public.costo_stornato_da_note(c.id),2) into totale;

 -- I pagamenti scritti in prima nota. `versione` e `non_annullabile` (26/11/2026) servono al
 -- comando «Togli il pagamento»: la prima è il controllo di concorrenza, il secondo il motivo
 -- per cui il comando non si può offrire.
 select coalesce(sum(case when p.direction='uscita' then p.amount else -p.amount end),0),coalesce(jsonb_agg(jsonb_build_object('id',p.id,'data',p.entry_date,'importo',p.amount,'direzione',p.direction,'banca',p.bank_transaction_id,'riferimento',p.reference_number,'storno_di',p.reversal_of,'conto',p.account_label,'metodo',p.payment_method,'bank_account_id',p.bank_account_id,'fonte','prima_nota','versione',p.updated_at,'non_annullabile',public.pagamento_costo_annullabile(p)) order by p.entry_date,p.created_at),'[]'::jsonb)
 into versato_mov,righe from public.prima_nota_entries p where p.company_id=c.company_id and (p.cost_id=c.id or exists(select 1 from public.scadenze d where d.id=p.scadenza_id and d.cost_id=c.id and d.company_id=c.company_id));
 compensato:=public.anticipi_compensati_costo(c.company_id,c.id,current_date);

 -- I collegamenti di banca della fattura e delle sue rate che non sono già una riga di prima nota.
 select coalesce(sum(r.matched_amount),0), coalesce(jsonb_agg(jsonb_build_object(
          'id',r.id,'data',t.booking_date,'importo',r.matched_amount,'direzione','uscita','banca',r.transaction_id,
          'riferimento',nullif(left(btrim(coalesce(t.description,'')),90),''),'storno_di',null,
          'conto',coalesce(nullif(btrim(a.display_name),''),private.tes_nome_conto(c.company_id,t.account_id),'Banca'),
          'metodo',null,'bank_account_id',t.account_id,
          'fonte',case when r.payment_source->>'tipo'='prova' then 'prova' else 'banca' end,
          'versione',null,'non_annullabile','Viene dalla tesoreria: scollegalo dal movimento di banca.')
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

 -- Lo stesso saldo dell'elenco, fattura per fattura: stessa regola di `fatture_ricevute_saldi`
 -- per le rate «pagata» con il residuo vero ancora scoperto.
 select count(*), count(*) filter (where v.residuo is null or v.pagato is null or v.dovuto is null),
        sum(v.dovuto), sum(v.pagato), sum(v.residuo), sum(v.scoperto)
   into n_fatture, n_incerte, s_dovuto, s_pagato, s_residuo, s_scoperto
   from public.fatture_ricevute f
   cross join lateral private.fatture_ricevute_calcola_saldi(c.company_id, null, f.id) s
   left join lateral (
     select sum(round(x.residuo, 2)) importo
       from public.rate_fornitori r
       join public.company_costs cc on cc.id = r.company_cost_id and cc.company_id = r.company_id
         and cc.annullato_il is null
       cross join lateral (select private.fornitore_residuo_rata(r) residuo offset 0) x
      where r.company_id = c.company_id and r.fattura_ricevuta_id = f.id
        and r.stato = 'pagata' and x.residuo > 0.005
   ) sc on true
   cross join lateral (
     select case when sc.importo is null or s.residuo is null then s.residuo
                 else round(least(coalesce(s.pagato, 0) + s.residuo, s.residuo + sc.importo), 2) end residuo_vero
   ) rv
   cross join lateral (
     select s.dovuto,
            case when sc.importo is null or s.residuo is null then s.pagato
                 else greatest(0, round(coalesce(s.pagato, 0) + s.residuo - rv.residuo_vero, 2)) end pagato,
            rv.residuo_vero residuo,
            sc.importo scoperto
   ) v
  where f.company_cost_id=c.id and f.company_id=c.company_id
    and coalesce(f.stato,'') not in ('annullata','scartata','rifiutata');

 -- Quali rate, perché il riepilogo le etichetti una per una e non tutte quelle del costo.
 if coalesce(s_scoperto, 0) > 0 then
   select coalesce(jsonb_agg(r.id order by r.numero, r.id), '[]'::jsonb) into rate_scoperte
     from public.rate_fornitori r
     join public.company_costs cc on cc.id = r.company_cost_id and cc.company_id = r.company_id
       and cc.annullato_il is null
    where r.company_id = c.company_id and r.company_cost_id = c.id and r.stato = 'pagata'
      and private.fornitore_residuo_rata(r) > 0.005;
 end if;

 if n_fatture > 0 and n_incerte = 0 then
   totale := s_dovuto;
   pagato := s_pagato;
   residuo := s_residuo;
   senza_prova := greatest(0, round(s_pagato - (versato_mov + compensato + versato_banca), 2));
   da_verificare := round(versato_mov + compensato + versato_banca, 2) > round(s_dovuto, 2) + 0.01;
   movimenti := righe || banca;
 else
   pagato := versato_mov + compensato;
   residuo := greatest(0, totale - pagato);
   da_verificare := (c.is_paid and pagato=0 and totale<>0 and not exists(select 1 from public.rate_fornitori r where r.company_cost_id=c.id and r.stato='stornata'))
     or pagato>totale or n_incerte > 0
     or exists(select 1 from public.scadenze where company_id=c.company_id and cost_id=c.id and paid_amount>pagato);
   movimenti := righe;
 end if;

 select coalesce(jsonb_agg(x order by x->>'data', x->>'id'), '[]'::jsonb) into movimenti from jsonb_array_elements(movimenti) x;

 return jsonb_build_object(
      'puo_registrare_pagamento', not public.utente_sola_lettura(c.company_id)
        and (coalesce(public.puo_vedere_costi(auth.uid(),c.company_id),false) or public.user_can_write_accountant_company(c.company_id))
        and private.puo_gestire_pagamenti_costi(c.company_id,true),
      'puo_togliere_pagamento', not public.utente_sola_lettura(c.company_id)
        and (coalesce(public.puo_vedere_costi(auth.uid(),c.company_id),false) or public.user_can_write_accountant_company(c.company_id))
        and private.puo_gestire_pagamenti_costi(c.company_id,false),
      'id',c.id,'company_id',c.company_id,'nome',c.name,'totale',totale,'pagato',pagato,'residuo',residuo,
   'da_verificare',da_verificare,'senza_prova',senza_prova,'movimenti',movimenti,'compensato',compensato,
   'segnata_non_registrata', case when n_fatture > 0 and n_incerte = 0 then coalesce(s_scoperto, 0) else 0 end,
   'rate_segnate_non_registrate', case when n_fatture > 0 and n_incerte = 0 then rate_scoperte else '[]'::jsonb end,
   'puo_compensare',
   c.supplier_id IS NOT NULL AND c.annullato_il IS NULL AND public.contabilita_puo_scrivere(c.company_id)
     AND EXISTS(SELECT 1 FROM public.companies co WHERE co.id=c.company_id AND co.contabilita_generale_attiva));
end $function$;
