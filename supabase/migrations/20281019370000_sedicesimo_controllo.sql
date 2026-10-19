-- Sedicesimo controllo (19/10/2026).
--
-- Incassi delle fatture emesse
--  1. Lo storno di un incasso toglie l'importo una volta sola: il pagato è la somma dei movimenti
--     rimasti (prima si toglieva due volte e la fattura accettava incassi oltre il totale).
--  2. Il pagato di un documento non è mai vuoto (zero all'inserimento): con il pagato vuoto un incasso
--     pieno lasciava la fattura «parzialmente pagata» e accettava incassi senza limite.
--  3. Si incassano solo fatture vive: niente bozze, annullate, stornate, nel cestino, né note di
--     credito. Lo storno non rimette «emessa» un documento annullato.
--  4. Incassare e stornare: chi ha fatturazione, scadenzario, tesoreria o pagamenti (non chi gestisce
--     solo i ticket o i fornitori).
--  5. Numeri oltre 9.999 scritti per intero (prima «FT-2026-1000» per 10.000 e 10.001).
--  6. «Paga» nello scadenzario sulla scadenza di una fattura: si registra dalla fattura, così l'incasso
--     entra una volta sola.
-- Costi tra aziende
--  7. Un costo si ripartisce solo su commesse della propria azienda, al massimo al 100%.
--  8. Una fattura ricevuta si collega solo a un ordine al fornitore della propria azienda; il costo
--     dell'ordine ricevuto guarda i costi della sua azienda.
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

-- 4 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.puo_incassare_fatture(_company_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(
    auth.uid() is not null
    and _company_id is not null
    and not public.utente_bloccato()
    and not public.utente_e_cliente_esterno()
    and (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      or public.user_can_write_accountant_company(_company_id)
      or _company_id = any (public.aziende_con_uno_dei_permessi(array[
           'can_view_billing', 'can_view_scadenzario', 'can_view_tesoreria', 'can_manage_payments']))
    ),
    false);
$function$;
revoke all on function public.puo_incassare_fatture(uuid) from public, anon;
grant execute on function public.puo_incassare_fatture(uuid) to authenticated, service_role;

select pg_temp.sostituisci('public.registra_incasso_atomico(uuid,uuid,numeric,text,date,text,text)',
  $v$  IF auth.uid() IS NOT NULL AND NOT public.puo_gestire_scadenze(p_company_id) THEN$v$,
  $n$  IF auth.uid() IS NOT NULL AND NOT public.puo_incassare_fatture(p_company_id) THEN$n$);
select pg_temp.sostituisci('public.storna_incasso_atomico(uuid,uuid)',
  $v$  IF auth.uid() IS NOT NULL AND NOT public.puo_gestire_scadenze(p_company_id) THEN$v$,
  $n$  IF auth.uid() IS NOT NULL AND NOT public.puo_incassare_fatture(p_company_id) THEN$n$);

-- 2 e 3 ────────────────────────────────────────────────────────────────────────────────────
select pg_temp.sostituisci('public.registra_incasso_atomico(uuid,uuid,numeric,text,date,text,text)',
  $v$  SELECT totale_da_pagare, importo_pagato, numero, tipo
    INTO v_totale, v_pagato, v_numero, v_tipo
    FROM documenti_fiscali WHERE id=p_documento_id AND company_id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento non trovato'; END IF;$v$,
  $n$  SELECT totale_da_pagare, coalesce(importo_pagato, 0), numero, tipo
    INTO v_totale, v_pagato, v_numero, v_tipo
    FROM documenti_fiscali WHERE id=p_documento_id AND company_id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento non trovato'; END IF;
  -- Si incassa una fattura viva: non una bozza, un documento annullato, stornato o nel cestino,
  -- né una nota di credito (quella riduce la fattura, non è un incasso).
  IF EXISTS (SELECT 1 FROM documenti_fiscali
              WHERE id = p_documento_id
                AND (deleted_at IS NOT NULL OR stato IN ('bozza', 'annullata', 'stornata') OR tipo = 'nota_credito')) THEN
    RAISE EXCEPTION 'Su questo documento non si registrano incassi: è una bozza, una nota di credito, oppure è annullato o nel cestino.' USING ERRCODE = '22023';
  END IF;$n$);
select pg_temp.sostituisci('public.registra_incasso_atomico(uuid,uuid,numeric,text,date,text,text)',
  $v$  v_nuovo_pagato := v_pagato + p_importo;$v$,
  $n$  v_nuovo_pagato := coalesce(v_pagato, 0) + p_importo;$n$);

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.sostituisci('public.storna_incasso_atomico(uuid,uuid)',
  $v$      v_nuovo_pagato := GREATEST(0, v_pagato - v_importo);$v$,
  $n$      -- il pagato è la somma degli incassi rimasti (il movimento è già cancellato)
      SELECT COALESCE(SUM(importo), 0) INTO v_nuovo_pagato FROM movimenti_cassa_native
       WHERE documento_id = v_documento_id AND tipo = 'incasso';$n$);
select pg_temp.sostituisci('public.storna_incasso_atomico(uuid,uuid)',
  $v$      UPDATE documenti_fiscali SET importo_pagato = v_nuovo_pagato, stato = v_nuovo_stato,
        pagato_at = CASE WHEN v_nuovo_stato = 'pagata' THEN pagato_at ELSE NULL END, updated_at = now()
      WHERE id = v_documento_id;$v$,
  $n$      -- un documento annullato, stornato o in bozza resta com'è: cambia solo il pagato
      UPDATE documenti_fiscali SET importo_pagato = v_nuovo_pagato,
        stato = CASE WHEN stato IN ('annullata', 'stornata', 'bozza', 'rifiutata') THEN stato ELSE v_nuovo_stato END,
        pagato_at = CASE WHEN v_nuovo_stato = 'pagata' THEN pagato_at ELSE NULL END, updated_at = now()
      WHERE id = v_documento_id;$n$);

-- Il pagato non è mai vuoto: zero all'inserimento, anche quando chi crea il documento lo passa nullo.
create or replace function public.documento_pagato_mai_vuoto()
returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  new.importo_pagato := coalesce(new.importo_pagato, 0);
  return new;
end
$function$;
revoke all on function public.documento_pagato_mai_vuoto() from public, anon, authenticated;
drop trigger if exists documento_pagato_mai_vuoto on public.documenti_fiscali;
create trigger documento_pagato_mai_vuoto before insert or update of importo_pagato on public.documenti_fiscali
  for each row execute function public.documento_pagato_mai_vuoto();
alter table public.documenti_fiscali alter column importo_pagato set default 0;
-- I documenti già senza pagato: la somma dei loro incassi (poche righe).
update public.documenti_fiscali d
   set importo_pagato = coalesce((select sum(m.importo) from public.movimenti_cassa_native m
                                   where m.documento_id = d.id and m.tipo = 'incasso'), 0)
 where d.importo_pagato is null;

-- 5 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.formatta_numero_documento(p_formato text, p_prefisso text, p_prog integer, p_anno integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- quattro cifre come minimo, mai tagliate: 10000 resta 10000
  select replace(replace(replace(replace(replace(
           coalesce(p_formato, '{prefisso}-{yyyy}-{nnnn}'),
           '{prefisso}', p_prefisso), '{yyyy}', p_anno::text), '{yy}', right(p_anno::text, 2)),
           '{nnnn}', case when p_prog >= 10000 then p_prog::text else lpad(p_prog::text, 4, '0') end),
           '{n}', p_prog::text);
$function$;

-- 6 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.sostituisci('public.mark_scadenza_paid(uuid,numeric,text,date,text,text)',
  $v$  v_remaining := v_scadenza.amount - v_scadenza.paid_amount;$v$,
  $n$  -- La scadenza di una fattura emessa si incassa dalla fattura: così l'incasso entra una volta sola
  -- (movimento, prima nota, rata).
  IF coalesce(v_scadenza.notes, '') LIKE '%[DOC:%' THEN
    RETURN json_build_object('error', 'Questa scadenza è di una fattura: registra l''incasso dalla fattura.');
  END IF;

  v_remaining := v_scadenza.amount - v_scadenza.paid_amount;$n$);

-- 7 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.costo_ripartizione_valida()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_tot numeric;
begin
  if new.allocations is null or jsonb_typeof(new.allocations) <> 'array' or jsonb_array_length(new.allocations) = 0 then
    return new;
  end if;
  if exists (select 1 from jsonb_array_elements(new.allocations) a
              left join public.orders o on o.id = nullif(a->>'order_id', '')::uuid
             where o.id is null or o.company_id <> new.company_id) then
    raise exception 'Un costo si ripartisce solo sulle commesse della propria azienda.' using errcode = '42501';
  end if;
  select coalesce(sum(nullif(a->>'pct', '')::numeric), 0) into v_tot from jsonb_array_elements(new.allocations) a;
  if v_tot > 100.01 then
    raise exception 'La ripartizione supera il 100%%.' using errcode = '22023';
  end if;
  return new;
end
$function$;
revoke all on function public.costo_ripartizione_valida() from public, anon, authenticated;
drop trigger if exists costo_ripartizione_valida on public.company_costs;
create trigger costo_ripartizione_valida before insert or update of allocations, company_id on public.company_costs
  for each row execute function public.costo_ripartizione_valida();

-- 8 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.fattura_ricevuta_ordine_stessa_azienda()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.purchase_order_id is not null
     and not exists (select 1 from public.purchase_orders po
                      where po.id = new.purchase_order_id and po.company_id = new.company_id) then
    raise exception 'Questo ordine al fornitore non è della tua azienda.' using errcode = '42501';
  end if;
  return new;
end
$function$;
revoke all on function public.fattura_ricevuta_ordine_stessa_azienda() from public, anon, authenticated;
drop trigger if exists fattura_ricevuta_ordine_stessa_azienda on public.fatture_ricevute;
create trigger fattura_ricevuta_ordine_stessa_azienda before insert or update of purchase_order_id, company_id on public.fatture_ricevute
  for each row execute function public.fattura_ricevuta_ordine_stessa_azienda();

select pg_temp.sostituisci('public.crea_costo_da_ricezione_oda()',
  $v$  if exists (select 1 from company_costs c where c.purchase_order_id = new.id) then$v$,
  $n$  if exists (select 1 from company_costs c where c.purchase_order_id = new.id and c.company_id = new.company_id) then$n$);
