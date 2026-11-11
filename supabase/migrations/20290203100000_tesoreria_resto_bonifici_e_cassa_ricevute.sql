-- Tesoreria: quello che le simulazioni del 09/11/2026 hanno trovato.
--   • un accredito più alto della fattura si chiudeva per intero e il resto spariva:
--     ora il movimento resta «parziale» e il resto si abbina ad altri documenti;
--   • «Segna pagata» su una fattura ricevuta chiudeva il costo senza nessuna uscita di
--     cassa, e poi l'addebito della banca veniva rifiutato come «pagamento storico».

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Match the same SQL fragment despite recovered formatting, exactly once.
create or replace function pg_temp.history_fragment(source text, fragment text) returns text
language plpgsql as $fragment$
declare pattern text:=''; ch text; matches text[]; n integer;
begin
 for ch in select regexp_split_to_table(fragment,'') loop
  if ch ~ '\s' then pattern:=pattern||'\s*';
  else pattern:=pattern||case when ch=any(array['(',')','[',']','{','}','.','*','+','?','^','$','|',E'\\']) then E'\\' else '' end||ch;end if;
 end loop;
 select count(*),min(m[1]) into n,fragment from regexp_matches(source,'('||pattern||')','g') m;
 if n<>1 then raise exception 'Recovered SQL fragment must match exactly once, found %',n;end if;
 return fragment;
end $fragment$;

do $migrazione$
declare
  d text;
  n text;
  a1 text := $x$v_importo numeric; v_mov uuid; v_scad uuid; v_data date;$x$;
  a2 text := $x$  UPDATE public.bank_transactions
     SET linked_scadenza_id = v_scad, reconciliation_status = 'reconciled', reconciled_at = now()
   WHERE id = t.id;$x$;
  a3 text := $x$    match_type, match_score, matched_at, matched_by, notes
  ) VALUES ($x$;
  a4 text := $x$    p_match_score, now(), auth.uid(), 'Fattura n. ' || d.numero
  );$x$;
  b1 text := $x$ totale numeric; pagato numeric; importo numeric; payload jsonb; risultato jsonb; idpn uuid; altra numeric;$x$;
  b2 text := $x$ if (c.is_paid and pagato=0) or altra>pagato+0.01 then raise exception 'Pagamento storico da riconciliare: nessuna nuova uscita creata'; end if;
 if p_esistente is not null then
  select * into pn from public.prima_nota_entries where id=p_esistente and company_id=c.company_id and direction='uscita' for update;$x$;
  b3 text := $x$jsonb_build_object('prima_nota_id',idpn,'gia_registrato',p_esistente is not null);$x$;
begin
  d := pg_get_functiondef('public.riconcilia_bonifico_fattura(uuid,uuid,text,integer,uuid)'::regprocedure);
  if position('v_parziale' in d) = 0 then
    if position(a1 in d)=0 then a1:=pg_temp.history_fragment(d,a1);end if;
    if position(a2 in d)=0 then a2:=pg_temp.history_fragment(d,a2);end if;
    if position(a3 in d)=0 then a3:=pg_temp.history_fragment(d,a3);end if;
    if position(a4 in d)=0 then a4:=pg_temp.history_fragment(d,a4);end if;
    if position(a1 in d) = 0 or position(a2 in d) = 0 or position(a3 in d) = 0 or position(a4 in d) = 0 then
      raise exception 'riconcilia_bonifico_fattura è cambiata: rivedere la migrazione';
    end if;
    n := replace(d, a1, a1 || ' v_parziale boolean;');
    n := replace(n, a2, $x$  -- Resto sul movimento: non si chiude, la riga è «ripartita» e il resto si abbina altrove.
  v_parziale := abs(t.amount) - v_importo > 0.01;
  IF NOT v_parziale THEN
    UPDATE public.bank_transactions
       SET linked_scadenza_id = v_scad, reconciliation_status = 'reconciled', reconciled_at = now()
     WHERE id = t.id;
  END IF;$x$);
    n := replace(n, a3, $x$    match_type, match_score, matched_at, matched_by, notes, ripartita
  ) VALUES ($x$);
    n := replace(n, a4, $x$    p_match_score, now(), auth.uid(), 'Fattura n. ' || d.numero, v_parziale
  );$x$);
    execute n;
  end if;

  d := pg_get_functiondef('public.registra_pagamento_costo(uuid,uuid,numeric,date,text,text,uuid,uuid)'::regprocedure);
  if position('v_esistente' in d) = 0 then
    if position(b1 in d)=0 then b1:=pg_temp.history_fragment(d,b1);end if;
    if position(b2 in d)=0 then b2:=pg_temp.history_fragment(d,b2);end if;
    if position(b3 in d)=0 then b3:=pg_temp.history_fragment(d,b3);end if;
    if position(b1 in d) = 0 or position(b2 in d) = 0 or position(b3 in d) = 0 then
      raise exception 'registra_pagamento_costo è cambiata: rivedere la migrazione';
    end if;
    n := replace(d, b1, b1 || ' v_esistente uuid := p_esistente;');
    n := replace(n, b2, $x$ -- L'addebito della banca è la prova che i soldi sono usciti: chiude anche un costo segnato pagato senza cassa.
 if p_banca is null and ((c.is_paid and pagato=0) or altra>pagato+0.01) then raise exception 'Pagamento storico da riconciliare: nessuna nuova uscita creata'; end if;
 -- Pagamento già registrato dello stesso importo: si aggancia quello, non se ne crea un altro.
 if v_esistente is null and p_banca is not null and pagato>0 then
  select x.id into v_esistente from public.prima_nota_entries x
   where x.company_id=c.company_id and x.cost_id=c.id and x.direction='uscita' and x.bank_transaction_id is null
     and x.amount=(select abs(b.amount) from public.bank_transactions b where b.id=p_banca and b.company_id=c.company_id)
     and not exists(select 1 from public.prima_nota_entries r where r.reversal_of=x.id)
   order by x.entry_date desc, x.id limit 1;
 end if;
 if v_esistente is not null then
  select * into pn from public.prima_nota_entries where id=v_esistente and company_id=c.company_id and direction='uscita' for update;$x$);
    n := replace(n, b3, $x$jsonb_build_object('prima_nota_id',idpn,'gia_registrato',v_esistente is not null);$x$);
    execute n;
  end if;
end
$migrazione$;

-- «Segna pagata»: con il costo collegato entra anche l'uscita di cassa. Chi non ha il
-- permesso sui costi, o un costo storico, resta col solo segno, come prima.
create or replace function public.segna_fattura_ricevuta_pagata(p_id uuid, p_pagata boolean, p_data date default null::date)
returns date
language plpgsql
set search_path to ''
as $function$
declare
  v_costo uuid;
  v_pagato boolean;
  v_data date := case when p_pagata then coalesce(p_data, (now() at time zone 'Europe/Rome')::date) end;
begin
  if p_data is not null and (p_data > (now() at time zone 'Europe/Rome')::date + 1 or p_data < date '2000-01-01') then
    raise exception 'Data di pagamento non valida' using errcode = '22007';
  end if;

  update public.fatture_ricevute
     set pagata_il = v_data,
         pagamento_segnato_da = auth.uid(),
         pagamento_segnato_at = now()
   where id = p_id
  returning company_cost_id into v_costo;

  if not found then
    raise exception 'Fattura non trovata o senza permesso sui documenti dei fornitori' using errcode = '42501';
  end if;

  if v_costo is not null then
    select is_paid into v_pagato from public.company_costs where id = v_costo;
    if p_pagata then
      if not coalesce(v_pagato, false) then
        begin
          perform public.registra_pagamento_costo(v_costo, pg_catalog.gen_random_uuid(), null, least(v_data, current_date),
            'bonifico', 'Segnata pagata dalla fattura ricevuta');
        exception when insufficient_privilege or raise_exception then
          null;
        end;
      end if;
      update public.rate_fornitori
         set stato = 'pagata', pagata_il = v_data
       where fattura_ricevuta_id = p_id and stato not in ('pagata', 'stornata');
    else
      -- Con un pagamento in cassa si storna (se è legato alla banca, lo storno lo rifiuta).
      if exists (select 1 from public.prima_nota_entries x where x.cost_id = v_costo and x.direction = 'uscita'
                  and not exists (select 1 from public.prima_nota_entries r where r.reversal_of = x.id)) then
        perform public.storna_pagamenti_costo(v_costo, current_date);
      end if;
      update public.rate_fornitori
         set stato = 'da_pagare', pagata_il = null
       where fattura_ricevuta_id = p_id and stato = 'pagata';
    end if;
  end if;

  return v_data;
end;
$function$;