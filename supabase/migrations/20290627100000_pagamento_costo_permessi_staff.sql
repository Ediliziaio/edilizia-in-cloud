-- Il pannello delle fatture ricevute permette a chi gestisce i costi di togliere
-- un pagamento, ma il comando precedente richiedeva un amministratore di Prima
-- Nota. Chi non poteva vedere l'intero registro non trovava nemmeno il movimento.
-- Questo percorso riguarda soltanto il pagamento di un costo: non concede allo
-- staff il permesso DELETE o l'accesso generale al registro di Prima Nota.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Eseguita soltanto dal comando pubblico, dopo il suo controllo dell'azienda.
-- Conserva la stessa eliminazione atomica e lo stesso audit della Prima Nota.
create or replace function private.pagamento_costo_rimuovi(p_movimento uuid, p_versione timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  p public.prima_nota_entries;
  c public.company_costs;
  prima numeric; dopo numeric; totale numeric;
  rate_n integer; rate_chiuse numeric; n integer;
  esito jsonb;
begin
  select * into p from public.prima_nota_entries where id = p_movimento;
  if not found or p.cost_id is null or p.direction is distinct from 'uscita' then
    raise exception 'Pagamento del costo non disponibile.' using errcode = 'P0002';
  end if;
  perform public.spesa_pagamento_autorizza(p.company_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p.company_id::text, 2810));
  select * into c from public.company_costs where id = p.cost_id and company_id = p.company_id for update;
  if not found then raise exception 'Costo collegato non disponibile.' using errcode = '42501'; end if;
  perform 1 from public.prima_nota_entries where cost_id = c.id and company_id = c.company_id order by id for update;
  select * into p from public.prima_nota_entries where id = p_movimento and company_id = c.company_id and cost_id = c.id for update;
  if not found or p_versione is null or p.updated_at is distinct from p_versione then
    raise exception 'Il pagamento è cambiato. Ricarica la fattura prima di toglierlo.' using errcode = 'PT409';
  end if;
  if p.direction is distinct from 'uscita' or public.pagamento_costo_annullabile(p) is not null then
    raise exception 'Il pagamento non può essere tolto da qui. Verifica il movimento di origine.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sal_sub_pagamenti s where s.prima_nota_id = p.id)
    or exists (select 1 from public.bank_reconciliations b where b.prima_nota_id = p.id and b.unmatched_at is null)
    or exists (select 1 from public.unita_movimenti u where u.prima_nota_id = p.id or u.storno_prima_nota_id = p.id) then
    raise exception 'Il pagamento ha un collegamento a banca, SAL o unità: gestisci prima il collegamento di origine.' using errcode = 'P0001';
  end if;

  select coalesce(sum(case when x.direction = 'uscita' then x.amount else -x.amount end), 0),
         coalesce(sum(case when x.direction = 'uscita' then x.amount else -x.amount end) filter (where x.id <> p.id), 0)
    into prima, dopo
    from public.prima_nota_entries x
   where x.company_id = c.company_id and (x.cost_id = c.id or exists (
     select 1 from public.scadenze s where s.id = x.scadenza_id and s.cost_id = c.id and s.company_id = c.company_id
   ));
  if prima is distinct from dopo then
    if c.annullato_il is not null then
      raise exception 'Il costo è annullato: verifica il pagamento prima di modificarlo.' using errcode = 'P0001';
    end if;
    totale := public.spesa_pagamento_totale(c.id);
    if totale is null or totale <= 0 or dopo < 0 or dopo > totale + 0.01 then
      raise exception 'L’eliminazione lascerebbe importi incoerenti sul costo: verifica le registrazioni collegate.' using errcode = 'P0001';
    end if;
    if c.is_paid and prima < totale - 0.01 then
      raise exception 'Il costo risulta pagato anche con importi storici: verifica il documento prima di eliminarne i pagamenti.' using errcode = 'P0001';
    end if;
    perform 1 from public.rate_fornitori where company_cost_id = c.id and company_id = c.company_id order by id for update;
    select count(*), coalesce(sum(importo) filter (where stato = 'pagata'), 0)
      into rate_n, rate_chiuse from public.rate_fornitori
     where company_cost_id = c.id and company_id = c.company_id and stato <> 'stornata';
    if rate_n > 1 and dopo < rate_chiuse - 0.01 then
      raise exception 'Il pagamento copre più rate: riapri la rata corretta dal documento prima di eliminare la registrazione.' using errcode = 'P0001';
    end if;
  end if;

  esito := jsonb_build_object('eliminata', true, 'eliminati_ids', array[p.id], 'cost_id', c.id,
    'residuo', case when totale is not null then greatest(0, totale - dopo) end);
  insert into public.prima_nota_cancellazioni(entry_id, company_id, payment_request_id, snapshot, esito, deleted_by)
    values (p.id, p.company_id, p.payment_request_id, to_jsonb(p), esito, auth.uid());
  delete from public.prima_nota_entries where id = p.id and company_id = c.company_id and cost_id = c.id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Il pagamento è cambiato. Ricarica la fattura.' using errcode = 'PT409'; end if;

  if prima is distinct from dopo then
    if dopo = 0 and c.is_paid then
      update public.company_costs set is_paid = false, paid_date = null where id = c.id and company_id = c.company_id;
    end if;
    perform public.spesa_pagamento_sincronizza(c.id);
    if (select count(*) from public.rate_fornitori where company_cost_id = c.id and company_id = c.company_id and stato <> 'stornata') = 1 then
      update public.rate_fornitori set stato = 'da_pagare', pagata_il = null
       where company_cost_id = c.id and company_id = c.company_id and stato = 'pagata' and importo > dopo + 0.01;
    end if;
  end if;
  return esito;
end $function$;
revoke all on function private.pagamento_costo_rimuovi(uuid, timestamptz) from public, anon, authenticated;

-- Il definer dedicato legge SOLO il pagamento uscente di un costo autorizzato:
-- non espone il registro e non si occupa delle altre scritture di Prima Nota.
-- Per quelle restituisce null, lasciandole al percorso invoker già esistente.
create or replace function private.pagamento_costo_annulla_dedicato(p_movimento uuid, p_versione timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  p public.prima_nota_entries;
  azienda uuid;
  costo uuid;
  prova jsonb;
  motivo text;
begin
  if auth.uid() is null or public.utente_bloccato() then
    raise exception 'Pagamento non disponibile per questo accesso.' using errcode = '42501';
  end if;
  select * into p from public.prima_nota_entries
   where id = p_movimento and public.user_can_access_company(company_id);
  if not found or p.cost_id is null or p.direction is distinct from 'uscita' then return null; end if;
  perform public.spesa_pagamento_autorizza(p.company_id);
  azienda := p.company_id;
  costo := p.cost_id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(azienda::text, 2810));
  if costo is not null then
    perform 1 from public.company_costs where id = costo and company_id = azienda for update;
    if not found then raise exception 'Costo collegato non disponibile.' using errcode = '42501'; end if;
    perform 1 from public.prima_nota_entries where cost_id = costo and company_id = azienda order by id for update;
  end if;
  select * into p from public.prima_nota_entries where id = p_movimento and company_id = azienda for update;
  if not found or p.cost_id is distinct from costo or p_versione is null or p.updated_at is distinct from p_versione then
    raise exception 'Il pagamento è cambiato. Ricarica la fattura prima di toglierlo.' using errcode = 'PT409';
  end if;
  motivo := public.pagamento_costo_annullabile(p);
  if motivo is not null then raise exception '%', motivo using errcode = 'P0001'; end if;

  prova := public.pagamento_saldo_rapido_aperto(p.id);
  if prova is not null then
    perform public.annulla_saldo_fattura_ricevuta((prova->>'fattura_id')::uuid, (prova->>'richiesta')::uuid);
    return jsonb_build_object('via', 'saldo_rapido', 'fattura_id', prova->>'fattura_id', 'annullato', true);
  end if;

  return private.pagamento_costo_rimuovi(p.id, p_versione)
    || jsonb_build_object('via', 'prima_nota', 'annullato', true);
end $function$;
revoke all on function private.pagamento_costo_annulla_dedicato(uuid, timestamptz) from public, anon;
grant execute on function private.pagamento_costo_annulla_dedicato(uuid, timestamptz) to authenticated, service_role;

-- Le altre registrazioni continuano a usare le policy RLS del chiamante e i
-- permessi amministrativi di prima_nota_elimina_registrazione, come prima.
create or replace function public.pagamento_costo_annulla(p_movimento uuid, p_versione timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  p public.prima_nota_entries;
  risultato jsonb;
  prova jsonb;
  motivo text;
begin
  risultato := private.pagamento_costo_annulla_dedicato(p_movimento, p_versione);
  if risultato is not null then return risultato; end if;
  select * into p from public.prima_nota_entries where id = p_movimento;
  if not found then
    raise exception 'Pagamento non trovato o non visibile. Ricarica la pagina.' using errcode = 'P0002';
  end if;
  if p_versione is null or p.updated_at is distinct from p_versione then
    raise exception 'Il pagamento è cambiato. Ricarica la fattura prima di toglierlo.' using errcode = 'PT409';
  end if;
  motivo := public.pagamento_costo_annullabile(p);
  if motivo is not null then raise exception '%', motivo using errcode = 'P0001'; end if;
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
