-- ════════════════════════════════════════════════════════════════════════════
-- Unione di due contatti: quello che è legato al doppione passa al contatto
-- che resta, tutto insieme (25/09/2026)
-- ────────────────────────────────────────────────────────────────────────────
-- Prima l'unione (ContactMergeDialog) la faceva il browser, tabella per
-- tabella: spostava opportunità, note, attività, appuntamenti e contact_messages,
-- poi cancellava il doppione. Tutto il resto:
--   - si CANCELLAVA insieme al doppione (FK ON DELETE CASCADE): email delle
--     campagne (email_logs), documenti, campi personalizzati, liste,
--     sequenze outreach, attribuzione della campagna, listino del cliente...;
--   - restava SENZA contatto (FK ON DELETE SET NULL): preventivi, fatture,
--     progetti fotovoltaico, attività (tasks), chiamate, ticket, email
--     ricevute, scadenze, moduli compilati, profilo del portale...;
--   - restava legato a un contatto che non esiste più (nessuna FK): i WhatsApp
--     (whatsapp_messages, col contatto dal 24/09), il WhatsApp della
--     piattaforma, i broadcast, i progetti dei preventivatori (*_progetti),
--     lo stato in Conversazioni, le notifiche. Sparivano dalla cronologia
--     della scheda e da Conversazioni.
-- E senza transazione: un errore a metà lasciava un'unione a metà.
--
-- Ora unisci_contatti_marketing(tieni, togli) fa tutto nel database, in una
-- transazione sola:
--   1. controlla chi chiama con le regole delle policy di marketing_contacts
--      (qui dentro la RLS non vale): permesso can_edit_marketing_contacts
--      nell'azienda (o amministratore, o super admin), utente non bloccato né
--      in sola lettura, e con «solo assegnati» entrambi i contatti suoi;
--   2. sposta ogni riga dell'azienda che punta al doppione. Le tabelle con una
--      FK verso marketing_contacts le trova nel catalogo (anche quelle che
--      verranno); quelle senza FK sono elencate qui sotto. Una riga che
--      doppierebbe una di quelle del contatto che resta (stessa lista, stesso
--      campo, stessa sequenza, un'attribuzione sola...) resta dov'è e se ne
--      va col doppione: vale quella di chi resta;
--   3. scrive l'unione nella cronologia del contatto che resta;
--   4. cancella il doppione;
--   5. al contatto che resta: le rinunce (STOP WhatsApp, disiscrizione, niente
--      email/SMS/chiamate) valgono se le aveva uno dei due; telefono ed email,
--      se gli mancano, li prende dal doppione (se no il prossimo WhatsApp da
--      quel numero creerebbe un altro doppione); l'ultima attività è la più
--      recente dei due.
--
-- WhatsApp già orfani (contact_id di un contatto che non c'è più): zero su 24
-- il 25/09, e zero anche nelle altre tabelle senza FK. Nessun ricollegamento.
--
-- La migrazione crea solo funzioni: istantanea, non tocca righe.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

-- ── 1. «Unito il doppione» non è lavoro sul contatto ───────────────────────
-- È una modifica ai dati: come le assegnazioni, non sposta l'ultima attività
-- (regola di 20280925001500, qui con un tipo in più).
create or replace function public.attivita_conta_come_lavoro(p_tipo text, p_autore uuid)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_tipo in ('outreach_reply', 'appuntamento_prenotato') then true
    when p_tipo in ('contact_created', 'contact_assigned', 'opportunity_assigned', 'opportunity_deleted', 'updated', 'contact_merged') then false
    else p_autore is not null
  end
$$;

revoke all on function public.attivita_conta_come_lavoro(text, uuid) from public, anon, authenticated;

-- ── 2. L'unione ─────────────────────────────────────────────────────────────
create or replace function public.unisci_contatti_marketing(p_tieni uuid, p_togli uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set lock_timeout = '5s'
as $$
declare
  v_uid       uuid := auth.uid();
  v_tieni     public.marketing_contacts%rowtype;
  v_togli     public.marketing_contacts%rowtype;
  v_azienda   uuid;
  v_id        uuid;
  v_rif       record;
  v_altre     text;
  v_base      text;
  v_unici     text;
  v_n         bigint;
  v_spostati  jsonb := '{}'::jsonb;
  v_totale    bigint := 0;
  v_nome      text;
  v_recapiti  text;
begin
  if v_uid is null then
    raise exception 'Accesso non autorizzato' using errcode = '42501';
  end if;
  if p_tieni is null or p_togli is null or p_tieni = p_togli then
    raise exception 'Scegli due contatti diversi da unire' using errcode = '22023';
  end if;

  -- I due contatti restano bloccati fino alla fine, presi sempre nello stesso
  -- ordine: due unioni incrociate non si aspettano a vicenda.
  perform 1 from public.marketing_contacts
   where id in (p_tieni, p_togli)
   order by id
     for update;
  select * into v_tieni from public.marketing_contacts where id = p_tieni;
  select * into v_togli from public.marketing_contacts where id = p_togli;
  if v_tieni.id is null or v_togli.id is null then
    raise exception 'Contatto non trovato: forse è già stato unito o eliminato' using errcode = 'P0002';
  end if;
  if v_tieni.company_id is distinct from v_togli.company_id then
    raise exception 'I due contatti sono di aziende diverse' using errcode = '42501';
  end if;
  if v_tieni.deleted_at is not null then
    raise exception 'Il contatto da tenere è nel cestino: ripristinalo prima di unire' using errcode = '22023';
  end if;
  v_azienda := v_tieni.company_id;

  -- 1. Chi può: le policy di marketing_contacts per modificare ed eliminare.
  if public.utente_bloccato()
     or not (
       public.has_role(v_uid, 'super_admin'::public.app_role)
       or v_azienda = any (public.aziende_con_permesso('can_edit_marketing_contacts'))
     )
     or public.utente_sola_lettura(v_azienda) then
    raise exception 'Non hai il permesso di unire i contatti di questa azienda' using errcode = '42501';
  end if;
  if public.solo_assegnati_attivo() then
    foreach v_id in array array[p_tieni, p_togli] loop
      if not exists (
        select 1 from public.marketing_contacts mc
         where mc.id = v_id
           and (mc.assigned_to = v_uid or mc.call_center_id = v_uid or mc.follower_id = v_uid
                or mc.assigned_to = any (public.membri_mie_squadre())
                or mc.id in (select public.contatti_seguiti_da_me()))
      ) then
        raise exception 'Puoi unire solo i contatti assegnati a te' using errcode = '42501';
      end if;
    end loop;
  end if;

  -- 2. Tutto quello che punta al doppione passa a chi resta.
  for v_rif in
    -- Le tabelle con una FK verso marketing_contacts, dal catalogo: una
    -- tabella nuova è già compresa.
    select c.oid as tabella, a.attnum, a.attname::text as colonna,
           null::text as colonna_tipo, null::text as tipo, true as con_fk
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
     where con.contype = 'f'
       and con.confrelid = 'public.marketing_contacts'::regclass
       and cardinality(con.conkey) = 1
       and c.relnamespace = 'public'::regnamespace
    union all
    -- Quelle senza FK, che il catalogo non vede. Una tabella nuova senza FK
    -- che punta ai contatti va aggiunta qui.
    select c.oid, a.attnum, a.attname::text, v.colonna_tipo, v.tipo, false
      from (values
        ('whatsapp_messages',             'contact_id', null::text,    null::text),
        ('openwa_messages',               'contact_id', null,          null),
        ('openwa_regole_scatti',          'contact_id', null,          null),
        ('whatsapp_broadcast_recipients', 'contact_id', null,          null),
        ('human_call_logs',               'contact_id', null,          null),
        ('outreach_call_tasks',           'contact_id', null,          null),
        ('openapi_document_requests',     'contact_id', null,          null),
        ('silvio_action_log',             'contact_id', null,          null),
        ('silvio_workflow_runs',          'contact_id', null,          null),
        ('campaign_retry_log',            'contact_id', null,          null),
        ('bgn_progetti',                  'cliente_id', null,          null),
        ('clm_progetti',                  'cliente_id', null,          null),
        ('ele_progetti',                  'cliente_id', null,          null),
        ('idr_progetti',                  'cliente_id', null,          null),
        ('pav_progetti',                  'cliente_id', null,          null),
        ('pis_progetti',                  'cliente_id', null,          null),
        ('rst_progetti',                  'cliente_id', null,          null),
        ('sr_progetti',                   'cliente_id', null,          null),
        ('tet_progetti',                  'cliente_id', null,          null),
        ('conversazioni',                 'entita_id',  'entita_tipo', 'contatto'),
        ('notifications',                 'entity_id',  'entity_type', 'marketing_contact')
      ) as v(tabella, colonna, colonna_tipo, tipo)
      join pg_class c on c.relname = v.tabella and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      join pg_attribute a on a.attrelid = c.oid and a.attname = v.colonna and not a.attisdropped
    order by 1, 3
  loop
    -- Solo le righe dell'azienda (dove la tabella la dice) e, nelle tabelle
    -- che puntano a più tipi di cose, solo quelle dei contatti.
    v_base := case when v_rif.colonna_tipo is null then ''
                   else format(' and t.%I = %L', v_rif.colonna_tipo, v_rif.tipo) end;
    if exists (select 1 from pg_attribute a
                where a.attrelid = v_rif.tabella and a.attname = 'company_id' and not a.attisdropped) then
      v_base := v_base || format(' and t.company_id = %L', v_azienda);
    end if;

    -- Una riga che doppierebbe una di chi resta (indice unico) resta dov'è.
    -- Un indice sulla sola colonna del contatto non ha «altre» colonne: il
    -- CASE evita format() su NULL, che non si può scrivere come nome.
    v_unici := '';
    for v_altre in
      select coalesce(string_agg(case when a.attname is not null
                                      then format(' and d.%1$I = t.%1$I', a.attname) end,
                                 '' order by a.attnum), '')
        from pg_index i
        left join pg_attribute a
          on a.attrelid = i.indrelid and a.attnum = any (i.indkey::int2[]) and a.attnum <> v_rif.attnum
       where i.indrelid = v_rif.tabella
         and i.indisunique
         and v_rif.attnum = any (i.indkey::int2[])
       group by i.indexrelid
    loop
      v_unici := v_unici || format(' and not exists (select 1 from %s d where d.%I = $1%s)',
                                   v_rif.tabella::regclass, v_rif.colonna, v_altre);
    end loop;

    execute format('update %s t set %I = $1 where t.%I = $2%s%s',
                   v_rif.tabella::regclass, v_rif.colonna, v_rif.colonna, v_base, v_unici)
      using p_tieni, p_togli;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_spostati := v_spostati || jsonb_build_object(
        v_rif.tabella::regclass::text,
        coalesce((v_spostati ->> v_rif.tabella::regclass::text)::bigint, 0) + v_n);
      v_totale := v_totale + v_n;
    end if;

    -- Senza FK nessuno toglie le righe rimaste (i doppioni di un indice
    -- unico): le toglie l'unione, come farebbe la cancellazione.
    if not v_rif.con_fk and v_unici <> '' then
      execute format('delete from %s t where t.%I = $1%s', v_rif.tabella::regclass, v_rif.colonna, v_base)
        using p_togli;
    end if;
  end loop;

  -- 3. Nella cronologia di chi resta: chi era il doppione.
  v_nome := nullif(btrim(concat_ws(' ', v_togli.first_name, v_togli.last_name)), '');
  v_recapiti := nullif(concat_ws(' · ', nullif(btrim(v_togli.email), ''), nullif(btrim(v_togli.phone), '')), '');
  insert into public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_by)
  values (
    p_tieni, v_azienda, 'contact_merged',
    format('Unito il doppione «%s»%s', coalesce(v_nome, 'senza nome'), coalesce(' (' || v_recapiti || ')', '')),
    jsonb_build_object(
      'contatto_unito', jsonb_build_object(
        'id', v_togli.id, 'nome', v_nome, 'email', v_togli.email, 'telefono', v_togli.phone,
        'creato_il', v_togli.created_at),
      'spostati', v_spostati),
    v_uid);

  -- 4. Il doppione. Con la FK resta solo quello che doppiava le righe di chi
  --    resta: se ne va con lui.
  delete from public.marketing_contacts where id = p_togli;

  -- 5. Chi resta: le rinunce di entrambi, i recapiti che gli mancano.
  if (v_togli.optout_whatsapp is true and v_tieni.optout_whatsapp is not true)
     or (v_togli.optout_email is true and v_tieni.optout_email is not true)
     or (v_togli.optout_sms is true and v_tieni.optout_sms is not true)
     or (v_togli.optout_call is true and v_tieni.optout_call is not true)
     or (v_togli.opt_out is true and v_tieni.opt_out is not true)
     or (v_togli.unsubscribed and not v_tieni.unsubscribed)
     or (nullif(btrim(v_tieni.phone), '') is null and nullif(btrim(v_togli.phone), '') is not null)
     or (nullif(btrim(v_tieni.email), '') is null and nullif(btrim(v_togli.email), '') is not null) then
    update public.marketing_contacts c
       set optout_whatsapp = case when v_togli.optout_whatsapp then true else c.optout_whatsapp end,
           optout_email    = case when v_togli.optout_email then true else c.optout_email end,
           optout_sms      = case when v_togli.optout_sms then true else c.optout_sms end,
           optout_call     = case when v_togli.optout_call then true else c.optout_call end,
           optout_at       = coalesce(c.optout_at, v_togli.optout_at),
           optout_reason   = coalesce(c.optout_reason, v_togli.optout_reason),
           opt_out         = case when v_togli.opt_out then true else c.opt_out end,
           opt_out_at      = coalesce(c.opt_out_at, case when v_togli.opt_out then v_togli.opt_out_at end),
           unsubscribed    = c.unsubscribed or v_togli.unsubscribed,
           unsubscribed_at = coalesce(c.unsubscribed_at, case when v_togli.unsubscribed then v_togli.unsubscribed_at end),
           phone           = case when nullif(btrim(c.phone), '') is null then coalesce(nullif(btrim(v_togli.phone), ''), c.phone) else c.phone end,
           email           = case when nullif(btrim(c.email), '') is null then coalesce(nullif(btrim(v_togli.email), ''), c.email) else c.email end
     where c.id = p_tieni;
  end if;

  -- Da sola l'ultima attività non fa scattare automazioni né registro
  -- modifiche (20280925001500).
  update public.marketing_contacts c
     set last_activity_at = v_togli.last_activity_at
   where c.id = p_tieni
     and v_togli.last_activity_at is not null
     and (c.last_activity_at is null or c.last_activity_at < v_togli.last_activity_at);

  return jsonb_build_object('tenuto', p_tieni, 'unito', p_togli, 'spostati', v_spostati, 'totale', v_totale);
end;
$$;

comment on function public.unisci_contatti_marketing(uuid, uuid) is
  'Unisce il contatto p_togli in p_tieni (stessa azienda): sposta ogni riga che punta al doppione (FK dal catalogo + tabelle senza FK elencate), tiene le rinunce di entrambi e i recapiti mancanti, poi cancella il doppione. Tutto o niente.';

revoke all on function public.unisci_contatti_marketing(uuid, uuid) from public, anon;
grant execute on function public.unisci_contatti_marketing(uuid, uuid) to authenticated;
