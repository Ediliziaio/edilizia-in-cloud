-- Fattura a rate: una riga di Scadenzario per ogni rata (09/11/2026).
--
-- Il trigger guardava solo il totale: una fattura in tre rate era una riga sola, con
-- l'intero importo a una data. Ora ogni rata ha la sua riga (stesso tag [DOC:id], con
-- rata_numero); gli incassi coprono le rate dalla prima, gli storni tolgono dall'ultima.
-- Una fattura senza rate, o con una sola, resta com'era: una riga.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.scadenze_documento_incassa(p_company uuid, p_documento uuid, p_importo numeric, p_data date, p_pn uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record;
  v_resto numeric := coalesce(p_importo, 0);
  v_taglio numeric;
begin
  for s in
    select id, amount, coalesce(paid_amount, 0) as pagato from public.scadenze
     where company_id = p_company and notes like '%[DOC:' || p_documento::text || ']%' and status <> 'annullata'
     order by coalesce(rata_numero, 0), due_date, id
     for update
  loop
    exit when v_resto <= 0.005;
    v_taglio := least(v_resto, greatest(s.amount - s.pagato, 0));
    continue when v_taglio <= 0;
    update public.scadenze
       set paid_amount = s.pagato + v_taglio,
           status = case when s.pagato + v_taglio >= s.amount - 0.01 then 'pagata' else 'parziale' end,
           paid_date = p_data,
           prima_nota_entry_id = coalesce(prima_nota_entry_id, p_pn),
           updated_at = now()
     where id = s.id;
    v_resto := v_resto - v_taglio;
  end loop;
end;
$function$;

create or replace function public.scadenze_documento_storna(p_company uuid, p_documento uuid, p_importo numeric, p_movimento uuid default null, p_pn uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record;
  v_resto numeric := coalesce(p_importo, 0);
  v_taglio numeric;
begin
  for s in
    select id, coalesce(paid_amount, 0) as pagato from public.scadenze
     where company_id = p_company and notes like '%[DOC:' || p_documento::text || ']%' and status <> 'annullata'
     order by coalesce(rata_numero, 0) desc, due_date desc, id desc
     for update
  loop
    exit when v_resto <= 0.005;
    v_taglio := least(v_resto, s.pagato);
    continue when v_taglio <= 0;
    update public.scadenze
       set paid_amount = greatest(0, s.pagato - v_taglio),
           status = case when s.pagato - v_taglio > 0.01 then 'parziale' else 'da_pagare' end,
           paid_date = case when s.pagato - v_taglio > 0.01 then paid_date else null end,
           prima_nota_entry_id = case
             when prima_nota_entry_id = p_pn
               or prima_nota_entry_id in (select pn.id from public.prima_nota_entries pn where pn.movimento_id = p_movimento)
             then null else prima_nota_entry_id end,
           updated_at = now()
     where id = s.id;
    v_resto := v_resto - v_taglio;
  end loop;
end;
$function$;

revoke all on function public.scadenze_documento_incassa(uuid, uuid, numeric, date, uuid) from public, anon, authenticated;
revoke all on function public.scadenze_documento_storna(uuid, uuid, numeric, uuid, uuid) from public, anon, authenticated;

-- Incasso e storno passano dalle due funzioni.
do $migrazione$
declare
  d text;
  inizio int;
  fine int;
  c_fine constant text := $x$AND status <> 'annullata';$x$;
  a1 constant text := $x$  UPDATE scadenze
     SET paid_amount = LEAST(COALESCE(paid_amount, 0) + p_importo, amount),$x$;
  a2 constant text := $x$    UPDATE scadenze
       SET paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - v_importo),$x$;
begin
  d := pg_get_functiondef('public.registra_incasso_atomico(uuid,uuid,numeric,text,date,text,text)'::regprocedure);
  if position('scadenze_documento_incassa' in d) = 0 then
    inizio := position(a1 in d);
    if inizio = 0 then raise exception 'registra_incasso_atomico è cambiata: rivedere la migrazione'; end if;
    fine := inizio + position(c_fine in substr(d, inizio)) - 1 + length(c_fine);
    execute substr(d, 1, inizio - 1)
      || '  PERFORM public.scadenze_documento_incassa(p_company_id, p_documento_id, p_importo, p_data_movimento, v_pn_id);'
      || substr(d, fine);
  end if;

  d := pg_get_functiondef('public.storna_incasso_atomico(uuid,uuid)'::regprocedure);
  if position('scadenze_documento_storna' in d) = 0 then
    inizio := position(a2 in d);
    if inizio = 0 then raise exception 'storna_incasso_atomico è cambiata: rivedere la migrazione'; end if;
    fine := inizio + position(c_fine in substr(d, inizio)) - 1 + length(c_fine);
    execute substr(d, 1, inizio - 1)
      || '    PERFORM public.scadenze_documento_storna(p_company_id, v_documento_id, v_importo, p_movimento_id);'
      || substr(d, fine);
  end if;
end
$migrazione$;

create or replace function public.sync_scadenza_da_documento_fiscale()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_scad_id uuid;
  v_scad_amount numeric;
  v_scad_paid numeric;
  v_due date;
  v_amount numeric;
  v_tag text;
  v_pn_id uuid;
  v_residuo numeric;
  v_pn_amount numeric;
  v_rate jsonb;
  v_quante integer;
  v_resto numeric;
  v_quota numeric;
  v_i integer := 0;
  v_rata jsonb;
  v_descrizione text;
BEGIN
  -- Solo fatture: la nota di credito non genera un credito da incassare
  -- (e scadenze vieta gli importi negativi).
  IF NEW.tipo NOT IN ('fattura', 'fattura_pa') THEN
    RETURN NEW;
  END IF;

  v_tag := '[DOC:' || NEW.id::text || ']';

  -- ── Documento tornato bozza o annullato: si smonta tutto ────────────────
  IF NEW.stato IN ('bozza', 'annullata') THEN
    DELETE FROM public.prima_nota_entries
    WHERE documento_fiscale_id = NEW.id
      AND is_auto = true AND auto_source = 'documento_fiscale'
    RETURNING amount, id INTO v_pn_amount, v_pn_id;

    IF v_pn_amount IS NOT NULL THEN
      PERFORM public.scadenze_documento_storna(NEW.company_id, NEW.id, v_pn_amount, NULL, v_pn_id);
    END IF;

    DELETE FROM public.scadenze
    WHERE company_id = NEW.company_id
      AND notes LIKE '%' || v_tag || '%'
      AND COALESCE(paid_amount, 0) = 0;
    RETURN NEW;
  END IF;

  v_due := COALESCE(
    NEW.data_scadenza,
    (SELECT min((r ->> 'data_scadenza')::date)
       FROM jsonb_array_elements(COALESCE(NEW.scadenze_pagamento, '[]'::jsonb)) r
      WHERE r ->> 'data_scadenza' ~ '^\d{4}-\d{2}-\d{2}$'
        AND COALESCE((r ->> 'pagato')::boolean, false) = false),
    NEW.data_emissione + 30, CURRENT_DATE + 30);
  v_amount := COALESCE(NEW.totale_da_pagare, NEW.totale_documento, 0)
               - public.documento_stornato_totale(NEW.id);

  IF v_amount <= 0.005 THEN
    -- stornata per intero: niente più da incassare
    DELETE FROM public.scadenze
    WHERE company_id = NEW.company_id
      AND notes LIKE '%' || v_tag || '%'
      AND COALESCE(paid_amount, 0) = 0;
    RETURN NEW;
  END IF;

  v_descrizione := NEW.numero || ' — ' || COALESCE(NEW.cliente_snapshot->>'ragione_sociale', 'Cliente');

  SELECT coalesce(jsonb_agg(r ORDER BY (r ->> 'data_scadenza')), '[]'::jsonb) INTO v_rate
    FROM jsonb_array_elements(COALESCE(NEW.scadenze_pagamento, '[]'::jsonb)) r
   WHERE r ->> 'data_scadenza' ~ '^\d{4}-\d{2}-\d{2}$'
     AND coalesce(public.num_da_json(r ->> 'importo'), 0) > 0;
  v_quante := jsonb_array_length(v_rate);

  IF v_quante >= 2 THEN
    -- Una riga per rata. Quello che uno storno toglie sparisce dalle ultime; l'ultima
    -- assorbe i centesimi perché il totale torni sempre.
    UPDATE public.scadenze SET rata_numero = 1
     WHERE company_id = NEW.company_id AND notes LIKE '%' || v_tag || '%' AND rata_numero IS NULL;

    v_resto := v_amount;
    FOR v_rata IN SELECT value FROM jsonb_array_elements(v_rate) LOOP
      v_i := v_i + 1;
      v_quota := CASE WHEN v_i = v_quante THEN v_resto
                      ELSE least(public.num_da_json(v_rata ->> 'importo'), v_resto) END;
      IF v_quota <= 0.005 THEN
        DELETE FROM public.scadenze
         WHERE company_id = NEW.company_id AND notes LIKE '%' || v_tag || '%'
           AND rata_numero = v_i AND COALESCE(paid_amount, 0) = 0;
        CONTINUE;
      END IF;

      UPDATE public.scadenze
         SET amount = GREATEST(v_quota, COALESCE(paid_amount, 0)),
             due_date = (v_rata ->> 'data_scadenza')::date,
             description = v_descrizione || ' (rata ' || v_i || '/' || v_quante || ')',
             updated_at = now()
       WHERE company_id = NEW.company_id AND notes LIKE '%' || v_tag || '%' AND rata_numero = v_i;
      IF NOT FOUND THEN
        INSERT INTO public.scadenze (company_id, tipo, description, amount, due_date,
               status, order_id, is_auto_generated, auto_source, notes, rata_numero, created_at)
        VALUES (NEW.company_id, 'incasso_cliente', v_descrizione || ' (rata ' || v_i || '/' || v_quante || ')',
               v_quota, (v_rata ->> 'data_scadenza')::date, 'da_pagare',
               NEW.ordine_id, true, 'documento_fiscale', v_tag, v_i, now());
      END IF;
      v_resto := v_resto - v_quota;
    END LOOP;

    DELETE FROM public.scadenze
     WHERE company_id = NEW.company_id AND notes LIKE '%' || v_tag || '%'
       AND rata_numero > v_quante AND COALESCE(paid_amount, 0) = 0;
  ELSE
    SELECT id INTO v_scad_id
    FROM public.scadenze
    WHERE company_id = NEW.company_id AND notes LIKE '%' || v_tag || '%'
    ORDER BY COALESCE(rata_numero, 0)
    LIMIT 1;

    IF v_scad_id IS NULL THEN
      INSERT INTO public.scadenze (company_id, tipo, description, amount, due_date,
             status, order_id, is_auto_generated, auto_source, notes, created_at)
      VALUES (NEW.company_id, 'incasso_cliente', v_descrizione, v_amount, v_due, 'da_pagare',
             NEW.ordine_id, true, 'documento_fiscale', v_tag, now());
    ELSE
      UPDATE public.scadenze
      SET amount = GREATEST(v_amount, COALESCE(paid_amount, 0)), due_date = v_due, updated_at = now()
      WHERE id = v_scad_id;
      DELETE FROM public.scadenze
       WHERE company_id = NEW.company_id AND notes LIKE '%' || v_tag || '%'
         AND id <> v_scad_id AND COALESCE(paid_amount, 0) = 0;
    END IF;
  END IF;

  SELECT (array_agg(id ORDER BY COALESCE(rata_numero, 0)))[1], COALESCE(sum(amount), 0), COALESCE(sum(paid_amount), 0)
    INTO v_scad_id, v_scad_amount, v_scad_paid
  FROM public.scadenze
  WHERE company_id = NEW.company_id AND notes LIKE '%' || v_tag || '%' AND status <> 'annullata';

  IF NEW.stato = 'pagata' THEN
    v_residuo := v_scad_amount - v_scad_paid;

    -- Niente da fare se è già tutto incassato o se una registrazione
    -- automatica per questo documento esiste già: fino al 20/09/2026 qui si
    -- guardava solo auto_source = 'documento_fiscale', e l'incasso scritto da
    -- registra_incasso_atomico ('incasso_fattura') veniva contato due volte.
    IF v_residuo > 0 AND NOT EXISTS (
      SELECT 1 FROM public.prima_nota_entries
      WHERE documento_fiscale_id = NEW.id AND is_auto = true
    ) THEN
      INSERT INTO public.prima_nota_entries (
        company_id, direction, category, description, amount, entry_date,
        account_label, order_id, scadenza_id, documento_fiscale_id,
        is_auto, auto_source, created_by
      ) VALUES (
        NEW.company_id, 'entrata', 'incasso',
        'Incasso ' || NEW.numero || ' — ' ||
          COALESCE(NEW.cliente_snapshot->>'ragione_sociale', 'Cliente'),
        v_residuo, COALESCE(NEW.pagato_at::date, CURRENT_DATE),
        'banca', NEW.ordine_id, v_scad_id, NEW.id,
        true, 'documento_fiscale', (SELECT auth.uid())
      )
      RETURNING id INTO v_pn_id;

      PERFORM public.scadenze_documento_incassa(NEW.company_id, NEW.id, v_residuo, COALESCE(NEW.pagato_at::date, CURRENT_DATE), v_pn_id);
    END IF;

  ELSE
    -- Non è più pagata: si annulla SOLO la registrazione automatica del trigger.
    DELETE FROM public.prima_nota_entries
    WHERE documento_fiscale_id = NEW.id
      AND is_auto = true AND auto_source = 'documento_fiscale'
    RETURNING amount, id INTO v_pn_amount, v_pn_id;

    IF v_pn_amount IS NOT NULL THEN
      PERFORM public.scadenze_documento_storna(NEW.company_id, NEW.id, v_pn_amount, NULL, v_pn_id);
    ELSIF v_scad_paid = 0 THEN
      UPDATE public.scadenze SET status = 'da_pagare', updated_at = now()
      WHERE company_id = NEW.company_id AND notes LIKE '%' || v_tag || '%' AND status NOT IN ('da_pagare', 'annullata');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
