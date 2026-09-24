-- ════════════════════════════════════════════════════════════════════════════
-- «Ultima attività» dei contatti: la scrive il lavoro vero (24/09/2026)
-- ────────────────────────────────────────────────────────────────────────────
-- marketing_contacts.last_activity_at non la aggiornava nessuno: BeMade 2
-- contatti su 21.160, Il Bagno Group 0 su 5.144. Eppure la leggono gli avvisi
-- «Lead non contattati entro 2 ore / da 48 ore» della dashboard marketing (che
-- quindi contavano come non contattati TUTTI i lead del periodo), gli avvisi di
-- Silvio, il calo del punteggio dei lead, l'ordinamento e la scorciatoia «lead
-- da contattare» della pagina Contatti, l'esportazione.
--
-- Cosa conta come attività: il lavoro di qualcuno dell'azienda sul contatto,
-- cioè le righe del registro marketing_contact_activities CON un autore (note,
-- cambi di fase e di stato, preventivi, documenti, messaggi, anche le
-- operazioni in blocco fatte da un utente), più due fatti del cliente che
-- dimostrano che è stato raggiunto: la risposta a un outreach e la prenotazione
-- di un appuntamento. Non conta: la creazione del contatto, le assegnazioni, le
-- cancellazioni, le modifiche ai dati, e le righe SENZA autore, che sono quasi
-- tutte importazioni (30.298 note «Nota aggiunta» l'11 e il 23/09) o fatti del
-- cliente come la ricompilazione di un modulo, che deve restare «da
-- contattare». La regola sta in una funzione sola, attivita_conta_come_lavoro,
-- usata sia dal riempimento qui sotto sia dal trigger.
--
-- Attenzione ai trigger dei contatti: ogni UPDATE su marketing_contacts
-- scriveva un evento «contact_updated» per le automazioni
-- (fire_marketing_automation), una riga nel registro modifiche
-- (tg_activity_on_contacts) e spostava updated_at. Un UPDATE che cambia SOLO
-- l'ultima attività ora non fa nessuna delle tre cose: le due funzioni si
-- modificano sul posto, solo nella riga che serve, e un trigger BEFORE rimette
-- updated_at com'era. Oggi nessun flusso ascolta «contact_updated», ma il
-- riempimento qui sotto avrebbe messo in coda 4.379 eventi da smaltire.
--
-- Poi:
-- - il filtro «Ultima attività» (marketing_contatti_dei_gruppi) torna a leggere
--   la colonna, come Data creazione: una fonte sola per filtro, colonna,
--   ordinamento e avvisi;
-- - marketing_ultima_attivita_contatti (20280925000400) non serve più;
-- - riempimento: 4.379 contatti con lavoro vero più recente della colonna.
--   I valori già presenti (5.651, in gran parte date portate dagli import da
--   Zoho) restano: si scrive solo se il registro ha una data più recente.
--   NON sta in questa migrazione: qui c'è un CREATE TRIGGER su
--   marketing_contacts, che blocca le scritture sulla tabella fino alla fine
--   della transazione, e un lead in arrivo da Meta andrebbe in timeout mentre
--   si riempiono migliaia di righe. Si fa dopo, a lotti da mille, con la query
--   in fondo al file.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- 1) La regola: cosa conta come lavoro sul contatto.
create or replace function public.attivita_conta_come_lavoro(p_tipo text, p_autore uuid)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_tipo in ('outreach_reply', 'appuntamento_prenotato') then true
    when p_tipo in ('contact_created', 'contact_assigned', 'opportunity_assigned', 'opportunity_deleted', 'updated') then false
    else p_autore is not null
  end
$$;

comment on function public.attivita_conta_come_lavoro(text, uuid) is
  'Una riga di marketing_contact_activities aggiorna l''ultima attività del contatto? Sì se ha un autore (lavoro dell''azienda) o se è una risposta a un outreach o una prenotazione; no per creazione, assegnazioni, cancellazioni, modifiche ai dati.';

revoke all on function public.attivita_conta_come_lavoro(text, uuid) from public, anon, authenticated;

-- 2) fire_marketing_automation: niente evento «contact_updated» se cambia solo
--    l'ultima attività. Il controllo entra subito dopo la riga
--    `_trigger_event := 'contact_updated';` del ramo contatti: la funzione è
--    condivisa con opportunità e appuntamenti, e il resto non si tocca.
do $$
declare
  v_def    text := pg_get_functiondef('public.fire_marketing_automation()'::regprocedure);
  v_ancora constant text := E'_trigger_event := ''contact_updated'';\n';
  v_guardia constant text :=
       E'        -- Cambia solo l''ultima attività (o updated_at): non è una modifica\n'
    || E'        -- del contatto, e non parte nessun evento (20280925001500).\n'
    || E'        IF (to_jsonb(NEW) - ''last_activity_at'' - ''updated_at'') = (to_jsonb(OLD) - ''last_activity_at'' - ''updated_at'') THEN\n'
    || E'          RETURN NEW;\n'
    || E'        END IF;\n';
  v_volte  int;
begin
  if strpos(v_def, '(20280925001500)') > 0 then
    return;
  end if;
  v_volte := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
  if v_volte <> 1 then
    raise exception 'fire_marketing_automation: la riga di aggancio c''è % volte, non una', v_volte;
  end if;
  execute replace(v_def, v_ancora, v_ancora || v_guardia);
end $$;

-- 3) tg_activity_on_contacts: l'ultima attività fra i campi che non fanno
--    «Contatto aggiornato» nel registro modifiche, come updated_at e i punteggi.
do $$
declare
  v_def    text := pg_get_functiondef('public.tg_activity_on_contacts()'::regprocedure);
  v_ancora constant text := $a$key NOT IN ('updated_at','last_seen_at','last_contact_at',$a$;
  v_nuova  constant text := $a$key NOT IN ('updated_at','last_activity_at','last_seen_at','last_contact_at',$a$;
  v_volte  int;
begin
  if strpos(v_def, v_nuova) > 0 then
    return;
  end if;
  v_volte := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
  if v_volte <> 1 then
    raise exception 'tg_activity_on_contacts: l''elenco dei campi esclusi c''è % volte, non una', v_volte;
  end if;
  execute replace(v_def, v_ancora, v_nuova);
end $$;

-- 4) updated_at resta com'era se cambia solo l'ultima attività. Il nome parte
--    con «zz_» apposta: i trigger BEFORE scattano in ordine alfabetico, e questo
--    deve venire dopo update_marketing_contacts_updated_at, che la sposta.
create or replace function public.contatto_tieni_updated_at_se_solo_ultima_attivita()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if (to_jsonb(NEW) - 'last_activity_at' - 'updated_at') = (to_jsonb(OLD) - 'last_activity_at' - 'updated_at') then
    NEW.updated_at := OLD.updated_at;
  end if;
  return NEW;
end;
$$;

revoke all on function public.contatto_tieni_updated_at_se_solo_ultima_attivita() from public, anon, authenticated;

create or replace trigger zz_contatto_solo_ultima_attivita
  before update on public.marketing_contacts
  for each row
  when (old.last_activity_at is distinct from new.last_activity_at)
  execute function public.contatto_tieni_updated_at_se_solo_ultima_attivita();

-- 5) Il registro aggiorna il contatto. Un trigger per istruzione, non per riga:
--    un import che scrive migliaia di attività in un colpo fa un solo UPDATE.
--    SECURITY DEFINER perché chi scrive la nota può non avere il permesso di
--    modificare la scheda (solo lettura, «solo i propri»).
create or replace function public.contatto_ultima_attivita_dal_registro()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.marketing_contacts c
     set last_activity_at = n.ultima
    from (select a.contact_id, max(a.created_at) as ultima
            from nuove a
           where a.contact_id is not null
             and public.attivita_conta_come_lavoro(a.activity_type, a.created_by)
           group by a.contact_id) n
   where c.id = n.contact_id
     and (c.last_activity_at is null or c.last_activity_at < n.ultima);
  return null;
end;
$$;

revoke all on function public.contatto_ultima_attivita_dal_registro() from public, anon, authenticated;

create or replace trigger trg_contatto_ultima_attivita
  after insert on public.marketing_contact_activities
  referencing new table as nuove
  for each statement
  execute function public.contatto_ultima_attivita_dal_registro();

-- 6) Il filtro «Ultima attività» legge la colonna, come Data creazione.
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
      --    L'ultima attività è la colonna del contatto, che dal 24/09/2026 la
      --    tiene aggiornata il registro delle attività (20280925001500).
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

-- 7) La lettura a parte per le righe a schermo non serve più: la colonna è giusta.
drop function if exists public.marketing_ultima_attivita_contatti(uuid[]);

-- 8) Riempimento, DA ESEGUIRE A PARTE dopo questa migrazione, ripetuto
--    finché non aggiorna più nessuna riga (mille contatti per volta: tiene i
--    lock pochi istanti e non blocca i lead in arrivo):
--
--    SET LOCAL lock_timeout = '3s';
--    SET LOCAL statement_timeout = '60s';
--    with k as (
--      select a.contact_id, max(a.created_at) as ultima
--        from public.marketing_contact_activities a
--       where public.attivita_conta_come_lavoro(a.activity_type, a.created_by)
--       group by a.contact_id
--    ), lotto as (
--      select c.id, k.ultima
--        from public.marketing_contacts c
--        join k on k.contact_id = c.id
--       where c.last_activity_at is null or c.last_activity_at < k.ultima
--       limit 1000
--    )
--    update public.marketing_contacts c
--       set last_activity_at = lotto.ultima
--      from lotto
--     where c.id = lotto.id;
