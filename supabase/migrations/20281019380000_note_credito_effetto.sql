-- Note di credito emesse e rate (19/10/2026).
--
--  1. La nota di credito emessa riduce la fattura che rettifica: il residuo da incassare, la scadenza e
--     la rata collegata tolgono lo stornato; se lo storno copre tutta la fattura non ancora incassata, la
--     fattura diventa «stornata». Si ricalcola quando la nota viene emessa, annullata o cestinata.
--  2. Una rata diventa incassata solo quando la sua fattura ha incassato almeno l'importo della rata:
--     una fattura più piccola lascia sulla rata la parte che manca.
--  3. Serie delle note di credito: riparte da 1 ogni anno; eliminare una bozza numerata restituisce il
--     numero anche alla serie delle note.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function pg_temp.sostituisci(p_firma text, p_vecchio text, p_nuovo text)
returns void language plpgsql as $$
declare v_def text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuovo in v_def) > 0 then return; end if;
  if position(p_vecchio in v_def) = 0 then
    raise exception 'Testo non trovato in %: %', p_firma, left(p_vecchio, 80);
  end if;
  execute replace(v_def, p_vecchio, p_nuovo);
end $$;

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
-- Quanto è stornato da note di credito emesse, per i calcoli del sistema (senza il controllo
-- d'accesso di documento_stornato, che dipende da chi chiama).
create or replace function public.documento_stornato_totale(p_documento_id uuid)
returns numeric language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(sum(abs(coalesce(nc.totale_da_pagare, nc.totale_documento, 0))), 0)
    from public.documenti_fiscali nc
   where nc.documento_correlato_id = p_documento_id
     and nc.tipo = 'nota_credito'
     and nc.stato not in ('bozza', 'annullata')
     and nc.deleted_at is null
$function$;
revoke all on function public.documento_stornato_totale(uuid) from public, anon, authenticated;

-- Incasso: il residuo è il totale meno l'incassato meno lo stornato.
select pg_temp.sostituisci('public.registra_incasso_atomico(uuid,uuid,numeric,text,date,text,text)',
  $v$  IF (COALESCE(v_pagato,0) + p_importo) > COALESCE(v_totale,0) + 0.01 THEN$v$,
  $n$  -- quello che una nota di credito ha già stornato non si incassa
  v_totale := COALESCE(v_totale, 0) - public.documento_stornato_totale(p_documento_id);
  IF (COALESCE(v_pagato,0) + p_importo) > COALESCE(v_totale,0) + 0.01 THEN$n$);

-- Stato della fattura dagli incassi: pagata quando l'incassato copre il totale meno lo stornato.
select pg_temp.sostituisci('public.update_fattura_stato_on_movimento()',
  $v$  IF v_incassato >= v_totale THEN v_nuovo := 'pagata';$v$,
  $n$  v_totale := coalesce(v_totale, 0) - public.documento_stornato_totale(v_doc_id);
  IF v_incassato >= v_totale THEN v_nuovo := 'pagata';$n$);
select pg_temp.sostituisci('public.update_fattura_stato_on_movimento()',
  $v$  WHERE id=v_doc_id AND stato NOT IN ('annullata','rifiutata','bozza','in_invio');$v$,
  $n$  WHERE id=v_doc_id AND stato NOT IN ('annullata','rifiutata','bozza','in_invio','stornata');$n$);

-- Scadenza: importo meno lo stornato; stornata del tutto e non incassata, la scadenza se ne va.
select pg_temp.sostituisci('public.sync_scadenza_da_documento_fiscale()',
  $v$  v_amount := COALESCE(NEW.totale_da_pagare, NEW.totale_documento, 0);

  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;$v$,
  $n$  v_amount := COALESCE(NEW.totale_da_pagare, NEW.totale_documento, 0)
               - public.documento_stornato_totale(NEW.id);

  IF v_amount <= 0.005 THEN
    -- stornata per intero: niente più da incassare
    DELETE FROM public.scadenze
    WHERE company_id = NEW.company_id
      AND notes LIKE '%' || v_tag || '%'
      AND COALESCE(paid_amount, 0) = 0;
    RETURN NEW;
  END IF;$n$);
select pg_temp.sostituisci('public.sync_scadenza_da_documento_fiscale()',
  $v$    SET amount = v_amount, due_date = v_due, updated_at = now()
    WHERE id = v_scad_id;$v$,
  $n$    SET amount = GREATEST(v_amount, COALESCE(paid_amount, 0)), due_date = v_due, updated_at = now()
    WHERE id = v_scad_id;$n$);

-- La nota di credito emessa, annullata o cestinata ricalcola la fattura che rettifica.
create or replace function public.nota_credito_aggiorna_fattura()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_id uuid; d record; v_resto numeric; v_pagato numeric; v_stato text;
begin
  for v_id in
    select distinct x from unnest(array[new.documento_correlato_id,
                                        case when tg_op = 'UPDATE' then old.documento_correlato_id end]) x
     where x is not null
  loop
    select * into d from public.documenti_fiscali where id = v_id and deleted_at is null;
    if not found or d.tipo = 'nota_credito'
       or d.stato in ('bozza', 'annullata', 'rifiutata', 'in_invio') then
      continue;
    end if;
    v_pagato := coalesce(d.importo_pagato, 0);
    v_resto := coalesce(d.totale_da_pagare, d.totale_documento, 0) - public.documento_stornato_totale(v_id);
    v_stato := case
      when v_resto <= 0.01 and v_pagato <= 0.01 then 'stornata'
      when v_pagato > 0 and v_pagato >= v_resto - 0.01 then 'pagata'
      when v_pagato > 0 then 'parzialmente_pagata'
      when d.stato in ('stornata', 'pagata', 'parzialmente_pagata') then public.stato_documento_da_sdi(d.sdi_stato, d.sdi_id_trasmissione)
      else d.stato end;
    -- aggiornare lo stato (anche se resta uguale) ricalcola scadenza e rata
    update public.documenti_fiscali set stato = v_stato, updated_at = now() where id = v_id;
  end loop;
  return new;
end
$function$;
revoke all on function public.nota_credito_aggiorna_fattura() from public, anon, authenticated;
drop trigger if exists nota_credito_aggiorna_fattura on public.documenti_fiscali;
create trigger nota_credito_aggiorna_fattura
  after insert or update of stato, deleted_at, documento_correlato_id, totale_da_pagare on public.documenti_fiscali
  for each row when (new.tipo = 'nota_credito')
  execute function public.nota_credito_aggiorna_fattura();

-- Rata da incassare: anche lo stornato della fattura collegata va tolto.
create or replace function public.rate_da_incassare(p_company uuid)
returns table (order_id uuid, installment_id uuid, expected_date date, residuo numeric, finanziamento boolean)
language sql stable security definer set search_path = public
as $$
  with o as (
    select o.id,
           round((coalesce(o.total_amount, 0)
                  + coalesce((select sum(coalesce(v.impatto_economico, 0)) from public.ordini_variazione v
                               where v.order_id = o.id and v.status = 'approvato'), 0))
                 * (1 + coalesce(o.vat_rate, 22) / 100), 2)
           - case when o.payment_type = 'financing' then coalesce(o.financing_cost, 0) else 0 end as totale
      from public.orders o
     where o.company_id = p_company and o.deleted_at is null
  ),
  r as (select * from public.rate_importi(p_company)),
  incassato as (select x.order_id, sum(x.importo) as i from public.rate_incassi(p_company) x group by x.order_id),
  righe as (
    select r.order_id, r.installment_id, r.expected_date,
           greatest(0, r.importo - coalesce(d.importo_pagato, 0)
                     - case when d.id is null then 0 else public.documento_stornato_totale(d.id) end) as residuo,
           r.type = 'financing' as finanziamento
      from r left join public.documenti_fiscali d on d.id = r.documento_fiscale_id
     where not r.is_paid
    union all
    -- La parte del totale che nessuna rata copre: piano senza saldo, variante dopo il saldo pagato,
    -- o commessa senza alcun piano (deve tutto il suo totale).
    select s.order_id, null::uuid, null::date, s.scoperto, false
      from (select o.id as order_id, round(o.totale - coalesce(sum(r.importo), 0), 2) as scoperto
              from o left join r on r.order_id = o.id
             group by o.id, o.totale) s
     where s.scoperto > 0
  ),
  ordinate as (
    select righe.*,
           sum(righe.residuo) over (partition by righe.order_id
                                    order by righe.expected_date nulls last, righe.installment_id nulls last
                                    rows unbounded preceding) as cumulato
      from righe
  )
  -- Mai oltre il totale meno l'incassato: l'eccedenza del piano si toglie dalle rate più lontane.
  select ord.order_id, ord.installment_id, ord.expected_date,
         greatest(0, least(ord.residuo, greatest(0, o.totale - coalesce(inc.i, 0)) - (ord.cumulato - ord.residuo))),
         ord.finanziamento
    from ordinate ord
    join o on o.id = ord.order_id
    left join incassato inc on inc.order_id = ord.order_id
$$;
revoke all on function public.rate_da_incassare(uuid) from public, anon, authenticated;

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
-- Dalla fattura alla rata: incassata solo se l'incassato della fattura copre la rata.
select pg_temp.sostituisci('public.allinea_rata_da_fattura()',
  $v$  SELECT id, is_paid INTO r FROM public.order_installments WHERE documento_fiscale_id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF v_saldata AND NOT r.is_paid THEN$v$,
  $n$  SELECT id, is_paid, amount INTO r FROM public.order_installments WHERE documento_fiscale_id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- la rata è incassata quando i soldi arrivati sulla fattura coprono la rata (una fattura più
  -- piccola lascia da incassare la differenza)
  IF v_saldata AND NOT r.is_paid AND coalesce(NEW.importo_pagato, 0) >= coalesce(r.amount, 0) - 0.01 THEN$n$);
-- Dalla rata alla fattura: legata a una fattura già pagata, è incassata solo se la fattura la copre.
select pg_temp.sostituisci('public.allinea_fattura_da_rata()',
  $v$  ELSIF NOT NEW.is_paid AND v_saldata THEN
    IF v_legame_nuovo THEN$v$,
  $n$  ELSIF NOT NEW.is_paid AND v_saldata THEN
    IF v_legame_nuovo AND coalesce(d.importo_pagato, 0) >= coalesce(NEW.amount, 0) - 0.01 THEN$n$);

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
alter table public.anagrafica_azienda add column if not exists anno_corrente_nc integer;
update public.anagrafica_azienda
   set anno_corrente_nc = extract(year from now())::int
 where anno_corrente_nc is null;

select pg_temp.sostituisci('public.genera_numero_documento_native(uuid,text,integer)',
  $v$        v_prefisso := coalesce(v_ana.prefisso_nc, 'NC');
        update public.anagrafica_azienda set ultimo_numero_nc = ultimo_numero_nc + 1 where company_id = p_company_id returning ultimo_numero_nc into v_contatore;$v$,
  $n$        v_prefisso := coalesce(v_ana.prefisso_nc, 'NC');
        -- come le fatture: a inizio anno la serie delle note riparte da 1
        if coalesce(v_ana.anno_corrente_nc, 0) < p_anno then
          update public.anagrafica_azienda set ultimo_numero_nc = 1, anno_corrente_nc = p_anno where company_id = p_company_id returning ultimo_numero_nc into v_contatore;
        else
          update public.anagrafica_azienda set ultimo_numero_nc = coalesce(ultimo_numero_nc, 0) + 1 where company_id = p_company_id returning ultimo_numero_nc into v_contatore;
        end if;$n$);

select pg_temp.sostituisci('public.documento_elimina_bozza(uuid)',
  $v$          update public.anagrafica_azienda set ultimo_numero_fattura = v_massimo where company_id = v_doc.company_id;
          v_liberato := true;
        end if;
      end if;
    end if;$v$,
  $n$          update public.anagrafica_azienda set ultimo_numero_fattura = v_massimo where company_id = v_doc.company_id;
          v_liberato := true;
        end if;
      end if;
    elsif found and v_doc.tipo = 'nota_credito' and coalesce(v_ana.anno_corrente_nc, 0) = v_doc.anno then
      -- serie delle note di credito a parte: anche lei riprende il numero liberato
      select coalesce(max(d.numero_progressivo), 0) into v_massimo
        from public.documenti_fiscali d
       where d.company_id = v_doc.company_id and d.anno = v_doc.anno
         and d.tipo = 'nota_credito' and d.numero not like 'Bozza %';
      if v_massimo < coalesce(v_ana.ultimo_numero_nc, 0) then
        update public.anagrafica_azienda set ultimo_numero_nc = v_massimo where company_id = v_doc.company_id;
        v_liberato := true;
      end if;
    end if;$n$);
