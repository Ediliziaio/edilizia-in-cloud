-- Il super admin ENTRATO in un'azienda può registrare i costi di quell'azienda,
-- e di nessun'altra (04/11/2026).
--
-- COSA SI POTEVA FARE PRIMA
-- 1. Niente, dal lato buono: le quattro azioni sui costi delle fatture ricevute
--    (`nota_credito_collega`, `nota_credito_scollega`,
--    `commessa_collega_fattura_ricevuta`, `fattura_collega_commesse`) rifiutavano
--    il super admin entrato in un'azienda con 42501, perché
--    `aziende_con_permesso()` non ha un ramo per il super admin.
-- 2. Un buco, dal lato cattivo: `e_super_admin_dentro(azienda)` restituiva NULL
--    (non false) quando `get_my_company_id()` è NULL, cioè quando il super admin
--    NON è entrato in nessuna azienda e il suo profilo non ha un'azienda — che è
--    il caso dell'unico super admin in produzione. I suoi tre chiamanti scrivono
--    `if not (e_super_admin_dentro(x) or …) then raise`: con NULL la condizione
--    non è vera, l'IF non scatta e il controllo NON ferma nessuno. Provato il
--    04/11/2026 in una transazione annullata: il super admin senza alcuna
--    impersonazione in corso ha portato `verifica_manuale` di una fattura di
--    un'azienda qualunque da null a «verificata» passando per
--    `fattura_segna_verifica`. Stesso difetto in `fattura_segna_rettifica` e
--    `mezzo_cerca_nelle_fatture`. Non risulta usato: le uniche due fatture con
--    `verifica_at` valorizzato (02 e 03/11/2026) sono state verificate da utenti
--    delle aziende, non dal super admin, e `central_audit_log` non copre
--    `fatture_ricevute` (copre profiles, user_roles, companies, i piani e gli
--    appuntamenti, dal 19/05/2026).
--
-- COME È PROVATO
-- Un blocco DO con tre fasi (prima / questa migrazione / la variante che mette il
-- super admin dentro `aziende_con_permesso`), sette utenti veri e tutto annullato:
-- super admin entrato per impersonazione, entrato con l'header della scheda
-- azienda, non entrato; amministratore dell'azienda; staff con il permesso costi;
-- staff in sola lettura; staff di un'altra azienda. Per ognuno:
-- `get_my_company_id()`, l'azienda nell'elenco dei permessi, l'ALTRA azienda
-- nell'elenco, `utente_sola_lettura`, e la chiamata vera a
-- `nota_credito_collega` su una fattura TD01 (42501 = fermato dal ruolo,
-- P0001 = controllo passato, «questo documento non è una nota di credito»).
--
-- CHI DEVE CONTINUARE A FUNZIONARE (e nella prova continua)
-- l'amministratore dell'azienda; lo staff con `can_view_costs`; il commercialista
-- (passa da `user_can_write_accountant_company`, qui non toccata); il service
-- role e le funzioni del server, che non passano da queste RPC.
-- CHI DEVE RESTARE FUORI (e resta): lo staff in sola lettura, lo staff di
-- un'altra azienda, il super admin non entrato in nessuna azienda, e il super
-- admin entrato in un'azienda quando la fattura è di un'altra.
--
-- PERCHÉ NON DENTRO `aziende_con_permesso`
-- Aggiungere lì l'azienda del super admin entrato funziona (provato: la fase
-- «dopo A» apre esattamente l'azienda in cui è entrato e nessun'altra, e non
-- cambia niente per chi non è super admin), ma risponde «sì» a QUALUNQUE
-- permesso chiesto, anche a quelli che non sono permessi: `utente_sola_lettura()`
-- chiede `aziende_con_permesso('__solo_amministratori__')` e usa la risposta al
-- negativo. Una funzione che dice «quali aziende mi danno il permesso X»
-- diventerebbe, per il super admin, una che ignora X, in 195 policy su 90
-- tabelle e in 26 funzioni in un colpo. Qui si apre solo ciò che serve, con la
-- forma già in uso da `fattura_segna_verifica`.

set local lock_timeout = '3s';

-- 1. Il controllo non deve mai restituire NULL: con NULL un `if not (…)` non
--    ferma nessuno. `p_azienda = get_my_company_id()` è NULL quando il super
--    admin non è entrato da nessuna parte, quindi il coalesce è il punto.
create or replace function public.e_super_admin_dentro(p_azienda uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    p_azienda is not null
    and public.has_role(auth.uid(), 'super_admin'::public.app_role)
    and p_azienda = public.get_my_company_id(),
  false)
$$;

-- 2. Il permesso di registrare i costi, in un punto solo: chi ha il permesso e
--    non è in sola lettura, oppure il super admin entrato in quell'azienda.
--    Il super admin entrato non ha una riga in `staff_permissions`, quindi la
--    sola lettura non lo riguarda; se un giorno ne avesse una con
--    `sola_lettura`, l'essere entrato come amministratore vince, come già fa
--    `fattura_segna_verifica`.
create or replace function public.puo_registrare_costi(p_azienda uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    public.e_super_admin_dentro(p_azienda)
    or (p_azienda = any (public.aziende_con_permesso('can_view_costs'))
        and not public.utente_sola_lettura(p_azienda)),
  false)
$$;

revoke all on function public.puo_registrare_costi(uuid) from public, anon;
grant execute on function public.puo_registrare_costi(uuid) to authenticated, service_role;

-- 3. Le quattro azioni sui costi delle fatture ricevute. Cambia una riga per
--    funzione: il controllo iniziale. Il resto del corpo è quello di oggi.

create or replace function public.nota_credito_collega(p_nota uuid, p_quote jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
 set lock_timeout to '3s'
as $function$
declare
  n record; f record; q record; k record;
  v_id uuid;
  v_importo_nota numeric; v_imponibile_nota numeric; v_somma numeric; v_quanti integer;
  v_gia_stornato numeric; v_imp_quota numeric; v_imp_usato numeric := 0; v_riduci numeric := 0; v_nota text;
  v_stato_prima text; v_costo_prima uuid; v_stato_fattura text; v_esito jsonb; v_cost uuid; v_credito numeric := 0; v_rifatta text[];
  v_avvisate jsonb := '[]'::jsonb; v_chiuse jsonb := '[]'::jsonb; v_senza_debito jsonb := '[]'::jsonb; v_i integer := 0; v_r numeric;
begin
  select * into n from public.fatture_ricevute where id = p_nota for update;
  if not found then raise exception 'Nota di credito non trovata.' using errcode = 'P0002'; end if;
  if not public.puo_registrare_costi(n.company_id) then
    raise exception 'Il tuo ruolo non permette di registrare i costi.' using errcode = '42501';
  end if;
  if not public.e_nota_credito_ricevuta(n.tipo_documento) then raise exception 'Questo documento non è una nota di credito.' using errcode = 'P0001'; end if;
  if n.stato = 'rifiutata' then raise exception 'La nota di credito è rifiutata: non riduce nessun debito.' using errcode = 'P0001'; end if;
  if p_quote is null or jsonb_typeof(p_quote) <> 'array' or jsonb_array_length(p_quote) = 0 then
    raise exception 'Scegli almeno una fattura da stornare.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_quote) x
              where nullif(x->>'fattura_id', '') is null or coalesce(nullif(x->>'importo', '')::numeric, 0) <= 0) then
    raise exception 'Ogni fattura ha bisogno di un importo maggiore di zero.' using errcode = '22023';
  end if;
  select count(distinct x->>'fattura_id'), count(*), round(sum((x->>'importo')::numeric), 2) into v_i, v_quanti, v_somma from jsonb_array_elements(p_quote) x;
  if v_i <> v_quanti then raise exception 'Una fattura compare due volte.' using errcode = '22023'; end if;
  v_i := 0;

  v_importo_nota := public.nota_credito_importo(n.totale_documento, n.imponibile_totale, n.iva_totale, n.ritenuta_importo);
  if v_importo_nota <= 0 then raise exception 'La nota di credito non ha importi: aprila e completa i dati.' using errcode = '22023'; end if;
  if v_somma > v_importo_nota + 0.01 then
    raise exception 'Le quote (% €) superano la nota di credito (% €).',
      replace(to_char(v_somma, 'FM999999990.00'), '.', ','), replace(to_char(v_importo_nota, 'FM999999990.00'), '.', ',') using errcode = '22023';
  end if;
  v_imponibile_nota := abs(coalesce(n.imponibile_totale, coalesce(n.totale_documento, 0) - coalesce(n.iva_totale, 0)));

  -- Si riparte pulito: cambiare un collegamento è togliere il vecchio e mettere il nuovo, nella stessa transazione.
  v_rifatta := public.nota_credito_scollega_interna(p_nota);
  select * into n from public.fatture_ricevute where id = p_nota;
  v_stato_prima := n.stato;
  v_costo_prima := n.company_cost_id;

  if v_costo_prima is not null and v_quanti > 1 then
    raise exception 'Questa nota rettifica già il costo di un ordine: può stornare una sola fattura, quella di quel costo.' using errcode = 'P0001';
  end if;

  for q in
    select (x.e->>'fattura_id')::uuid as fattura_id, round((x.e->>'importo')::numeric, 2) as importo, x.ord
      from jsonb_array_elements(p_quote) with ordinality as x(e, ord) order by x.ord
  loop
    v_i := v_i + 1;
    select * into f from public.fatture_ricevute where id = q.fattura_id for update;
    if not found or f.company_id <> n.company_id then raise exception 'Una fattura non è di questa azienda.' using errcode = '42501'; end if;
    if f.id = n.id or public.e_nota_credito_ricevuta(f.tipo_documento) or public.e_autofattura_ricevuta(f.tipo_documento) then
      raise exception 'La fattura % non si può stornare con una nota di credito.', f.numero_fattura using errcode = 'P0001';
    end if;
    if f.stato = 'rifiutata' then raise exception 'La fattura % è rifiutata: non c''è un debito da ridurre.', f.numero_fattura using errcode = 'P0001'; end if;
    if not ((public.partner_tax_key(n.cedente_piva) <> '' and public.partner_tax_key(f.cedente_piva) = public.partner_tax_key(n.cedente_piva))
            or (public.partner_tax_key(n.cedente_cf) <> '' and public.partner_tax_key(f.cedente_cf) = public.partner_tax_key(n.cedente_cf))
            or (n.fornitore_id is not null and f.fornitore_id = n.fornitore_id)) then
      raise exception 'La fattura % è di un altro fornitore.', f.numero_fattura using errcode = 'P0001';
    end if;
    select coalesce(sum(s.importo), 0) into v_gia_stornato from public.note_credito_storni s where s.fattura_id = f.id;
    if q.importo + v_gia_stornato > abs(coalesce(f.totale_documento, 0)) + 0.01 then
      raise exception 'La fattura % è di % € e ne sono già stornati % €: non può ricevere altri % €.', f.numero_fattura,
        replace(to_char(abs(coalesce(f.totale_documento, 0)), 'FM999999990.00'), '.', ','),
        replace(to_char(v_gia_stornato, 'FM999999990.00'), '.', ','),
        replace(to_char(q.importo, 'FM999999990.00'), '.', ',') using errcode = 'P0001';
    end if;

    v_cost := f.company_cost_id;
    v_stato_fattura := null;
    if v_costo_prima is not null and v_cost is distinct from v_costo_prima then
      raise exception 'Questa nota rettifica già il costo di un ordine, e la fattura % non è su quel costo.', f.numero_fattura using errcode = 'P0001';
    end if;
    -- Il debito deve esistere per poterlo ridurre. Lo storico importato è già chiuso fuori dal gestionale: lì
    -- resta solo il collegamento.
    if v_cost is null and not coalesce(f.storico_esterno, false) then
      v_esito := public.contabilizza_fattura_ricevuta(f.id);
      v_cost := (v_esito->>'company_cost_id')::uuid;
      if v_esito->>'esito' = 'costo_creato' and not exists (select 1 from public.fattura_ricevuta_ordini o where o.fattura_id = f.id) then
        v_stato_fattura := f.stato;
      end if;
    end if;

    -- L'ultima quota prende il resto dell'imponibile, se la nota è assegnata tutta: niente centesimi persi.
    v_imp_quota := case
      when v_i = v_quanti and v_somma >= v_importo_nota - 0.01 then greatest(0, v_imponibile_nota - v_imp_usato)
      else round(v_imponibile_nota * q.importo / v_importo_nota, 2) end;
    v_imp_usato := v_imp_usato + v_imp_quota;

    v_riduci := 0; v_nota := null;
    if v_cost is not null and v_costo_prima is null then
      select id, amount into k from public.company_costs where id = v_cost for update;
      v_riduci := least(v_imp_quota, coalesce(k.amount, 0));
      v_nota := 'Ridotto di ' || replace(to_char(v_riduci, 'FM999999990.00'), '.', ',') || ' € dalla nota di credito '
                || coalesce(n.numero_fattura, '') || ' del ' || to_char(n.data_fattura, 'DD/MM/YYYY');
      update public.company_costs
         set amount = coalesce(amount, 0) - v_riduci,
             notes = coalesce(notes || ' · ', '') || v_nota,
             updated_at = now()
       where id = v_cost;
    end if;

    insert into public.note_credito_storni
      (company_id, nota_id, fattura_id, company_cost_id, importo, imponibile, costo_ridotto_di, costo_nota,
       nota_stato_prima, nota_costo_prima, fattura_stato_prima, creato_da)
    values
      (n.company_id, n.id, f.id, v_cost, q.importo, v_imp_quota, v_riduci, v_nota,
       v_stato_prima, v_costo_prima, v_stato_fattura, auth.uid())
    returning id into v_id;

    if coalesce(f.storico_esterno, false) and f.company_cost_id is null then
      v_senza_debito := v_senza_debito || to_jsonb(f.numero_fattura);
    else
      v_r := public.nota_credito_riduci_rate(v_id, q.importo);
      v_credito := v_credito + v_r;
    end if;

    select v_avvisate || coalesce(jsonb_agg(jsonb_build_object('fattura', f.numero_fattura, 'numero', e->'numero', 'scadenza', e->'scadenza', 'importo', e->'importo')), '[]'::jsonb)
      into v_avvisate
      from public.note_credito_storni s, jsonb_array_elements(s.rate_ridotte) e
     where s.id = v_id
       and (e->>'stato_prima' = 'avvisata'
            or (e->>'metodo' in ('riba', 'rid') and e->>'stato_prima' = 'da_pagare'
                and (e->>'scadenza')::date <= (now() at time zone 'Europe/Rome')::date + 7));
    if not exists (select 1 from public.rate_fornitori r where r.fattura_ricevuta_id = f.id and r.stato <> 'stornata')
       and exists (select 1 from public.rate_fornitori r where r.fattura_ricevuta_id = f.id) then
      v_chiuse := v_chiuse || to_jsonb(f.numero_fattura);
    end if;
  end loop;

  perform public.nota_credito_riallinea(n.id, v_stato_prima, v_costo_prima);

  return jsonb_build_object(
    'esito', 'collegata', 'fatture', v_quanti, 'stornato', v_somma,
    'non_assegnato', greatest(0, round(v_importo_nota - v_somma, 2)),
    'credito_residuo', v_credito,
    'fatture_chiuse', v_chiuse,
    'riba_avvisate', v_avvisate,
    'solo_collegamento', v_senza_debito);
end
$function$;

create or replace function public.nota_credito_scollega(p_nota uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
 set lock_timeout to '3s'
as $function$
declare
  n record; v_restano text[];
begin
  select id, company_id into n from public.fatture_ricevute where id = p_nota for update;
  if not found then raise exception 'Nota di credito non trovata.' using errcode = 'P0002'; end if;
  if not public.puo_registrare_costi(n.company_id) then
    raise exception 'Il tuo ruolo non permette di registrare i costi.' using errcode = '42501';
  end if;
  v_restano := public.nota_credito_scollega_interna(p_nota);
  return jsonb_build_object('esito', 'scollegata', 'fatture_restano_contabilizzate', to_jsonb(v_restano));
end
$function$;

create or replace function public.commessa_collega_fattura_ricevuta(p_fattura_id uuid, p_order_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
 set lock_timeout to '3s'
as $function$
DECLARE
  f        record;
  v_costo  record;
  v_cost_id uuid;
  v_esito  text := 'collegata';
BEGIN
  SELECT id, company_id, stato, purchase_order_id, company_cost_id, numero_fattura
    INTO f
    FROM public.fatture_ricevute
   WHERE id = p_fattura_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fattura non trovata.' USING errcode = 'P0002';
  END IF;

  IF NOT public.puo_registrare_costi(f.company_id) THEN
    RAISE EXCEPTION 'Il tuo ruolo non permette di registrare i costi delle commesse.' USING errcode = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orders o
                  WHERE o.id = p_order_id AND o.company_id = f.company_id AND o.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Questa commessa non è della stessa azienda della fattura.' USING errcode = '42501';
  END IF;

  IF f.stato = 'rifiutata' THEN
    RAISE EXCEPTION 'La fattura % è rifiutata: non è un costo.', coalesce(f.numero_fattura, '') USING errcode = 'P0001';
  END IF;

  IF f.purchase_order_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.fattura_ricevuta_ordini q WHERE q.fattura_id = f.id) THEN
    RAISE EXCEPTION 'La fattura è collegata a un ordine d''acquisto: la commessa la prende già da lì.' USING errcode = 'P0001';
  END IF;

  v_cost_id := f.company_cost_id;
  IF v_cost_id IS NULL THEN
    v_cost_id := (public.contabilizza_fattura_ricevuta(f.id) ->> 'company_cost_id')::uuid;
    v_esito := 'contabilizzata_e_collegata';
  END IF;

  SELECT id, order_id, allocations INTO v_costo
    FROM public.company_costs
   WHERE id = v_cost_id AND company_id = f.company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Il costo di questa fattura non si trova: aprila dalle fatture ricevute.' USING errcode = 'P0002';
  END IF;

  IF jsonb_typeof(v_costo.allocations) = 'array' AND (jsonb_array_length(v_costo.allocations) > 1
     OR (jsonb_array_length(v_costo.allocations) = 1
         AND (v_costo.allocations -> 0 ->> 'pct')::numeric IS DISTINCT FROM 100)) THEN
    RAISE EXCEPTION 'Questa fattura è ripartita su più commesse: cambiala da Economia → Costi.' USING errcode = 'P0001';
  END IF;

  UPDATE public.company_costs
     SET order_id = p_order_id,
         allocations = CASE WHEN jsonb_typeof(allocations) = 'array' AND jsonb_array_length(allocations) = 1
                            THEN '[]'::jsonb ELSE allocations END,
         updated_at = now()
   WHERE id = v_cost_id;

  UPDATE public.fatture_ricevute
     SET order_id_suggerito = p_order_id, updated_at = now()
   WHERE id = f.id AND order_id_suggerito IS DISTINCT FROM p_order_id;

  RETURN jsonb_build_object(
    'esito', v_esito,
    'fattura_id', f.id,
    'company_cost_id', v_cost_id,
    'order_id', p_order_id,
    'era_su', v_costo.order_id
  );
END
$function$;

create or replace function public.fattura_collega_commesse(p_fattura_id uuid, p_quote jsonb, p_magazzino numeric default 0, p_magazzino_righe jsonb default null::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  f record; v_costo record; v_cost_id uuid; v_base numeric; v_tot numeric; v_n int; v_ordini int; v_quote jsonb;
  v_mag numeric := greatest(coalesce(p_magazzino, 0), 0);
begin
  select id, company_id, stato, purchase_order_id, company_cost_id, numero_fattura, imponibile_totale, totale_documento
    into f from public.fatture_ricevute where id = p_fattura_id for update;
  if not found then raise exception 'Fattura non trovata.' using errcode = 'P0002'; end if;
  if not public.puo_registrare_costi(f.company_id) then
    raise exception 'Il tuo ruolo non permette di registrare i costi delle commesse.' using errcode = '42501';
  end if;
  if f.stato = 'rifiutata' then raise exception 'La fattura è rifiutata: non è un costo.' using errcode = 'P0001'; end if;
  if f.purchase_order_id is not null or exists (select 1 from public.fattura_ricevuta_ordini q where q.fattura_id = f.id) then
    raise exception 'La fattura è collegata a un ordine d''acquisto: scollegala prima, la commessa viene da lì.' using errcode = 'P0001';
  end if;
  if p_quote is null or jsonb_typeof(p_quote) <> 'array' then raise exception 'Quote non valide.' using errcode = '22023'; end if;

  v_base := abs(coalesce(f.imponibile_totale, f.totale_documento, 0));
  v_n := jsonb_array_length(p_quote);
  if (v_n > 0 or v_mag > 0) and v_base = 0 then raise exception 'La fattura non ha un importo da ripartire.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_quote) q
              where coalesce(nullif(q->>'importo', '')::numeric, 0) <= 0 or nullif(q->>'order_id', '') is null) then
    raise exception 'Ogni commessa ha bisogno di un importo.' using errcode = '22023';
  end if;
  select count(distinct q->>'order_id'), coalesce(sum((q->>'importo')::numeric), 0) into v_ordini, v_tot from jsonb_array_elements(p_quote) q;
  if v_ordini <> v_n then raise exception 'Una commessa compare due volte.' using errcode = '22023'; end if;
  if v_tot + v_mag > v_base + 0.01 then
    raise exception 'Commesse e magazzino insieme superano l''imponibile della fattura.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_quote) q
              left join public.orders o on o.id = (q->>'order_id')::uuid and o.company_id = f.company_id and o.deleted_at is null
             where o.id is null) then
    raise exception 'Una commessa non è di questa azienda.' using errcode = '42501';
  end if;

  v_cost_id := f.company_cost_id;
  if v_cost_id is null then
    if v_n = 0 and v_mag = 0 then
      update public.fatture_ricevute set order_id_suggerito = null, updated_at = now() where id = f.id;
      return jsonb_build_object('fattura_id', f.id, 'esito', 'scollegata');
    end if;
    v_cost_id := (public.contabilizza_fattura_ricevuta(f.id) ->> 'company_cost_id')::uuid;
  end if;
  select id, purchase_order_id, order_external_team_id into v_costo
    from public.company_costs where id = v_cost_id and company_id = f.company_id for update;
  if not found then raise exception 'Il costo di questa fattura non si trova.' using errcode = 'P0002'; end if;
  if v_costo.purchase_order_id is not null or v_costo.order_external_team_id is not null then
    raise exception 'Il costo viene da un ordine o da una ditta: si cambia da lì.' using errcode = 'P0001';
  end if;

  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'order_id', q->>'order_id',
           'pct', round((q->>'importo')::numeric / v_base * 100, 4),
           'importo', round((q->>'importo')::numeric, 2),
           'righe', case when jsonb_typeof(q->'righe') = 'array' and jsonb_array_length(q->'righe') > 0 then q->'righe' end)))
    into v_quote from jsonb_array_elements(p_quote) q;

  -- La scorciatoia «una sola commessa, tutta sua» non vale più se una parte
  -- resta in magazzino: lì `order_id` da solo manderebbe l'intero costo sulla
  -- commessa e la quota a magazzino sarebbe contata due volte.
  update public.company_costs
     set order_id = case when v_n = 1 and v_mag <= 0.01 and v_tot >= v_base - 0.01 then (p_quote->0->>'order_id')::uuid end,
         allocations = case when (v_n = 0) or (v_n = 1 and v_mag <= 0.01 and v_tot >= v_base - 0.01) then '[]'::jsonb else v_quote end,
         quota_magazzino = case when v_mag > 0 then round(v_mag, 2) end,
         quota_magazzino_righe = case
           when v_mag > 0 and jsonb_typeof(p_magazzino_righe) = 'array'
                and jsonb_array_length(p_magazzino_righe) > 0 then p_magazzino_righe end,
         updated_at = now()
   where id = v_cost_id;

  update public.fatture_ricevute
     set order_id_suggerito = case when v_n = 1 then (p_quote->0->>'order_id')::uuid end,
         aggancio_oda_manuale = true, updated_at = now()
   where id = f.id;

  return jsonb_build_object('fattura_id', f.id,
                            'esito', case when v_n = 0 and v_mag = 0 then 'scollegata' else 'collegata' end,
                            'company_cost_id', v_cost_id, 'quote', v_n,
                            'magazzino', round(v_mag, 2));
end
$function$;
