-- «Come faccio a togliere il pagamento? Ricordo che c'era un tasto ma non lo trovo più»
-- (26/11/2026, un'azienda che usa la piattaforma).
--
-- Nel pannello «Pagamenti e residuo» della fattura ricevuta la tabella dei movimenti sa già
-- dire «Pagamento annullato» e «Storno del pagamento», ma non c'era nessun comando per
-- annullarne uno: si poteva solo collegarlo alla banca. Il tasto che l'azienda ricorda è la
-- pastiglia verde «Pagata <data>» dell'elenco, che però si vede solo quando il pagamento NON
-- passa dal pannello (`RiepilogoFatturaRicevuta`, `siPagaNelPannello`): da dentro il pannello
-- non c'è.
--
-- Togliere un pagamento non è una cosa sola, e sbagliare strada lascia la fattura in uno stato
-- incoerente:
--   · un saldo rapido («Segna pagata») ha scritto `fatture_ricevute.pagata_il`, le rate e una
--     traccia in `private.saldi_rapidi_fatture_ricevute`: va annullato con
--     `annulla_saldo_fattura_ricevuta`, che rimette tutto a posto. Cancellare solo la scrittura
--     di prima nota lascerebbe la fattura «pagata» senza pagamento registrato — esattamente il
--     guasto da 94.198 € di stamattina (20290616100000);
--   · un pagamento registrato a mano si toglie con `prima_nota_elimina_registrazione`, che
--     riallinea il costo e le scadenze;
--   · un movimento che viene dalla tesoreria non si tocca da qui: si scollega dalla banca.
--
-- Qui si aggiunge un comando solo, `pagamento_costo_annulla`, che riconosce da sé quale delle
-- tre è, e `dettaglio_pagamento_costo` dice per ogni riga se si può togliere e perché no.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1 ── Perché questo movimento non si toglie dal pannello della fattura. null = si toglie.
create or replace function public.pagamento_costo_annullabile(p public.prima_nota_entries)
returns text language sql stable set search_path = '' as $function$
  select case
    when p.reversal_of is not null
      then 'È la contropartita di un pagamento annullato: si toglie insieme al pagamento di origine.'
    when exists (select 1 from public.prima_nota_entries z where z.reversal_of = p.id)
      then 'Il pagamento è già annullato.'
    else public.prima_nota_cancellabile(p)
  end;
$function$;
revoke all on function public.pagamento_costo_annullabile(public.prima_nota_entries) from public, anon;
grant execute on function public.pagamento_costo_annullabile(public.prima_nota_entries) to authenticated, service_role;

-- 2 ── Il saldo rapido di un movimento. `private.saldi_rapidi_fatture_ricevute` non è leggibile
-- da `authenticated` (e non deve diventarlo): serve un definer che risponda solo per le aziende
-- a cui chi chiama ha accesso.
create or replace function public.pagamento_saldo_rapido_aperto(p_movimento uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare s private.saldi_rapidi_fatture_ricevute;
begin
  select * into s from private.saldi_rapidi_fatture_ricevute x
   where x.movimento_id = p_movimento and x.annullato_at is null
   order by x.segnato_at desc limit 1;
  if not found or auth.uid() is null or not public.user_can_access_company(s.company_id) then
    return null;
  end if;
  return jsonb_build_object('richiesta', s.id, 'fattura_id', s.fattura_id, 'costo_id', s.costo_id);
end $function$;
revoke all on function public.pagamento_saldo_rapido_aperto(uuid) from public, anon;
grant execute on function public.pagamento_saldo_rapido_aperto(uuid) to authenticated, service_role;

-- 3 ── Il comando. Invoker di proposito: `prima_nota_elimina_registrazione` controlla i permessi
-- con le policy di chi chiama, e dentro un definer le aggirerebbe.
create or replace function public.pagamento_costo_annulla(p_movimento uuid, p_versione timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  p public.prima_nota_entries;
  prova jsonb;
  motivo text;
begin
  select * into p from public.prima_nota_entries where id = p_movimento;
  if not found then
    raise exception 'Pagamento non trovato o non visibile. Ricarica la pagina.' using errcode = 'P0002';
  end if;
  if p_versione is null or p.updated_at is distinct from p_versione then
    raise exception 'Il pagamento è cambiato. Ricarica la fattura prima di toglierlo.' using errcode = 'PT409';
  end if;
  motivo := public.pagamento_costo_annullabile(p);
  if motivo is not null then raise exception '%', motivo using errcode = 'P0001'; end if;

  -- Un saldo rapido ancora aperto: la fattura, le rate e le scadenze tornano indietro tutte
  -- insieme, e solo `annulla_saldo_fattura_ricevuta` lo sa fare.
  prova := public.pagamento_saldo_rapido_aperto(p.id);
  if prova is not null then
    perform public.annulla_saldo_fattura_ricevuta((prova->>'fattura_id')::uuid, (prova->>'richiesta')::uuid);
    return jsonb_build_object('via', 'saldo_rapido', 'fattura_id', prova->>'fattura_id', 'annullato', true);
  end if;

  return public.prima_nota_elimina_registrazione(p.id, p_versione)
         || jsonb_build_object('via', 'prima_nota', 'annullato', true);
end $function$;
revoke all on function public.pagamento_costo_annulla(uuid, timestamptz) from public, anon;
grant execute on function public.pagamento_costo_annulla(uuid, timestamptz) to authenticated, service_role;

-- 3 ── Il pannello ha bisogno di due cose per riga: la versione (il controllo di concorrenza di
-- `prima_nota_elimina_registrazione`) e il motivo per cui il comando non c'è.
-- Riscritta a partire dalla versione in produzione: cambiano solo le due righe marcate.
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

 -- I pagamenti scritti in prima nota. `versione` e `non_annullabile` (26/11/2026) servono al
 -- comando «Togli il pagamento»: la prima è il controllo di concorrenza, il secondo il motivo
 -- per cui il comando non si può offrire.
 select coalesce(sum(case when p.direction='uscita' then p.amount else -p.amount end),0),coalesce(jsonb_agg(jsonb_build_object('id',p.id,'data',p.entry_date,'importo',p.amount,'direzione',p.direction,'banca',p.bank_transaction_id,'riferimento',p.reference_number,'storno_di',p.reversal_of,'conto',p.account_label,'metodo',p.payment_method,'bank_account_id',p.bank_account_id,'fonte','prima_nota','versione',p.updated_at,'non_annullabile',public.pagamento_costo_annullabile(p)) order by p.entry_date,p.created_at),'[]'::jsonb)
 into versato_mov,righe from public.prima_nota_entries p where p.company_id=c.company_id and (p.cost_id=c.id or exists(select 1 from public.scadenze d where d.id=p.scadenza_id and d.cost_id=c.id and d.company_id=c.company_id));
 compensato:=public.anticipi_compensati_costo(c.company_id,c.id,current_date);

 -- I collegamenti di banca della fattura e delle sue rate che non sono già una riga di prima nota:
 -- pagamenti abbinati dalla tesoreria e prove di pagamenti già segnati.
 select coalesce(sum(r.matched_amount),0), coalesce(jsonb_agg(jsonb_build_object(
          'id',r.id,'data',t.booking_date,'importo',r.matched_amount,'direzione','uscita','banca',r.transaction_id,
          'riferimento',nullif(left(btrim(coalesce(t.description,'')),90),''),'storno_di',null,
          'conto',coalesce(nullif(btrim(a.display_name),''),private.tes_nome_conto(c.company_id,t.account_id),'Banca'),
          'metodo',null,'bank_account_id',t.account_id,
          'fonte',case when r.payment_source->>'tipo'='prova' then 'prova' else 'banca' end,
          -- Non è una riga di prima nota: da qui non si tocca.
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
