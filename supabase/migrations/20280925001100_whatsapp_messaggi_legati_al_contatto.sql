-- WhatsApp: ogni messaggio legato al suo contatto, in entrambe le direzioni,
-- con l'esito della consegna (24/09/2026).
--
-- Prima:
--   - in Conversazioni i messaggi WhatsApp (numeri collegati a Meta) c'erano
--     solo in arrivo, e solo se il telefono del contatto aveva esattamente le
--     stesse cifre del mittente: «348 346 7567» non trovava «393483467567».
--     Quelli inviati da noi (whatsapp-send: Conversazioni, scheda cliente,
--     promemoria, bot) non comparivano mai;
--   - non si sapeva se un messaggio era stato consegnato, letto o rifiutato:
--     il webhook aggiornava lo stato solo sulle tabelle dei broadcast.
--
-- Ora:
--   - telefono_chiave(): lo stesso numero scritto in modi diversi dà la stessa
--     chiave (prefisso 39/0039/00 tolto, solo cifre);
--   - whatsapp_messages.contact_id si compila da solo all'inserimento
--     (contatto dell'azienda con lo stesso numero; se non c'è resta vuoto e il
--     messaggio si salva comunque). I 24 messaggi esistenti vengono collegati;
--   - delivery_status / delivered_at / read_at / delivery_error: li scrive il
--     webhook dagli avvisi di Meta;
--   - Conversazioni mostra i messaggi nei due sensi, con «modello» e l'esito
--     accanto al canale (✓ inviato, ✓✓ consegnato, ✓✓ letto, ✗ non consegnato),
--     e i broadcast WhatsApp nel filo di ogni destinatario, come le campagne
--     email;
--   - la policy segue l'azienda effettiva (get_my_company_id), come le altre
--     tabelle dal 24/09 (20280924220000), e la tabella entra nel realtime:
--     l'elenco delle conversazioni si aggiorna quando arriva un messaggio.
--
-- Tabella piccola (24 righe): le modifiche sono istantanee.

set local lock_timeout = '3s';

-- ── 1. La chiave del telefono ──────────────────────────────────────────────
-- Un'espressione sola, così Postgres la può espandere nelle query.
-- «+39 348 346 7567», «0039 348 3467567», «3483467567» → «3483467567».
-- Il prefisso 39 si toglie solo se restano almeno 9 cifre: «393 123 4567» è
-- un cellulare italiano (TIM) e resta com'è.
create or replace function public.telefono_chiave(p_telefono text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g'),
      '^(0039|39(?=[0-9]{9})|00)', ''),
    '')
$$;

comment on function public.telefono_chiave(text) is
  'Chiave di confronto di un numero di telefono: solo cifre, senza prefisso 39/0039/00. NULL se non ci sono cifre.';

revoke all on function public.telefono_chiave(text) from public, anon;
grant execute on function public.telefono_chiave(text) to authenticated, service_role;

-- ── 2. Il contatto di un numero ────────────────────────────────────────────
-- Il più aggiornato, se lo stesso numero è su più contatti. Lo usano il
-- webhook (service role) e il trigger qui sotto.
create or replace function public.contatto_da_telefono(p_company_id uuid, p_telefono text)
returns uuid
language sql
stable
set search_path = public
as $$
  select mc.id
    from public.marketing_contacts mc
   where mc.company_id = p_company_id
     and mc.deleted_at is null
     and public.telefono_chiave(p_telefono) is not null
     and public.telefono_chiave(mc.phone) = public.telefono_chiave(p_telefono)
   order by mc.updated_at desc nulls last
   limit 1
$$;

revoke all on function public.contatto_da_telefono(uuid, text) from public, anon, authenticated;
grant execute on function public.contatto_da_telefono(uuid, text) to service_role;

-- ── 3. Le colonne ──────────────────────────────────────────────────────────
alter table public.whatsapp_messages add column if not exists contact_id uuid;
alter table public.whatsapp_messages add column if not exists delivery_status text;
alter table public.whatsapp_messages add column if not exists delivered_at timestamptz;
alter table public.whatsapp_messages add column if not exists read_at timestamptz;
alter table public.whatsapp_messages add column if not exists delivery_error text;

comment on column public.whatsapp_messages.contact_id is
  'Contatto (marketing_contacts) del numero dall''altra parte; si compila da solo all''inserimento.';
comment on column public.whatsapp_messages.delivery_status is
  'Esito da Meta per i messaggi inviati: sent, delivered, read, failed.';
comment on column public.whatsapp_messages.delivery_error is
  'Perché Meta non l''ha consegnato, in italiano (solo con delivery_status = failed).';

create index if not exists idx_whatsapp_messages_contatto
  on public.whatsapp_messages (contact_id, created_at desc)
  where contact_id is not null;

create index if not exists idx_whatsapp_messages_wa_message_id
  on public.whatsapp_messages (wa_message_id);

-- ── 4. Il collegamento all'inserimento ─────────────────────────────────────
-- Un errore qui non deve mai far perdere il messaggio: si salva senza contatto.
create or replace function public.whatsapp_messages_collega_contatto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.contact_id is null then
    begin
      new.contact_id := public.contatto_da_telefono(
        new.company_id,
        case when new.direction = 'inbound' then new.from_phone else new.to_phone end);
    exception when others then
      new.contact_id := null;
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.whatsapp_messages_collega_contatto() from public, anon, authenticated;

drop trigger if exists trg_whatsapp_messages_collega_contatto on public.whatsapp_messages;
create trigger trg_whatsapp_messages_collega_contatto
  before insert on public.whatsapp_messages
  for each row execute function public.whatsapp_messages_collega_contatto();

-- I messaggi già salvati.
update public.whatsapp_messages wa
   set contact_id = public.contatto_da_telefono(
         wa.company_id,
         case when wa.direction = 'inbound' then wa.from_phone else wa.to_phone end)
 where wa.contact_id is null;

-- ── 5. Chi li legge: l'azienda effettiva ───────────────────────────────────
drop policy if exists wa_messages_company on public.whatsapp_messages;
create policy wa_messages_company on public.whatsapp_messages
  for all to public
  using (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
  );

-- ── 6. Realtime ────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_messages'
  ) then
    alter publication supabase_realtime add table public.whatsapp_messages;
  end if;
end
$$;

-- ── 7. Conversazioni ───────────────────────────────────────────────────────
-- La vista si aggiorna sul posto, come in 20280920100000: si prende la
-- definizione che c'è, si tolgono i rami che leggono whatsapp_messages (e
-- quello dei broadcast, se la si rilancia) e si aggiungono quelli nuovi.
-- security_invoker va ridetto: CREATE OR REPLACE VIEW senza WITH lo toglie.
do $mig$
declare
  v_def text;
  v_rami text[];
  v_tenuti text[] := '{}';
  v_ramo text;
  v_tolti_wa int := 0;
  v_tolti_broadcast int := 0;
  v_colonne constant text := $col$
    'whatsapp'::text AS canale,
        CASE
            WHEN wa.direction = 'inbound'::text THEN 'in'::text
            ELSE 'out'::text
        END AS direzione,
        CASE
            WHEN wa.direction = 'inbound'::text THEN wa.from_phone
            ELSE wa.to_phone
        END AS controparte,
        CASE
            WHEN wa.direction = 'inbound'::text THEN NULL::text
            ELSE NULLIF(concat_ws(' · '::text,
                CASE WHEN wa.message_type = 'template'::text THEN 'modello'::text ELSE NULL::text END,
                CASE wa.delivery_status
                    WHEN 'failed'::text THEN '✗ non consegnato'::text || COALESCE(': '::text || wa.delivery_error, ''::text)
                    WHEN 'read'::text THEN '✓✓ letto'::text
                    WHEN 'delivered'::text THEN '✓✓ consegnato'::text
                    WHEN 'sent'::text THEN '✓ inviato'::text
                    ELSE NULL::text
                END), ''::text)
        END AS oggetto,
    COALESCE(NULLIF(wa.content_text, ''::text), '📎 allegato'::text) AS testo,
    wa.media_url,
    wa.created_at AS ts,
    'whatsapp_messages'::text AS ref_tabella,
    wa.id AS ref_id$col$;
  v_nuovi text;
begin
  select pg_get_viewdef('public.v_conversazioni_messaggi'::regclass, true) into v_def;
  if v_def is null then
    raise exception 'v_conversazioni_messaggi non trovata';
  end if;
  v_def := regexp_replace(v_def, ';\s*$', '');

  v_rami := string_to_array(v_def, E'\nUNION ALL\n');
  foreach v_ramo in array v_rami loop
    if position('FROM whatsapp_messages wa' in v_ramo) > 0 then
      v_tolti_wa := v_tolti_wa + 1;
    elsif position('FROM whatsapp_broadcast_recipients r' in v_ramo) > 0 then
      v_tolti_broadcast := v_tolti_broadcast + 1;
    else
      v_tenuti := v_tenuti || v_ramo;
    end if;
  end loop;
  -- Si tolgono esattamente i due rami di prima (contatto, cliente), o i
  -- quattro di questa migrazione se la si rilancia.
  if not ((v_tolti_wa = 2 and v_tolti_broadcast = 0) or (v_tolti_wa = 3 and v_tolti_broadcast = 1)) then
    raise exception 'v_conversazioni_messaggi: rami WhatsApp inattesi (messaggi %, broadcast %)',
      v_tolti_wa, v_tolti_broadcast;
  end if;
  if position('FROM email_inbox ei' in v_tenuti[1]) = 0 then
    raise exception 'v_conversazioni_messaggi: il primo ramo non è più quello delle email in arrivo';
  end if;

  v_nuovi :=
    -- Contatto collegato al messaggio (tutti i messaggi nuovi).
       E' SELECT ''contatto''::text AS entita_tipo,\n    ct.id AS entita_id,\n    wa.company_id,\n'
    || v_colonne
    || E'\n   FROM whatsapp_messages wa\n     JOIN marketing_contacts ct ON ct.id = wa.contact_id AND ct.company_id = wa.company_id'
    || E'\nUNION ALL\n'
    -- Messaggi senza contatto collegato: come prima, per cifre uguali.
    || E' SELECT ''contatto''::text AS entita_tipo,\n    ct.id AS entita_id,\n    wa.company_id,\n'
    || v_colonne
    || E'\n   FROM whatsapp_messages wa\n     JOIN marketing_contacts ct ON ct.company_id = wa.company_id'
    || E' AND regexp_replace(COALESCE(ct.phone, ''''::text), ''[^0-9]''::text, ''''::text, ''g''::text) <> ''''::text'
    || E' AND regexp_replace(COALESCE(ct.phone, ''''::text), ''[^0-9]''::text, ''''::text, ''g''::text)'
    || E' = regexp_replace(COALESCE(CASE WHEN wa.direction = ''inbound''::text THEN wa.from_phone ELSE wa.to_phone END, ''''::text), ''[^0-9]''::text, ''''::text, ''g''::text)'
    || E'\n  WHERE wa.contact_id IS NULL'
    || E'\nUNION ALL\n'
    -- Clienti del portale (profiles): per numero, nei due sensi.
    || E' SELECT ''cliente''::text AS entita_tipo,\n    p.id AS entita_id,\n    wa.company_id,\n'
    || v_colonne
    || E'\n   FROM whatsapp_messages wa\n     JOIN profiles p ON p.company_id = wa.company_id AND p.customer_type IS NOT NULL'
    || E' AND telefono_chiave(p.phone) IS NOT NULL'
    || E' AND telefono_chiave(p.phone) = telefono_chiave(CASE WHEN wa.direction = ''inbound''::text THEN wa.from_phone ELSE wa.to_phone END)'
    || E'\nUNION ALL\n'
    -- Broadcast WhatsApp: una riga per destinatario, come le campagne email.
    || $b$ SELECT 'contatto'::text AS entita_tipo,
    r.contact_id AS entita_id,
    b.company_id,
    'whatsapp'::text AS canale,
    'out'::text AS direzione,
    r.phone AS controparte,
    NULLIF(concat_ws(' · '::text, 'modello'::text,
        CASE r.status
            WHEN 'failed'::text THEN '✗ non consegnato'::text || COALESCE(': '::text || r.error_message, ''::text)
            WHEN 'replied'::text THEN '✓✓ letto'::text
            WHEN 'read'::text THEN '✓✓ letto'::text
            WHEN 'delivered'::text THEN '✓✓ consegnato'::text
            WHEN 'sent'::text THEN '✓ inviato'::text
            ELSE NULL::text
        END), ''::text) AS oggetto,
    ('📣 Broadcast «'::text || COALESCE(NULLIF(b.nome, ''::text), b.template_name, 'WhatsApp'::text)) || '»'::text AS testo,
    NULL::text AS media_url,
    COALESCE(r.sent_at, b.started_at, b.created_at) AS ts,
    'whatsapp_broadcast_recipients'::text AS ref_tabella,
    r.id AS ref_id
   FROM whatsapp_broadcast_recipients r
     JOIN whatsapp_broadcasts b ON b.id = r.broadcast_id
     JOIN marketing_contacts ct ON ct.id = r.contact_id AND ct.company_id = b.company_id$b$;

  execute 'create or replace view public.v_conversazioni_messaggi with (security_invoker = on) as '
    || array_to_string(v_tenuti, E'\nUNION ALL\n') || E'\nUNION ALL\n' || v_nuovi;
end
$mig$;
