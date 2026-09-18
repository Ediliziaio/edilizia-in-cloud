-- Filtri avanzati dei contatti: il filtro lo fa il database, non il browser.
--
-- Prima la pagina risolveva ogni gruppo in un elenco di id e lo rimandava
-- indietro dentro l'URL (`id=in.(…)`). Due limiti silenziosi, nessuno dei
-- quali dà errore: PostgREST non restituisce più di mille righe per risposta,
-- quindi i gruppi vedevano al massimo mille contatti su novantaseimila, e un
-- elenco lungo non entrerebbe comunque in un URL. Qui il filtro lo valuta il
-- database e torna solo la pagina che serve, con il conteggio giusto.
--
-- SECURITY INVOKER apposta: legge `marketing_contacts` con i permessi di chi
-- chiama, quindi le policy (azienda, «solo i propri», utente bloccato) valgono
-- esattamente come in una query normale. Le regole arrivano come JSON:
--
--   [ { "regole": [ { "campo": "city", "operatore": "is", "valore": "Milano" } ] },
--     { "regole": [ { "campo": "created_at", "operatore": "is",
--                     "da": "2026-05-01T00:00:00Z", "a": "2026-06-01T00:00:00Z" } ] } ]
--
-- Regole dentro un gruppo in AND, gruppi fra loro in OR: le stesse regole del
-- pannello «Filtri avanzati». Campi e operatori sono su lista bianca e i
-- valori passano da format(%L): quello che arriva dal browser non diventa SQL.

create or replace function public.marketing_contatti_dei_gruppi(
  p_company uuid,
  p_gruppi  jsonb
)
returns setof marketing_contacts
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_gruppo      jsonb;
  v_regola      jsonb;
  v_campo       text;
  v_operatore   text;
  v_valore      text;
  v_modello     text;
  v_colonna     text;
  v_uuid        text;
  v_cond        text;
  v_cond_gruppo text[];
  v_cond_opp    text[];
  v_cond_tutti  text[] := '{}';
  v_sql         text;
begin
  if p_company is null then
    return;
  end if;

  for v_gruppo in select value from jsonb_array_elements(coalesce(p_gruppi, '[]'::jsonb)) loop
    v_cond_gruppo := '{}';
    v_cond_opp := '{}';

    for v_regola in select value from jsonb_array_elements(coalesce(v_gruppo->'regole', '[]'::jsonb)) loop
      v_campo     := coalesce(v_regola->>'campo', '');
      v_operatore := coalesce(v_regola->>'operatore', '');
      v_valore    := coalesce(v_regola->>'valore', '');
      v_modello   := '%' || v_valore || '%';
      v_cond      := null;

      -- ── Opportunità: tutte le regole finiscono in un solo EXISTS, come
      --    faceva il browser con la sua unica query sulle opportunità.
      if v_campo like 'opp\_%' then
        if v_campo = 'opp_status' and v_operatore in ('is', 'is_not') and v_valore <> '' then
          v_cond_opp := v_cond_opp || format('o.status %s %L',
            case when v_operatore = 'is' then '=' else '<>' end, v_valore);
        elsif v_campo = 'opp_stage' and v_operatore in ('is', 'is_not')
              and v_valore ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          v_cond_opp := v_cond_opp || format('o.stage_id %s %L::uuid',
            case when v_operatore = 'is' then '=' else '<>' end, v_valore);
        elsif v_campo like 'opp\_pipeline\_%' and v_operatore in ('is', 'is_not') then
          v_uuid := substring(v_campo from 14);
          if v_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            v_cond_opp := v_cond_opp || format('o.pipeline_id %s %L::uuid',
              case when v_operatore = 'is' then '=' else '<>' end, v_uuid);
          end if;
        end if;

      -- ── Campi personalizzati: una riga in marketing_contact_field_values.
      elsif v_campo like 'cf\_%' then
        v_uuid := substring(v_campo from 4);
        if v_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          v_cond := case v_operatore
            when 'is' then format(
              'exists (select 1 from marketing_contact_field_values fv where fv.contact_id = c.id and fv.field_id = %L::uuid and fv.value ilike %L)', v_uuid, v_modello)
            when 'is_not' then format(
              'exists (select 1 from marketing_contact_field_values fv where fv.contact_id = c.id and fv.field_id = %L::uuid and not (fv.value ilike %L))', v_uuid, v_modello)
            when 'is_empty' then format(
              'exists (select 1 from marketing_contact_field_values fv where fv.contact_id = c.id and fv.field_id = %L::uuid and coalesce(fv.value, '''') = '''')', v_uuid)
            when 'is_not_empty' then format(
              'exists (select 1 from marketing_contact_field_values fv where fv.contact_id = c.id and fv.field_id = %L::uuid and coalesce(fv.value, '''') <> '''')', v_uuid)
            else null
          end;
        end if;

      -- ── Tag (array di testo).
      elsif v_campo = 'tags' then
        v_cond := case v_operatore
          when 'is'           then format('c.tags && array[%L]::text[]', v_valore)
          when 'is_not'       then format('not (c.tags @> array[%L]::text[])', v_valore)
          when 'is_empty'     then '(c.tags is null or c.tags = ''{}''::text[])'
          when 'is_not_empty' then '(c.tags is not null and c.tags <> ''{}''::text[])'
          else null
        end;

      -- ── Nome: cerca su nome e cognome insieme, come nel pannello.
      elsif v_campo = 'name' then
        v_cond := case v_operatore
          when 'is'           then format('(c.first_name ilike %L or c.last_name ilike %L)', v_modello, v_modello)
          when 'is_not'       then format('(not (c.first_name ilike %L) and not (c.last_name ilike %L))', v_modello, v_modello)
          when 'is_empty'     then '(c.first_name is null or c.first_name = '''')'
          when 'is_not_empty' then '(c.first_name is not null and c.first_name <> '''')'
          else null
        end;

      -- ── Date: l'intervallo lo calcola il browser (una data sola vale il
      --    giorno intero, un mese vale il mese) e arriva già in «da»/«a».
      elsif v_campo in ('created_at', 'last_activity_at') then
        if v_operatore = 'is' and v_regola ? 'da' and v_regola ? 'a' then
          v_cond := format('(c.%I >= %L::timestamptz and c.%I < %L::timestamptz)',
            v_campo, v_regola->>'da', v_campo, v_regola->>'a');
        elsif v_operatore = 'is_not' and v_regola ? 'da' and v_regola ? 'a' then
          v_cond := format('(c.%I < %L::timestamptz or c.%I >= %L::timestamptz or c.%I is null)',
            v_campo, v_regola->>'da', v_campo, v_regola->>'a', v_campo);
        elsif v_operatore = 'is_empty' then
          v_cond := format('c.%I is null', v_campo);
        elsif v_operatore = 'is_not_empty' then
          v_cond := format('c.%I is not null', v_campo);
        end if;

      -- ── Colonne di testo, su lista bianca.
      else
        v_colonna := case v_campo
          when 'email'         then 'email'
          when 'phone'         then 'phone'
          when 'company_name'  then 'company_name'
          when 'source'        then 'source'
          when 'city'          then 'city'
          when 'province'      then 'province'
          when 'region'        then 'region'
          when 'attr_source'   then 'attr_source'
          when 'attr_campaign' then 'attr_campaign'
          else null
        end;
        if v_colonna is not null then
          v_cond := case v_operatore
            when 'is'           then format('c.%I ilike %L', v_colonna, v_modello)
            when 'is_not'       then format('not (c.%I ilike %L)', v_colonna, v_modello)
            when 'is_empty'     then format('(c.%I is null or c.%I = '''')', v_colonna, v_colonna)
            when 'is_not_empty' then format('(c.%I is not null and c.%I <> '''')', v_colonna, v_colonna)
            else null
          end;
        end if;
      end if;

      if v_cond is not null then
        v_cond_gruppo := v_cond_gruppo || v_cond;
      end if;
    end loop;

    if array_length(v_cond_opp, 1) > 0 then
      v_cond_gruppo := v_cond_gruppo || format(
        'exists (select 1 from marketing_opportunities o where o.contact_id = c.id and o.company_id = c.company_id and o.deleted_at is null and %s)',
        array_to_string(v_cond_opp, ' and '));
    end if;

    if array_length(v_cond_gruppo, 1) > 0 then
      v_cond_tutti := v_cond_tutti || ('(' || array_to_string(v_cond_gruppo, ' and ') || ')');
    end if;
  end loop;

  -- Nessuna regola valida = nessun filtro: si comporta come l'elenco normale.
  v_sql := format('select c.* from marketing_contacts c where c.company_id = %L%s',
    p_company,
    case when array_length(v_cond_tutti, 1) > 0
      then ' and (' || array_to_string(v_cond_tutti, ' or ') || ')'
      else '' end);

  return query execute v_sql;
end;
$$;

comment on function public.marketing_contatti_dei_gruppi(uuid, jsonb) is
  'Contatti che passano i gruppi dei filtri avanzati. Regole in AND dentro il gruppo, gruppi in OR. SECURITY INVOKER: valgono le RLS di chi chiama.';

revoke all on function public.marketing_contatti_dei_gruppi(uuid, jsonb) from public, anon;
grant execute on function public.marketing_contatti_dei_gruppi(uuid, jsonb) to authenticated, service_role;
