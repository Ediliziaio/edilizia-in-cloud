-- ════════════════════════════════════════════════════════════════════════════
-- Filtri dei contatti: ogni campo e ogni operatore provati sui dati veri
-- (24/09/2026)
-- ────────────────────────────────────────────────────────────────────────────
-- Il pannello «Filtri» della pagina Contatti passa le regole a
-- marketing_contatti_dei_gruppi. Provandole una per una sui contatti di
-- produzione, sette davano un risultato sbagliato senza dirlo:
--
-- 1) Campi personalizzati «è vuoto»: cercava una riga col valore vuoto, ma un
--    valore vuoto non si salva (57.393 righe, zero vuote). Risultato: sempre
--    zero contatti. Ora «vuoto» = nessun valore scritto.
-- 2) «Non è» su qualsiasi campo perdeva i contatti senza quel dato:
--    «Città non è Milano» escludeva anche chi la città non ce l'ha. Ora
--    «è X» più «non è X» fa sempre il totale.
-- 3) Opportunità «non è» voleva dire «ha un'altra opportunità»: «Stato non è
--    Vinta» lasciava fuori chi non ne ha nessuna e teneva dentro chi ne ha una
--    vinta e una aperta. Ora vuol dire «nessuna opportunità vinta». E «è
--    vuoto» sulle opportunità veniva ignorato, cioè tornavano TUTTI i
--    contatti: ora vuol dire «nessuna opportunità».
-- 4) Nome «Mario Rossi»: la frase intera non sta né nel nome né nel cognome,
--    zero risultati. Ora ogni parola va cercata in uno dei due, come nella
--    ricerca in alto.
-- 5) Telefono «329 867 0494» non trovava «+393298670494»: ora si confrontano
--    le cifre, col prefisso +39 tolto.
-- 6) Date: il giorno partiva dalla mezzanotte UTC, cioè dalle 02:00 italiane
--    (in estate). Ora il giorno lo calcola il database sull'ora italiana, e ci
--    sono «prima del», «dopo il», «negli ultimi N giorni», «più di N giorni
--    fa». Il browser manda solo la data o il numero di giorni: una lista
--    salvata con «ultimi 30 giorni» si ricalcola ogni volta che si apre.
-- 7) «Ultima attività» leggeva marketing_contacts.last_activity_at, che non
--    aggiorna nessuno: BeMade 2 contatti su 21.160, Il Bagno Group 0 su 5.144,
--    mentre negli ultimi 30 giorni 36.316 contatti hanno avuto note, cambi di
--    fase, messaggi. Ora conta il registro marketing_contact_activities (tutto
--    tranne la creazione del contatto). La colonna NON si riempie qui: un
--    UPDATE su marketing_contacts fa scattare fire_marketing_automation, e un
--    riempimento di massa avvierebbe le automazioni su migliaia di contatti.
--    La tabella della pagina legge lo stesso valore con
--    marketing_ultima_attivita_contatti, per le sole righe a schermo.
--
-- Fonte e provincia si scelgono da un elenco dei valori presenti (nuova
-- funzione marketing_valori_filtro_contatti), quindi «è» confronta il valore
-- intero: «Provincia è BO» non prende più «Bolzano», e prende anche chi ha
-- scritto «Bologna» per esteso. Per la fonte resta anche «contiene»
-- («facebook» → facebook, facebook letto, facebook 20 Giugno…).
-- Il resto del testo continua a cercare «contiene», e ora il pannello lo dice.
--
-- Il menu dei tag leggeva l'anagrafica marketing_tags, dove quasi nessun tag
-- vero è registrato (Il Bagno Group: 21 tag sui contatti, 0 nel menu). Ora
-- l'elenco viene dai contatti stessi, con quanti ne hanno ciascuno.
--
-- Tutte SECURITY INVOKER: valgono le policy di chi chiama (azienda,
-- «solo i propri», utente bloccato). Campi e operatori su lista bianca, valori
-- sempre attraverso format(%L).
--
-- I vecchi campi «da»/«a» delle date e le chiavi opp_pipeline_<id> si
-- accettano ancora: servono alle pagine già aperte con il codice di prima.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

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
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  c_opp  constant text := 'marketing_opportunities o where o.contact_id = c.id and o.company_id = c.company_id and o.deleted_at is null';
  v_gruppo      jsonb;
  v_regola      jsonb;
  v_campo       text;
  v_operatore   text;
  v_valore      text;
  v_modello     text;
  v_colonna     text;
  v_uuid        text;
  v_tipo_cf     text;
  v_confronto   text;
  v_cifre       text;
  v_giorno      date;
  v_giorni      int;
  v_inizio      timestamptz;
  v_fine        timestamptz;
  v_ha          text;
  v_dopo        text;
  v_opp         text;
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
      v_valore    := btrim(coalesce(v_regola->>'valore', ''));
      -- «contiene»: % e _ scritti dall'utente sono caratteri, non jolly.
      v_modello   := '%' || replace(replace(replace(v_valore, '\', '\\'), '%', '\%'), '_', '\_') || '%';
      v_cond      := null;

      -- Un operatore che vuole un valore, senza valore, non filtra niente.
      if v_operatore in ('is', 'is_not', 'contains', 'not_contains', 'before', 'after', 'last_days', 'older_than_days')
         and v_valore = '' then
        continue;
      end if;

      -- ── Opportunità ─────────────────────────────────────────────────────
      -- «è» dello stesso gruppo = la stessa opportunità (pipeline Privati E
      -- stato aperta). «non è» = nessuna opportunità così. «vuoto» = nessuna
      -- opportunità del tutto.
      if v_campo in ('opp_status', 'opp_stage', 'opp_pipeline') or v_campo like 'opp\_pipeline\_%' then
        v_opp := null;
        if v_campo = 'opp_status' and v_valore <> '' then
          v_opp := format('o.status = %L', v_valore);
        elsif v_campo = 'opp_stage' and v_valore ~* c_uuid then
          v_opp := format('o.stage_id = %L::uuid', v_valore);
        elsif v_campo = 'opp_pipeline' and v_valore ~* c_uuid then
          v_opp := format('o.pipeline_id = %L::uuid', v_valore);
        elsif v_campo like 'opp\_pipeline\_%' and substring(v_campo from 14) ~* c_uuid then
          v_opp := format('o.pipeline_id = %L::uuid', substring(v_campo from 14));
        end if;

        if v_operatore = 'is' and v_opp is not null then
          v_cond_opp := v_cond_opp || v_opp;
        elsif v_operatore = 'is_not' and v_opp is not null then
          v_cond := format('not exists (select 1 from %s and %s)', c_opp, v_opp);
        elsif v_operatore = 'is_empty' then
          v_cond := format('not exists (select 1 from %s)', c_opp);
        elsif v_operatore = 'is_not_empty' then
          v_cond := format('exists (select 1 from %s)', c_opp);
        end if;

      -- ── Campi personalizzati: una riga in marketing_contact_field_values,
      --    che esiste solo se il valore è stato scritto.
      elsif v_campo like 'cf\_%' then
        v_uuid := substring(v_campo from 4);
        if v_uuid ~* c_uuid then
          select f.field_type into v_tipo_cf from marketing_custom_fields f where f.id = v_uuid::uuid;
          v_confronto := case
            when v_operatore in ('contains', 'not_contains') then format('fv.value ilike %L', v_modello)
            when v_tipo_cf in ('select', 'radio', 'number') then format('lower(btrim(fv.value)) = lower(%L)', v_valore)
            else format('fv.value ilike %L', v_modello)
          end;
          v_cond := case
            when v_operatore in ('is', 'contains') then format(
              'exists (select 1 from marketing_contact_field_values fv where fv.contact_id = c.id and fv.field_id = %L::uuid and %s)', v_uuid, v_confronto)
            when v_operatore in ('is_not', 'not_contains') then format(
              'not exists (select 1 from marketing_contact_field_values fv where fv.contact_id = c.id and fv.field_id = %L::uuid and %s)', v_uuid, v_confronto)
            when v_operatore = 'is_empty' then format(
              'not exists (select 1 from marketing_contact_field_values fv where fv.contact_id = c.id and fv.field_id = %L::uuid and btrim(coalesce(fv.value, '''')) <> '''')', v_uuid)
            when v_operatore = 'is_not_empty' then format(
              'exists (select 1 from marketing_contact_field_values fv where fv.contact_id = c.id and fv.field_id = %L::uuid and btrim(coalesce(fv.value, '''')) <> '''')', v_uuid)
          end;
        end if;

      -- ── Tag: il valore arriva dall'elenco dei tag, si confronta intero.
      elsif v_campo = 'tags' then
        v_cond := case v_operatore
          when 'is'           then format('c.tags @> array[%L]::text[]', v_valore)
          when 'is_not'       then format('not (coalesce(c.tags, ''{}''::text[]) @> array[%L]::text[])', v_valore)
          when 'is_empty'     then 'coalesce(cardinality(c.tags), 0) = 0'
          when 'is_not_empty' then 'coalesce(cardinality(c.tags), 0) > 0'
        end;

      -- ── Nome: ogni parola nel nome o nel cognome.
      elsif v_campo = 'name' then
        if v_operatore in ('is', 'contains', 'is_not', 'not_contains') then
          select string_agg(format('(c.first_name ilike %1$L or c.last_name ilike %1$L)',
                   '%' || replace(replace(replace(p, '\', '\\'), '%', '\%'), '_', '\_') || '%'), ' and ')
            into v_cond
            from unnest(regexp_split_to_array(v_valore, '\s+')) p
           where p <> '';
          if v_cond is not null and v_operatore in ('is_not', 'not_contains') then
            v_cond := format('not coalesce((%s), false)', v_cond);
          end if;
        elsif v_operatore = 'is_empty' then
          v_cond := '(btrim(coalesce(c.first_name, '''')) = '''' and btrim(coalesce(c.last_name, '''')) = '''')';
        elsif v_operatore = 'is_not_empty' then
          v_cond := '(btrim(coalesce(c.first_name, '''')) <> '''' or btrim(coalesce(c.last_name, '''')) <> '''')';
        end if;

      -- ── Telefono: si confrontano le cifre, senza il prefisso +39.
      elsif v_campo = 'phone' then
        if v_operatore in ('is', 'contains', 'is_not', 'not_contains') then
          v_cifre := regexp_replace(v_valore, '\D', '', 'g');
          if v_cifre like '0039%' then
            v_cifre := substr(v_cifre, 5);
          elsif v_cifre like '39%' and length(v_cifre) > 10 then
            v_cifre := substr(v_cifre, 3);
          end if;
          v_cond := case
            when v_cifre <> '' then format('regexp_replace(coalesce(c.phone, ''''), ''\D'', '''', ''g'') like %L', '%' || v_cifre || '%')
            else format('coalesce(c.phone, '''') ilike %L', v_modello)
          end;
          if v_operatore in ('is_not', 'not_contains') then
            v_cond := format('not (%s)', v_cond);
          end if;
        elsif v_operatore = 'is_empty' then
          v_cond := 'btrim(coalesce(c.phone, '''')) = ''''';
        elsif v_operatore = 'is_not_empty' then
          v_cond := 'btrim(coalesce(c.phone, '''')) <> ''''';
        end if;

      -- ── Date, sull'ora italiana. La data arriva come AAAA-MM-GG, i giorni
      --    come numero; il vecchio «da»/«a» si ignora e si ricalcola.
      --    L'ultima attività è la più recente fra la colonna del contatto e il
      --    registro delle attività: «dopo(T)» = c'è qualcosa da T in poi.
      elsif v_campo in ('created_at', 'last_activity_at') then
        v_giorno := null;
        v_giorni := null;
        if v_valore ~ '^\d{4}-\d{2}-\d{2}$' then
          begin
            v_giorno := v_valore::date;
          exception when others then
            v_giorno := null;
          end;
        elsif v_valore ~ '^\d{1,4}$' then
          v_giorni := v_valore::int;
        end if;
        if v_giorno is not null then
          v_inizio := v_giorno::timestamp at time zone 'Europe/Rome';
          v_fine   := (v_giorno + 1)::timestamp at time zone 'Europe/Rome';
        end if;

        if v_campo = 'last_activity_at' then
          v_ha := '(c.last_activity_at is not null or exists (select 1 from marketing_contact_activities a'
               || ' where a.contact_id = c.id and a.activity_type <> ''contact_created''))';
          v_dopo := '(coalesce(c.last_activity_at >= %1$s, false) or exists (select 1 from marketing_contact_activities a'
               || ' where a.contact_id = c.id and a.activity_type <> ''contact_created'' and a.created_at >= %1$s))';
          v_cond := case
            when v_operatore = 'is' and v_giorno is not null then
              format('(%s and not %s)', format(v_dopo, quote_literal(v_inizio) || '::timestamptz'), format(v_dopo, quote_literal(v_fine) || '::timestamptz'))
            when v_operatore = 'is_not' and v_giorno is not null then
              format('not (%s and not %s)', format(v_dopo, quote_literal(v_inizio) || '::timestamptz'), format(v_dopo, quote_literal(v_fine) || '::timestamptz'))
            when v_operatore = 'before' and v_giorno is not null then
              format('(%s and not %s)', v_ha, format(v_dopo, quote_literal(v_inizio) || '::timestamptz'))
            when v_operatore = 'after' and v_giorno is not null then
              format(v_dopo, quote_literal(v_fine) || '::timestamptz')
            when v_operatore = 'last_days' and v_giorni between 1 and 3650 then
              format(v_dopo, format('(now() - make_interval(days => %s))', v_giorni))
            when v_operatore = 'older_than_days' and v_giorni between 1 and 3650 then
              format('(%s and not %s)', v_ha, format(v_dopo, format('(now() - make_interval(days => %s))', v_giorni)))
            when v_operatore = 'is_empty' then
              format('not %s', v_ha)
            when v_operatore = 'is_not_empty' then
              v_ha
          end;
        else
          v_cond := case
            when v_operatore = 'is' and v_giorno is not null then
              format('(c.%1$I >= %2$L::timestamptz and c.%1$I < %3$L::timestamptz)', v_campo, v_inizio, v_fine)
            when v_operatore = 'is_not' and v_giorno is not null then
              format('(c.%1$I is null or c.%1$I < %2$L::timestamptz or c.%1$I >= %3$L::timestamptz)', v_campo, v_inizio, v_fine)
            when v_operatore = 'before' and v_giorno is not null then
              format('c.%I < %L::timestamptz', v_campo, v_inizio)
            when v_operatore = 'after' and v_giorno is not null then
              format('c.%I >= %L::timestamptz', v_campo, v_fine)
            when v_operatore = 'last_days' and v_giorni between 1 and 3650 then
              format('c.%I >= now() - make_interval(days => %s)', v_campo, v_giorni)
            when v_operatore = 'older_than_days' and v_giorni between 1 and 3650 then
              format('c.%I < now() - make_interval(days => %s)', v_campo, v_giorni)
            when v_operatore = 'is_empty' then
              format('c.%I is null', v_campo)
            when v_operatore = 'is_not_empty' then
              format('c.%I is not null', v_campo)
          end;
        end if;

      -- ── Colonne di testo, su lista bianca.
      else
        v_colonna := case v_campo
          when 'email'         then 'email'
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
          -- Fonte e provincia vengono da un elenco: «è» vuol dire quel valore.
          -- La provincia vale sia come sigla sia per nome (Best Infissi ha
          -- 964 «BO» e 915 «Bologna»). La regione resta «contiene»: nei dati
          -- convivono «Trentino-Alto Adige» e «Trentino-Alto Adige/Südtirol».
          if v_operatore in ('is', 'is_not') and v_colonna = 'province' then
            v_cond := format(
              '(lower(btrim(c.province)) = lower(%1$L)'
              ' or lower(btrim(c.province)) in (select lower(p.nome) from it_province p where p.sigla = upper(%1$L))'
              ' or upper(btrim(c.province)) in (select p.sigla from it_province p where lower(p.nome) = lower(%1$L)))', v_valore);
            if v_operatore = 'is_not' then
              v_cond := format('not coalesce(%s, false)', v_cond);
            end if;
          elsif v_operatore = 'is' and v_colonna = 'source' then
            v_cond := format('lower(btrim(c.source)) = lower(%L)', v_valore);
          elsif v_operatore = 'is_not' and v_colonna = 'source' then
            v_cond := format('lower(btrim(coalesce(c.source, ''''))) <> lower(%L)', v_valore);
          elsif v_operatore in ('is', 'contains') then
            v_cond := format('c.%I ilike %L', v_colonna, v_modello);
          elsif v_operatore in ('is_not', 'not_contains') then
            v_cond := format('coalesce(c.%I, '''') not ilike %L', v_colonna, v_modello);
          elsif v_operatore = 'is_empty' then
            v_cond := format('btrim(coalesce(c.%I, '''')) = ''''', v_colonna);
          elsif v_operatore = 'is_not_empty' then
            v_cond := format('btrim(coalesce(c.%I, '''')) <> ''''', v_colonna);
          end if;
        end if;
      end if;

      if v_cond is not null then
        v_cond_gruppo := v_cond_gruppo || v_cond;
      end if;
    end loop;

    if array_length(v_cond_opp, 1) > 0 then
      v_cond_gruppo := v_cond_gruppo || format('exists (select 1 from %s and %s)', c_opp, array_to_string(v_cond_opp, ' and '));
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
  'Contatti che passano i gruppi del pannello Filtri. Regole in AND dentro il gruppo, gruppi in OR; «non è» include chi il dato non ce l''ha; date sull''ora italiana. SECURITY INVOKER: valgono le RLS di chi chiama.';

revoke all on function public.marketing_contatti_dei_gruppi(uuid, jsonb) from public, anon;
grant execute on function public.marketing_contatti_dei_gruppi(uuid, jsonb) to authenticated, service_role;


-- I valori presenti di un campo, con quanti contatti li hanno: alimentano gli
-- elenchi di tag, fonte e provincia nel pannello Filtri. Le varianti di
-- maiuscole si contano insieme e si mostra la grafia più usata; la provincia
-- si riporta alla sigla («Bologna» e «BO» sono una voce, «Bologna (BO)»).
-- Il DROP rende la migrazione rieseguibile: il tipo di ritorno non si cambia
-- con CREATE OR REPLACE.
drop function if exists public.marketing_valori_filtro_contatti(uuid, text);

create function public.marketing_valori_filtro_contatti(
  p_company uuid,
  p_campo   text
)
returns table (valore text, etichetta text, contatti bigint)
language plpgsql
stable
set search_path to 'public'
as $$
begin
  if p_company is null then
    return;
  end if;

  if p_campo = 'tags' then
    return query
      select t.tag, t.tag, count(*)::bigint
        from marketing_contacts c
       cross join lateral unnest(c.tags) as t(tag)
       where c.company_id = p_company
         and btrim(t.tag) <> ''
       group by t.tag
       order by 3 desc, 1
       limit 500;
  elsif p_campo = 'source' then
    return query
      select mode() within group (order by btrim(c.source)),
             mode() within group (order by btrim(c.source)),
             count(*)::bigint
        from marketing_contacts c
       where c.company_id = p_company
         and btrim(coalesce(c.source, '')) <> ''
       group by lower(btrim(c.source))
       order by 3 desc, 1
       limit 500;
  elsif p_campo = 'province' then
    -- Due join per uguaglianza (sigla, poi nome) invece di un OR: su
    -- novantaseimila contatti l'OR confronterebbe ogni riga con 107 province.
    return query
      select coalesce(x.sigla, mode() within group (order by x.grezza)),
             coalesce(x.nome || ' (' || x.sigla || ')', mode() within group (order by x.grezza)),
             count(*)::bigint
        from (
          select btrim(c.province) as grezza,
                 coalesce(ps.sigla, pn.sigla) as sigla,
                 coalesce(ps.nome, pn.nome) as nome
            from marketing_contacts c
            left join it_province ps on ps.sigla = upper(btrim(c.province))
            left join it_province pn on lower(pn.nome) = lower(btrim(c.province))
           where c.company_id = p_company
             and btrim(coalesce(c.province, '')) <> ''
        ) x
       group by x.sigla, x.nome, case when x.sigla is null then lower(x.grezza) end
       order by 3 desc, 1
       limit 500;
  end if;
end;
$$;

comment on function public.marketing_valori_filtro_contatti(uuid, text) is
  'Valori presenti di tag, fonte o provincia fra i contatti di un''azienda, con etichetta e numero di contatti. SECURITY INVOKER: valgono le RLS di chi chiama.';

revoke all on function public.marketing_valori_filtro_contatti(uuid, text) from public, anon;
grant execute on function public.marketing_valori_filtro_contatti(uuid, text) to authenticated, service_role;


-- L'ultima attività delle righe a schermo, con la stessa regola del filtro:
-- la più recente fra la colonna del contatto e il registro delle attività,
-- creazione esclusa. Solo per gli id passati (una pagina di elenco).
create or replace function public.marketing_ultima_attivita_contatti(
  p_contatti uuid[]
)
returns table (contact_id uuid, ultima_attivita timestamptz)
language sql
stable
set search_path to 'public'
as $$
  select c.id,
         greatest(c.last_activity_at, (
           select max(a.created_at)
             from marketing_contact_activities a
            where a.contact_id = c.id
              and a.activity_type <> 'contact_created'))
    from marketing_contacts c
   where c.id = any(coalesce(p_contatti, '{}'::uuid[]))
   limit 1000;
$$;

comment on function public.marketing_ultima_attivita_contatti(uuid[]) is
  'Ultima attività vera dei contatti indicati: colonna last_activity_at o registro marketing_contact_activities (creazione esclusa). SECURITY INVOKER: valgono le RLS di chi chiama.';

revoke all on function public.marketing_ultima_attivita_contatti(uuid[]) from public, anon;
grant execute on function public.marketing_ultima_attivita_contatti(uuid[]) to authenticated, service_role;
