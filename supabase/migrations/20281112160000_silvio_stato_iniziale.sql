-- «Crea con Silvio»: la commessa nata da una riga di testo risultava nella fase «Contratto Firmato».
--
-- `create_order_atomic` senza stato prende il predefinito dell'azienda, e il predefinito è di solito
-- «Contratto Firmato»: va bene per chi crea la commessa a mano dopo la firma, non per Silvio, che
-- parte anche da due righe. Quando la fonte non è un contratto o un preventivo accettato la commessa
-- nasce nella fase «da confermare» dell'azienda, se ne ha una; altrimenti come prima, e lo dice il
-- popup (`avvisoStatoIniziale`). L'espressione è la stessa di `FASE_DA_CONFERMARE` in
-- src/components/silvio-commessa/presentazione.ts: un test le confronta.
--
-- Non cambia niente per chi non usa Silvio: `create_order_atomic` non si tocca, riceve lo stato che
-- ha già sempre accettato in `current_status_id`. Un preventivo passa ancora da
-- `crea_commessa_preventivo_atomic`, che esige lo stato «accettata». Nessuna riga scritta.
-- Provata su Demo Azienda 2 in una transazione annullata: vedi il rapporto della sessione.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

create or replace function public._silvio_stato_iniziale(p_company uuid, p_piano jsonb, p_preventivo uuid)
returns uuid
language sql
stable
set search_path to ''
as $$
  select s.id
    from public.order_statuses s
   where s.company_id = p_company
     and p_preventivo is null
     and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_piano->'fonti') = 'array' then p_piano->'fonti' else '[]'::jsonb end) f
                      where f->>'tipo' = 'contratto')
     and coalesce(s.is_support_phase, false) = false
     and s.name ~* 'da[[:space:]]*conferm|attesa[[:space:]]+(di[[:space:]]+)?conferm|non[[:space:]]+confermat|provvisori'
   order by s.position asc nulls last, s.created_at asc
   limit 1
$$;

revoke all on function public._silvio_stato_iniziale(uuid, jsonb, uuid) from public, anon, authenticated;

comment on function public._silvio_stato_iniziale(uuid, jsonb, uuid) is
  'La fase «da confermare» per una commessa di Silvio che non nasce da un contratto o da un preventivo accettato; null: vale il predefinito.';

-- Il testo di produzione (pg_get_functiondef del 2/11/2026), con le sole righe di `v_stato`.
CREATE OR REPLACE FUNCTION public.commessa_crea_con_silvio(p_bozza_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
declare
  b public.commessa_bozze := public._silvio_bozza(p_bozza_id);
  s jsonb;
  v_colonne jsonb;
  v_quote uuid;
  v_cliente uuid;
  v_dati jsonb;
  v_venditore jsonb;
  v_esito jsonb;
  v_order uuid;
  v_resto jsonb;
  v_set text;
  v_aggiunte jsonb;
  v_registrate integer;
  v_quote_stato text;
  v_stato uuid;
begin
  -- La risposta di prima si è persa (D9): la commessa c'è già, si restituisce quella, così il
  -- popup riprende da dove era (gli allegati) invece di fermarsi su «bozza già usata».
  if b.stato = 'creata' and b.order_id is not null then
    select jsonb_build_object('order_id', o.id, 'customer_id', o.customer_id, 'gia_creata', true,
                              'righe_registrate', (select count(*) from public.commessa_bozze_scritture s where s.bozza_id = b.id))
      into v_aggiunte
      from public.orders o where o.id = b.order_id and o.company_id = b.company_id and o.deleted_at is null;
    if v_aggiunte is not null then return v_aggiunte; end if;
  end if;
  perform public._silvio_pronta(b);
  if not public._silvio_acceso(b.company_id) then
    raise exception '«Crea con Silvio» non è attivo per questa azienda.' using errcode = '42501';
  end if;
  if b.modo <> 'crea' then
    raise exception 'Questa bozza completa una commessa che c''è già: usa «Completa».' using errcode = '22023';
  end if;
  s := b.scrittura;
  v_colonne := public._silvio_colonne(b.company_id, s->'ordine');
  v_quote := nullif(s->>'preventivo_id', '')::uuid;
  if v_quote is not null then
    select q.status into v_quote_stato from public.quotes q where q.id = v_quote and q.company_id = b.company_id;
    if not found then
      raise exception 'Il preventivo d''origine non è di questa azienda.' using errcode = '42501';
    end if;
  end if;

  v_cliente := public._silvio_cliente(b.company_id, coalesce(s->'cliente', '{}'::jsonb), v_quote);
  if v_cliente is null then
    raise exception 'Manca il cliente: sceglilo o crealo, poi crea la commessa.' using errcode = '22023';
  end if;

  if nullif(v_colonne->>'order_code', '') is null then
    v_colonne := v_colonne || jsonb_build_object('order_code', public.prossimo_numero_commessa(b.company_id));
  end if;

  -- I campi della creazione (whitelist di create_order_atomic); il resto dopo, come CreateOrder.
  v_dati := jsonb_build_object('company_id', b.company_id, 'customer_id', v_cliente) || (
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(v_colonne)
     where key in ('order_code', 'description', 'total_amount', 'vat_rate', 'payment_type', 'expected_date',
                   'internal_notes', 'work_start_date', 'work_end_date', 'has_building_bonus', 'assigned_to'));

  -- Senza un contratto o un preventivo accettato non nasce in «Contratto Firmato», se c'è di meglio.
  v_stato := public._silvio_stato_iniziale(b.company_id, b.piano, v_quote);
  if v_stato is not null then
    v_dati := v_dati || jsonb_build_object('current_status_id', v_stato);
  end if;

  select jsonb_build_object('salesperson_id', sp.id, 'commission_type', sp.commission_type, 'commission_value', sp.commission_value)
    into v_venditore
    from public.salespeople sp
   where sp.id = nullif(s->>'venditore', '')::uuid and sp.company_id = b.company_id;

  if v_quote is not null then
    v_esito := public.crea_commessa_preventivo_atomic(v_quote, v_dati, coalesce(s->'righe', '[]'::jsonb),
                                                      coalesce(s->'rate', '[]'::jsonb), v_venditore, null);
  else
    v_esito := public.create_order_atomic(v_dati, coalesce(s->'righe', '[]'::jsonb), v_venditore, auth.uid(),
                                          coalesce(s->'rate', '[]'::jsonb));
  end if;
  v_order := (v_esito->>'id')::uuid;
  if v_order is null then
    raise exception 'La commessa non è nata: risposta inattesa dalla creazione.';
  end if;

  -- Le colonne fuori dalla whitelist della creazione, su una commessa appena nata:
  -- quello che la persona ha tenuto nel popup vince anche su quanto il preventivo ha
  -- copiato (importo e IVA compresi, se ha scelto il contratto).
  v_resto := v_colonne - array['order_code', 'description', 'payment_type', 'expected_date', 'internal_notes',
                               'work_start_date', 'work_end_date', 'has_building_bonus', 'assigned_to'];
  if v_quote is null then
    v_resto := v_resto - array['total_amount', 'vat_rate'];
  end if;
  v_resto := v_resto || jsonb_build_object('created_by', auth.uid());
  select string_agg(format('%I = r.%I', k, k), ', ') into v_set from jsonb_object_keys(v_resto) k;
  execute format('update public.orders o set %s from jsonb_populate_record(null::public.orders, $1) r where o.id = $2', v_set)
    using v_resto, v_order;

  update public.commessa_bozze
     set stato = 'creata', order_id = v_order, eseguita_il = now()
   where id = b.id;
  b.order_id := v_order;

  insert into public.commessa_bozze_scritture (bozza_id, company_id, tabella, riga_id, azione)
  values (b.id, b.company_id, 'orders', v_order, 'creata');

  -- Fasi, voci, date, condizioni: la stessa strada del completamento.
  v_aggiunte := public._silvio_aggiungi(b, v_order);
  -- Su una commessa nata qui le colonne «aggiornate» non servono: si toglie tutta.
  delete from public.commessa_bozze_scritture where bozza_id = b.id and azione = 'aggiornata';
  -- Il preventivo invece resta (D2): la creazione lo segna «convertita», e l'annullamento lo
  -- deve rimettere com'era. Solo lo stato: `version` la tiene il suo trigger.
  if v_quote is not null then
    insert into public.commessa_bozze_scritture (bozza_id, company_id, tabella, riga_id, azione, colonne)
    select b.id, b.company_id, 'quotes', v_quote, 'aggiornata',
           jsonb_build_object('status', jsonb_build_object('prima', v_quote_stato, 'dopo', q.status))
      from public.quotes q where q.id = v_quote and q.status is distinct from v_quote_stato;
  end if;
  v_registrate := public._silvio_registra_nuove(b.id, b.company_id, v_order);
  perform public._silvio_imprimi(b.id);

  return jsonb_build_object('order_id', v_order, 'customer_id', v_cliente, 'righe_registrate', v_registrate + 1,
                            'tolte_permessi', coalesce(s->'tolte_permessi', '[]'::jsonb),
                            'tolte_autonomia', coalesce(s->'tolte_autonomia', '[]'::jsonb))
         || v_aggiunte;
end
$function$;

revoke all on function public.commessa_crea_con_silvio(uuid) from public, anon;
grant execute on function public.commessa_crea_con_silvio(uuid) to authenticated, service_role;
