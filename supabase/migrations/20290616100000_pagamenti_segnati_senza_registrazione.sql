-- Segnate pagate, ma i soldi non risultano usciti (26/11/2026, Impresa Vulcano).
--
-- Vulcano paga una distinta RiBa da 94.198,27 e non riesce a riconciliarla: a mano le
-- fatture «non si trovano», l'automatico si ferma a 68.202 e in elenco restano solo le
-- note di credito.
--
-- Com'è successo: il 4/11 un UPDATE in blocco ha acceso `company_costs.is_paid` su 365
-- costi. Il trigger `costo_allinea_rate_fornitori` ha fatto il resto — rate a «pagata»,
-- `fatture_ricevute.pagata_il` scritta — ma nessuna scrittura di prima nota è stata
-- creata, perché quella la fa `registra_pagamento_costo`, che il blocco ha saltato.
-- Risultato: la riga dice «pagata» e `fornitore_residuo_rata` dice che i soldi si devono
-- ancora. Tutte e due hanno ragione, e nessuno se ne accorge.
--
-- Perché blocca la riconciliazione: `bank_candidati_movimento` esclude le rate «pagata» e
-- i costi già pagati, quindi quando il pagamento vero arriva non ha più niente a cui
-- attaccarsi. Le note di credito invece non hanno rate e passano da un altro ramo: sono
-- le uniche che restano visibili. È esattamente il sintomo descritto.
--
-- Qui dentro:
--   1. `pagamenti_segnati_da_sistemare` — l'elenco, per azienda: oggi 365 fatture su
--      Vulcano e 249 su un'altra, e nessuno lo sapeva.
--   2. `riapri_pagamenti_segnati` — la riparazione, che è l'intervento umano: rimette
--      `is_paid = false` e lascia fare al trigger, che sa già riaprire rate e fatture.
--      Da lì l'azienda sceglie: riconciliare col movimento, o «segna pagata» dalla
--      fattura, che la scrittura la registra davvero (vale per chi la banca non ce l'ha).
--   3. `bank_candidati_movimento` — le rate segnate pagate che hanno ancora un residuo
--      tornano fra i candidati, con l'etichetta che lo dice: così attaccarci il movimento
--      sistema lo stato invece di aggirarlo.
--
-- Non si mette una guardia che vieti `is_paid` senza pagamento: segnare pagato a mano è
-- il modo di lavorare di chi la tesoreria non ce l'ha, e sette funzioni legittime passano
-- di lì. Il rimedio è vederlo e poterlo correggere, non impedirlo.

set local lock_timeout = '3s';
set local statement_timeout = '120s';

-- 1 ── L'elenco ────────────────────────────────────────────────────────────────────────
create or replace function public.pagamenti_segnati_da_sistemare(p_company uuid)
returns table (
  costo_id uuid,
  fattura_id uuid,
  numero_fattura text,
  fornitore text,
  scadenza date,
  importo numeric,
  residuo numeric,
  segnato_il timestamptz,
  da_persona boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select c.id, f.id, f.numero_fattura,
         coalesce(s.name, f.cedente_ragione_sociale),
         r.scadenza, r.importo,
         round(private.fornitore_residuo_rata(r), 2),
         f.pagamento_segnato_at,
         f.pagamento_segnato_da is not null
    from public.rate_fornitori r
    join public.company_costs c on c.id = r.company_cost_id and c.company_id = r.company_id
     and c.annullato_il is null
    left join public.fatture_ricevute f on f.id = r.fattura_ricevuta_id and f.company_id = r.company_id
    left join public.suppliers s on s.id = coalesce(c.supplier_id, f.fornitore_id) and s.company_id = r.company_id
   where r.company_id = p_company
     and r.stato = 'pagata'
     and private.fornitore_residuo_rata(r) > 0.005
     and public.puo_gestire_scadenze(p_company)
   order by r.scadenza nulls last, f.numero_fattura;
$function$;

comment on function public.pagamenti_segnati_da_sistemare(uuid) is
  'Rate segnate pagate che hanno ancora un residuo: la riga dice pagata, i soldi non risultano usciti.';

revoke all on function public.pagamenti_segnati_da_sistemare(uuid) from public, anon;
grant execute on function public.pagamenti_segnati_da_sistemare(uuid) to authenticated;

-- 2 ── La riparazione ──────────────────────────────────────────────────────────────────
create or replace function public.riapri_pagamenti_segnati(p_company uuid, p_costi uuid[] default null)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  n integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Serve un utente autenticato' using errcode = '42501';
  end if;
  if public.user_can_access_company(p_company) is not true
     or public.puo_gestire_scadenze(p_company) is not true then
    raise exception 'Non hai il permesso di gestire i pagamenti ai fornitori.' using errcode = '42501';
  end if;

  -- Si tocca solo `is_paid`: a riaprire rate e fatture ci pensa
  -- `costo_allinea_rate_fornitori`, che lo sa già fare e lo fa in un posto solo.
  -- Si riaprono soltanto i costi dove c'è ancora un residuo scoperto: un costo pagato
  -- davvero non viene sfiorato, nemmeno se passato nell'elenco.
  with da_riaprire as (
    select distinct c.id
      from public.rate_fornitori r
      join public.company_costs c on c.id = r.company_cost_id and c.company_id = r.company_id
     where r.company_id = p_company
       and r.stato = 'pagata'
       and coalesce(c.is_paid, false)
       and c.annullato_il is null
       and private.fornitore_residuo_rata(r) > 0.005
       and (p_costi is null or c.id = any (p_costi))
  ), riaperti as (
    update public.company_costs c
       set is_paid = false, paid_date = null
      from da_riaprire d
     where c.id = d.id and c.company_id = p_company
    returning c.id
  )
  select count(*) into n from riaperti;
  return n;
end
$function$;

comment on function public.riapri_pagamenti_segnati(uuid, uuid[]) is
  'Riapre i costi segnati pagati che hanno ancora un residuo scoperto: le rate tornano da pagare e la fattura si può riconciliare o segnare pagata per davvero.';

revoke all on function public.riapri_pagamenti_segnati(uuid, uuid[]) from public, anon;
grant execute on function public.riapri_pagamenti_segnati(uuid, uuid[]) to authenticated;

-- 3 ── La riconciliazione le vede di nuovo ─────────────────────────────────────────────
do $guardia$
declare d text := pg_get_functiondef('public.bank_candidati_movimento(uuid,uuid,text,boolean)'::regprocedure);
begin
  if position('rata_fornitore' in d) = 0 or position('fornitore_residuo_rata' in d) = 0 then
    raise exception 'bank_candidati_movimento non e'' piu'' quella che questa migrazione riscrive: rivedere 20290616100000';
  end if;
end
$guardia$;

CREATE OR REPLACE FUNCTION public.bank_candidati_movimento(p_company uuid, p_tx uuid, p_search text DEFAULT ''::text, p_existing boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE t public.bank_transactions;result jsonb;q text:=lower(btrim(p_search));
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non disponibile';END IF;
 IF coalesce(t.currency,'EUR')<>'EUR' THEN RAISE EXCEPTION 'Per movimenti in altre valute serve verificare il cambio: non vengono convertiti automaticamente';END IF;
 IF p_existing THEN
  IF public.has_permission_for_company(auth.uid(),'can_view_prima_nota',p_company) IS NOT TRUE THEN RAISE EXCEPTION 'Non hai accesso al registro pagamenti' USING ERRCODE='42501';END IF;
  SELECT coalesce(jsonb_agg(j),'[]') INTO result FROM(
   SELECT jsonb_build_object('id',p.id,'tipo','pagamento','key','pagamento:'||p.id,'titolo',p.description,'sottotitolo',concat(p.entry_date,' · ',p.payment_method),'residuo',p.amount) j
   FROM public.prima_nota_entries p WHERE p.company_id=p_company AND p.amount>0 AND p.reversal_of IS NULL AND p.bank_transaction_id IS NULL
   AND coalesce(lower(p.payment_method),'') NOT IN('contanti','cash')
   AND p.direction=CASE WHEN t.transaction_type='credit' THEN 'entrata' ELSE 'uscita' END
   AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries z WHERE z.company_id=p_company AND z.reversal_of=p.id)
   AND NOT EXISTS(SELECT 1 FROM public.bank_reconciliations r WHERE r.company_id=p_company AND r.unmatched_at IS NULL AND (r.prima_nota_id=p.id OR (p.movimento_id IS NOT NULL AND r.movimento_id=p.movimento_id)))
   AND (q='' OR strpos(lower(concat_ws(' ',p.description,p.notes,p.reference_number,p.amount,p.entry_date)),q)>0)
   ORDER BY p.entry_date DESC,p.id LIMIT 100) z;
 ELSE
  WITH candidates AS(
   SELECT id,CASE origine WHEN 'nativa' THEN 'documento' ELSE 'invoice' END tipo,numero titolo,
    concat_ws(' · ',coalesce(nullif(cliente_snapshot->>'ragione_sociale',''),nullif(cliente_snapshot->>'company_name',''),nullif(concat_ws(' ',cliente_snapshot->>'nome',cliente_snapshot->>'cognome'),'')),data_scadenza) sottotitolo,greatest(0,coalesce(totale_da_pagare,0)-coalesce(importo_pagato,0)-coalesce(stornato,0)) residuo, false segnata_pagata
   FROM public.documenti_fiscali_elenco_operativo WHERE company_id=p_company AND deleted_at IS NULL AND t.transaction_type='credit'
   AND public.puo_incassare_fatture(p_company) AND public.has_permission_for_company(auth.uid(),'can_view_billing',p_company)
   AND tipo IN('fattura','fattura_pa','parcella','fattura_accompagnatoria','acconto_fattura','acconto_parcella','fattura_differita_b','fattura_riepilogativa','nota_debito')
   AND stato IN('emessa','inviata_sdi','consegnata','accettata','scaduta','parzialmente_pagata')
   UNION ALL
   SELECT s.id,'scadenza',s.description,concat_ws(' · ',f.name,s.due_date),s.amount-coalesce(s.paid_amount,0), false
   FROM public.scadenze s LEFT JOIN public.suppliers f ON f.id=s.supplier_id AND f.company_id=s.company_id
   WHERE s.company_id=p_company AND s.direction='uscita' AND s.status IN('da_pagare','parziale') AND coalesce(s.is_previsionale,false)=false AND t.transaction_type='debit' AND public.puo_gestire_scadenze(p_company)
   UNION ALL
   -- Anche le rate segnate pagate che hanno ancora un residuo (26/11/2026): la riga dice
   -- pagata ma i soldi non risultano usciti, e il pagamento vero deve potercisi attaccare.
   -- Il filtro finale `residuo>0` tiene fuori quelle pagate davvero.
   SELECT r.id,'rata_fornitore','Rata '||r.numero||' · '||coalesce(f.numero_fattura,c.name),
     concat_ws(' · ',coalesce(s.name,f.cedente_ragione_sociale),r.scadenza),private.fornitore_residuo_rata(r), r.stato='pagata'
   FROM public.rate_fornitori r
   JOIN public.company_costs c ON c.id=r.company_cost_id AND c.company_id=r.company_id AND c.annullato_il IS NULL
   LEFT JOIN public.fatture_ricevute f ON f.id=r.fattura_ricevuta_id AND f.company_id=r.company_id
   LEFT JOIN public.suppliers s ON s.id=coalesce(c.supplier_id,f.fornitore_id) AND s.company_id=r.company_id
   WHERE r.company_id=p_company AND r.stato NOT IN('stornata','da_bloccare','richiamata')
     AND (r.stato<>'pagata' OR NOT coalesce(c.is_paid,false) OR private.fornitore_residuo_rata(r)>0.005)
     AND t.transaction_type='debit' AND public.puo_gestire_scadenze(p_company)
     AND NOT EXISTS(select 1 from public.scadenze x where x.company_id=p_company and x.cost_id=c.id
       and x.direction='uscita' and x.status in ('da_pagare','parziale'))
   UNION ALL
   SELECT f.id,'ricevuta','Fattura '||f.numero_fattura,concat_ws(' · ',f.cedente_ragione_sociale,f.data_fattura),saldi.residuo, false
   FROM private.fatture_ricevute_calcola_saldi(p_company,null,null) saldi
   JOIN public.fatture_ricevute f ON f.id=saldi.id AND f.company_id=p_company
   WHERE t.transaction_type='debit' AND public.puo_gestire_scadenze(p_company)
     AND f.pagata_il IS NULL AND saldi.residuo>0 AND saldi.rate_totali=0
     AND NOT EXISTS(select 1 from public.scadenze x where x.company_id=p_company and x.cost_id=f.company_cost_id
       and x.direction='uscita' and x.status in ('da_pagare','parziale'))
  ) SELECT coalesce(jsonb_agg(j),'[]') INTO result FROM(
   SELECT jsonb_build_object('id',id,'tipo',tipo,'key',tipo||':'||id,'titolo',titolo,'sottotitolo',sottotitolo,'residuo',residuo,'affine',id=ANY(coalesce(t.reconciliation_suggestions,ARRAY[]::uuid[])),
     'etichetta',CASE WHEN segnata_pagata THEN 'Segnata pagata · pagamento non registrato'
                      WHEN id=ANY(coalesce(t.reconciliation_suggestions,ARRAY[]::uuid[])) THEN 'Suggerita · da verificare' END) j FROM candidates
   WHERE residuo>0 AND (q='' OR strpos(lower(concat_ws(' ',titolo,sottotitolo,residuo)),q)>0) ORDER BY abs(residuo-abs(t.amount)),id LIMIT 100) z;
 END IF;
 RETURN result;
END $function$;