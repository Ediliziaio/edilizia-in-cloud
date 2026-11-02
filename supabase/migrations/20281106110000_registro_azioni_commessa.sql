-- Registro di chi ha fatto cosa sulla commessa (pagina Diario).
-- user_action_log registra già quasi tutto, ma non sapeva a quale commessa
-- appartiene un'azione, non teneva i valori e non guardava articoli, rate, allegati
-- e ditte. Qui: order_id e valori (solo per le azioni su una commessa, senza
-- token, codici e firme), trigger sulle tabelle mancanti e una lettura controllata.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.user_action_log
  ADD COLUMN IF NOT EXISTS order_id uuid,
  ADD COLUMN IF NOT EXISTS valori jsonb;
CREATE INDEX IF NOT EXISTS user_action_log_commessa_idx
  ON public.user_action_log (order_id, created_at DESC) WHERE order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.registra_azione_utente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_utente uuid := auth.uid();
  v_riga jsonb;
  v_prima jsonb;
  v_company uuid;
  v_cambi text[];
  v_etichetta text;
  v_chiave text;
  v_id text;
  v_recente bigint;
  v_ordine uuid;
  v_valori jsonb;
begin
  if v_utente is null then
    return coalesce(new, old);
  end if;

  begin
    v_riga := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
    v_id := v_riga ->> 'id';

    -- A quale commessa appartiene: direttamente o attraverso la riga madre.
    v_ordine := case when tg_table_name = 'orders' then v_id::uuid
                     else nullif(coalesce(v_riga ->> 'order_id', v_riga ->> 'ordine_id', ''), '')::uuid end;
    if v_ordine is null then
      if tg_table_name = 'order_work_subphases' then
        select order_id into v_ordine from public.order_work_phases where id = (v_riga ->> 'phase_id')::uuid;
      elsif tg_table_name = 'sal_voci' then
        select order_id into v_ordine from public.sal_records where id = (v_riga ->> 'sal_id')::uuid;
      elsif tg_table_name = 'purchase_order_items' then
        select order_id into v_ordine from public.purchase_orders where id = (v_riga ->> 'purchase_order_id')::uuid;
      end if;
    end if;

    v_company := nullif(v_riga ->> 'company_id', '')::uuid;
    if v_company is null and v_ordine is not null then
      select company_id into v_company from public.orders where id = v_ordine;
    end if;
    if v_company is null then
      return coalesce(new, old);
    end if;

    if tg_op = 'UPDATE' then
      v_prima := to_jsonb(old);
      select array_agg(k order by k) into v_cambi
        from jsonb_object_keys(v_riga) k
       where v_riga -> k is distinct from v_prima -> k
         and k not in ('updated_at', 'updated_by', 'last_activity_at', 'modified_at', 'search_vector', 'fts');
      if v_cambi is null then
        return new;
      end if;

      if v_ordine is not null then
        select jsonb_object_agg(k, jsonb_build_object(
                 'da', case when jsonb_typeof(v_prima -> k) = 'string' then to_jsonb(left(v_prima ->> k, 120)) else v_prima -> k end,
                 'a',  case when jsonb_typeof(v_riga -> k) = 'string' then to_jsonb(left(v_riga ->> k, 120)) else v_riga -> k end))
          into v_valori
          from unnest(v_cambi) k
         where coalesce(jsonb_typeof(v_prima -> k), 'null') in ('string', 'number', 'boolean', 'null')
           and coalesce(jsonb_typeof(v_riga -> k), 'null') in ('string', 'number', 'boolean', 'null')
           and k !~* '(token|otp|hash|secret|password|signature|firma_.*(url|data|ip)|embedding|_ip$|user_agent)';
      end if;

      select id into v_recente
        from public.user_action_log
       where company_id = v_company and user_id = v_utente
         and tabella = tg_table_name and record_id = v_id
         and azione = 'update' and created_at > now() - interval '2 minutes'
       order by created_at desc
       limit 1;
      if v_recente is not null then
        update public.user_action_log l
           set created_at = now(),
               volte = l.volte + 1,
               order_id = coalesce(l.order_id, v_ordine),
               campi_modificati = (
                 select array_agg(distinct c order by c)
                   from unnest(coalesce(l.campi_modificati, '{}') || v_cambi) c
               ),
               -- Nella stessa raffica resta il valore di partenza e l'ultimo di arrivo.
               valori = case when v_valori is null then l.valori else coalesce(l.valori, '{}') || (
                 select jsonb_object_agg(e.key, jsonb_build_object('da', coalesce(l.valori -> e.key -> 'da', e.value -> 'da'), 'a', e.value -> 'a'))
                   from jsonb_each(v_valori) e
               ) end
         where l.id = v_recente;
        return new;
      end if;
    end if;

    foreach v_chiave in array array['name', 'title', 'titolo', 'number', 'numero', 'code', 'codice', 'reference', 'subject', 'nome', 'ragione_sociale', 'description', 'descrizione', 'client_name', 'first_name', 'email', 'file_name', 'label', 'oda_number', 'numero_ddt', 'numero_contratto', 'invoice_number', 'testo'] loop
      v_etichetta := nullif(btrim(coalesce(v_riga ->> v_chiave, '')), '');
      exit when v_etichetta is not null;
    end loop;
    if tg_table_name = 'marketing_contacts' then
      v_etichetta := nullif(btrim(coalesce(v_riga ->> 'first_name', '') || ' ' || coalesce(v_riga ->> 'last_name', '')), '');
    end if;

    insert into public.user_action_log (company_id, user_id, azione, tabella, record_id, etichetta, campi_modificati, order_id, valori)
    values (v_company, v_utente, lower(tg_op), tg_table_name, v_id, left(v_etichetta, 200), v_cambi, v_ordine, v_valori);
  exception when others then
    raise log 'registra_azione_utente: % non registrato su %: %', tg_op, tg_table_name, sqlerrm;
  end;

  return coalesce(new, old);
end;
$function$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['order_items', 'order_employees', 'order_external_teams', 'order_installments', 'order_attachments',
                           'order_salespeople', 'order_errors', 'varianti_cliente', 'sal_subappaltatori', 'order_work_subphases', 'sal_voci', 'surveys'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_registra_azione_utente ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_registra_azione_utente AFTER INSERT OR DELETE OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.registra_azione_utente()', t);
  END LOOP;
END $$;

-- Chi vede la commessa in azienda (non i clienti del portale né gli operai).
-- Senza il permesso sui costi, i valori economici restano nascosti: si vede che
-- il campo è cambiato, non di quanto.
CREATE OR REPLACE FUNCTION public.registro_commessa(p_order_id uuid, p_limite integer DEFAULT 3000)
RETURNS TABLE (id bigint, quando timestamptz, user_id uuid, chi text, azione text, tabella text, record_id text,
               etichetta text, campi text[], valori jsonb, volte integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_utente uuid := auth.uid();
  o record;
  v_costi boolean;
begin
  select c.id, c.company_id, c.assigned_to, c.destination_warehouse_id into o from public.orders c where c.id = p_order_id;
  if not found or v_utente is null then
    return;
  end if;
  if not (
    has_role(v_utente, 'super_admin'::app_role)
    or e_amministratore_di(o.company_id)
    or user_can_read_accountant_company(o.company_id)
    or (o.company_id = get_user_company_id(v_utente) and has_permission(v_utente, 'can_view_orders')
        and can_see_order(o.id, o.assigned_to, o.destination_warehouse_id))
  ) then
    return;
  end if;
  v_costi := has_role(v_utente, 'super_admin'::app_role) or e_amministratore_di(o.company_id) or has_permission(v_utente, 'can_view_costs');

  return query
    select l.id, l.created_at, l.user_id,
           coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email, 'Utente eliminato'),
           l.azione, l.tabella, l.record_id, l.etichetta, l.campi_modificati,
           case when v_costi then l.valori else (
             select jsonb_object_agg(e.key, e.value) from jsonb_each(l.valori) e
              where e.key !~* '(cost|prezz|price|amount|import|total|margin|compens|tariff|provvig|commission|paga|iban|deposit|balance|imponibile|sconto|discount|hourly|rate)'
           ) end,
           l.volte
      from public.user_action_log l
      left join public.profiles p on p.id = l.user_id
     where l.order_id = p_order_id and l.company_id = o.company_id
     order by l.created_at desc
     limit greatest(1, least(p_limite, 5000));
end;
$function$;
REVOKE ALL ON FUNCTION public.registro_commessa(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registro_commessa(uuid, integer) TO authenticated;
