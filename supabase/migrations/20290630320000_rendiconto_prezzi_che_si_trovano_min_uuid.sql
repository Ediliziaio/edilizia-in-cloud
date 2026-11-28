-- `min()` non esiste su uuid: le due funzioni dei prezzi contavano male i candidati
-- ───────────────────────────────────────────────────────────────────────────────
-- 28/11/2026, provando la 20290630310000 appena applicata:
--
--     ERROR 42883: function min(uuid) does not exist
--
-- `voce_manodopera_predefinita` e `voce_materiale_per_nome` contavano i candidati con
-- `select count(*), min(at.id)`. Su `uuid` non c'è `min()`. Riscritte contando a parte e prendendo
-- il primo candidato con una sottoquery: il comportamento voluto non cambia — una sola voce
-- candidata si usa, due o più non si indovinano.
--
-- Provate subito dopo su Impresa Vulcano: la manodopera della commessa «TRASPORTI» trova «Ore
-- economia operai» del committente (32 euro all'ora), quella di «FOSCOLO» la voce già scelta sulla
-- commessa, un materiale col nome identico (anche con spazi e maiuscole diverse) trova la sua voce,
-- e «cemento» da solo non trova niente.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

create or replace function private.voce_manodopera_predefinita(p_order uuid, p_data date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  o record;
  v_data date := coalesce(p_data, current_date);
  v_id uuid;
  v_quante int;
begin
  select x.id, x.company_id, x.customer_id, x.appalto_contratto_id, x.tariffa_manodopera_id into o
    from public.orders x where x.id = p_order and x.deleted_at is null;
  if not found then return null; end if;

  if o.tariffa_manodopera_id is not null then
    return jsonb_build_object('listino_voce_id', o.tariffa_manodopera_id, 'da', 'commessa');
  end if;

  -- min() non esiste su uuid: si conta, e poi si prende la prima.
  select count(*) into v_quante
    from public.appalto_tariffe at
    join public.appalto_contratti c on c.id = at.contratto_id and c.company_id = o.company_id
   where at.attivo
     and private.unita_normale(at.unita_misura) = 'ora'
     and at.descrizione ~* '(manodoper|operai|economia|ore uomo)'
     and (at.valido_dal is null or at.valido_dal <= v_data)
     and (at.valido_al is null or at.valido_al >= v_data)
     and (c.id = o.appalto_contratto_id
          or (o.customer_id is not null and c.committente_id = o.customer_id and c.attivo
              and (c.valido_dal is null or c.valido_dal <= v_data)
              and (c.valido_al is null or c.valido_al >= v_data)));
  if v_quante = 1 then
    select at.id into v_id
      from public.appalto_tariffe at
      join public.appalto_contratti c on c.id = at.contratto_id and c.company_id = o.company_id
     where at.attivo
       and private.unita_normale(at.unita_misura) = 'ora'
       and at.descrizione ~* '(manodoper|operai|economia|ore uomo)'
       and (at.valido_dal is null or at.valido_dal <= v_data)
       and (at.valido_al is null or at.valido_al >= v_data)
       and (c.id = o.appalto_contratto_id
            or (o.customer_id is not null and c.committente_id = o.customer_id and c.attivo
                and (c.valido_dal is null or c.valido_dal <= v_data)
                and (c.valido_al is null or c.valido_al >= v_data)))
     limit 1;
    return jsonb_build_object('appalto_tariffa_id', v_id, 'da', 'committente');
  end if;

  select count(*) into v_quante
    from public.tariffe_aziendali ta
   where ta.company_id = o.company_id and coalesce(ta.attivo, true) and ta.tipo = 'manodopera'
     and coalesce(ta.prezzo_vendita, 0) > 0;
  if v_quante = 1 then
    select ta.id into v_id
      from public.tariffe_aziendali ta
     where ta.company_id = o.company_id and coalesce(ta.attivo, true) and ta.tipo = 'manodopera'
       and coalesce(ta.prezzo_vendita, 0) > 0
     limit 1;
    return jsonb_build_object('listino_voce_id', v_id, 'da', 'generale');
  end if;

  return null;
end;
$function$;

revoke all on function private.voce_manodopera_predefinita(uuid, date) from public, anon, authenticated;

create or replace function private.voce_materiale_per_nome(p_order uuid, p_nome text, p_data date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  o record;
  v_data date := coalesce(p_data, current_date);
  v_nome text := private.nome_confrontabile(p_nome);
  v_id uuid;
  v_quante int;
begin
  if v_nome is null then return null; end if;
  select x.id, x.company_id, x.customer_id, x.appalto_contratto_id into o
    from public.orders x where x.id = p_order and x.deleted_at is null;
  if not found then return null; end if;

  with candidate as (
    select at.id
      from public.appalto_tariffe at
      join public.appalto_contratti c on c.id = at.contratto_id and c.company_id = o.company_id
     where at.attivo
       and private.nome_confrontabile(at.descrizione) = v_nome
       and (at.valido_dal is null or at.valido_dal <= v_data)
       and (at.valido_al is null or at.valido_al >= v_data)
       and (c.id = o.appalto_contratto_id
            or (o.customer_id is not null and c.committente_id = o.customer_id and c.attivo
                and (c.valido_dal is null or c.valido_dal <= v_data)
                and (c.valido_al is null or c.valido_al >= v_data)))
  )
  select count(*), (select id from candidate limit 1) into v_quante, v_id from candidate;
  if v_quante = 1 then
    return jsonb_build_object('appalto_tariffa_id', v_id, 'da', 'committente');
  end if;

  with candidate as (
    select ta.id from public.tariffe_aziendali ta
     where ta.company_id = o.company_id and coalesce(ta.attivo, true)
       and private.nome_confrontabile(ta.nome) = v_nome
  )
  select count(*), (select id from candidate limit 1) into v_quante, v_id from candidate;
  if v_quante = 1 then
    return jsonb_build_object('listino_voce_id', v_id, 'da', 'generale');
  end if;

  return null;
end;
$function$;

revoke all on function private.voce_materiale_per_nome(uuid, text, date) from public, anon, authenticated;
