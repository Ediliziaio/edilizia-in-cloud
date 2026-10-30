-- ════════════════════════════════════════════════════════════════════════════
-- Commesse generali: gli avvisi escono dalla pagina (campanella, push, email)
-- ════════════════════════════════════════════════════════════════════════════
-- Prima gli stati della generale (garanzie in scadenza, documenti mancanti,
-- fideiussioni 122/2005, commesse in perdita, fine lavori e penali) si vedevano
-- solo aprendo la scheda. Qui la parte del database; il calcolo sta nel codice
-- (src/lib/orders/generali/avvisi.ts, lo stesso della pagina: l'elenco dei
-- documenti richiesti vive lì) e lo fa girare la edge function generali-avvisi.
--
--   · commesse_generali_avvisi           un evento per generale, con una chiave
--     stabile («garanzia:<id>:<scadenza>:7»). Aperto finché la condizione c'è;
--     quando sparisce si chiude (risolto_il). UNA riga aperta per chiave: è
--     questo che fa partire ogni avviso una volta sola.
--   · commesse_generali_avvisi_invii     a chi è andato: campanella subito,
--     email nel riepilogo (lunedì, o il giorno dopo se l'evento è urgente).
--   · commesse_generali_avvisi_controlli quando ogni generale è stata guardata
--     l'ultima volta: il giro va a rotazione, le meno recenti prima.
--   · user_notification_preferences.commesse_generali_in_app / _email.
--
-- Le funzioni generali_avvisi_* sono solo per il service role. Non c'è cron
-- qui: la funzione va pubblicata prima, il cron si accende con la migrazione
-- successiva (20281105111000).
-- Idempotente. Nessun dato esistente viene toccato.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Gli eventi ───────────────────────────────────────────────────────────
create table if not exists public.commesse_generali_avvisi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  generale_id uuid not null references public.commesse_generali(order_id) on delete cascade,
  chiave text not null,
  tipo text not null,
  urgente boolean not null default false,
  -- Chi non vede gli importi (o i margini) non riceve l'avviso: il testo li cita.
  richiede text,
  titolo text not null,
  testo text not null,
  link text not null,
  creato_il timestamptz not null default now(),
  risolto_il timestamptz,
  constraint commesse_generali_avvisi_richiede check (richiede is null or richiede in ('importi', 'margini')),
  constraint commesse_generali_avvisi_link check (link like '/azienda/ordini/%')
);
create unique index if not exists commesse_generali_avvisi_aperto_uq
  on public.commesse_generali_avvisi (generale_id, chiave) where risolto_il is null;
create index if not exists commesse_generali_avvisi_chiave_idx
  on public.commesse_generali_avvisi (generale_id, chiave, risolto_il);

comment on table public.commesse_generali_avvisi is
  'Avvisi delle commesse generali già mandati (campanella, email). Una riga aperta per chiave: un evento avvisa una volta sola. Li scrive la edge function generali-avvisi con generali_avvisi_registra.';

create table if not exists public.commesse_generali_avvisi_invii (
  avviso_id uuid not null references public.commesse_generali_avvisi(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  campanella_il timestamptz,
  -- false = la persona ha spento le email delle commesse generali quando l'evento è nato.
  email_dovuta boolean not null default false,
  email_il timestamptz,
  primary key (avviso_id, user_id)
);
create index if not exists commesse_generali_avvisi_invii_email_idx
  on public.commesse_generali_avvisi_invii (user_id, company_id) where email_dovuta and email_il is null;

create table if not exists public.commesse_generali_avvisi_controlli (
  generale_id uuid primary key references public.commesse_generali(order_id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  controllata_il timestamptz not null default now()
);

-- Solo il service role: nessuna policy. Chi usa l'app vede la campanella (notifications).
alter table public.commesse_generali_avvisi enable row level security;
alter table public.commesse_generali_avvisi_invii enable row level security;
alter table public.commesse_generali_avvisi_controlli enable row level security;
revoke all on public.commesse_generali_avvisi, public.commesse_generali_avvisi_invii,
  public.commesse_generali_avvisi_controlli from anon, authenticated;

-- ── 2. Preferenze ───────────────────────────────────────────────────────────
alter table public.user_notification_preferences
  add column if not exists commesse_generali_in_app boolean not null default true,
  add column if not exists commesse_generali_email boolean not null default true;
comment on column public.user_notification_preferences.commesse_generali_in_app is
  'Avvisi delle commesse generali nella campanella (e push). Li legge generali_avvisi_contesto.';
comment on column public.user_notification_preferences.commesse_generali_email is
  'Avvisi delle commesse generali per email: riepilogo il lunedì, il giorno dopo se urgenti.';

-- ── 3. Quali generali guardare in questo giro ──────────────────────────────
create or replace function public.generali_avvisi_da_controllare(p_limite integer default 20)
returns table (generale_id uuid, company_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select g.order_id, g.company_id
    from public.commesse_generali g
    join public.orders o on o.id = g.order_id and o.deleted_at is null
    left join public.commesse_generali_avvisi_controlli c on c.generale_id = g.order_id
   -- Una volta al giorno (giorno di Roma) per generale.
   where c.controllata_il is null
      or (c.controllata_il at time zone 'Europe/Rome')::date < (now() at time zone 'Europe/Rome')::date
   order by c.controllata_il nulls first, g.order_id
   limit greatest(1, least(coalesce(p_limite, 20), 100));
$$;
revoke all on function public.generali_avvisi_da_controllare(integer) from public, anon, authenticated;
grant execute on function public.generali_avvisi_da_controllare(integer) to service_role;

-- ── 4. Tutto quello che serve per calcolare gli avvisi di una generale ──────
-- Il riepilogo e il contratto si leggono con le stesse RPC della pagina
-- (commessa_generale_riepilogo, generale_contratto_leggi), che vogliono un
-- utente: le si chiama con l'identità di un amministratore dell'azienda, solo
-- dentro questa transazione, così i numeri sono quelli che vedrebbe lui. Chi
-- riceve l'avviso viene filtrato dopo, coi permessi suoi (destinatari).
create or replace function public.generali_avvisi_contesto(p_generale_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_azienda uuid;
  v_gestore uuid;
  v_admin uuid;
  v_prima_sub text := current_setting('request.jwt.claim.sub', true);
  v_prima_claims text := current_setting('request.jwt.claims', true);
  v_riepilogo jsonb;
  v_contratto jsonb;
  v_ids uuid[];
  v_destinatari jsonb;
begin
  select g.company_id, o.assigned_to into v_azienda, v_gestore
    from public.commesse_generali g
    join public.orders o on o.id = g.order_id and o.deleted_at is null
   where g.order_id = p_generale_id;
  if v_azienda is null then
    return null;
  end if;

  -- Chi riceve: chi gestisce la generale e gli amministratori dell'azienda, se possono vedere le commesse.
  with candidati as (
    select v_gestore as uid, false as amministratore where v_gestore is not null
    union all
    select p.id, true from public.profiles p
     where p.company_id = v_azienda
       and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'company_admin')
    union all
    select mca.user_id, true from public.multi_company_access mca
     where mca.company_id = v_azienda and mca.status = 'active'
       and (mca.expires_at is null or mca.expires_at > now())
       and mca.access_role::text = 'company_admin'
  ),
  uniti as (select uid, bool_or(amministratore) as amministratore from candidati group by uid)
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', p.id,
           'email', p.email,
           'nome', p.first_name,
           'amministratore', c.amministratore,
           'importi', public.has_permission_for_company(p.id, 'can_view_order_amounts', v_azienda),
           'margini', public.has_permission_for_company(p.id, 'can_view_margins', v_azienda),
           'in_app', coalesce(np.commesse_generali_in_app, true),
           'email_attiva', coalesce(np.commesse_generali_email, true)
         ) order by p.id), '[]'::jsonb)
    into v_destinatari
    from uniti c
    join public.profiles p on p.id = c.uid
    left join public.user_notification_preferences np on np.user_id = p.id
   where coalesce(p.is_blocked, false) = false
     and p.deleted_at is null
     and public.has_permission_for_company(p.id, 'can_view_orders', v_azienda);

  -- L'identità con cui leggere: un amministratore che vede tutto (importi, costi, margini).
  select (d ->> 'user_id')::uuid into v_admin
    from jsonb_array_elements(v_destinatari) d
   where (d ->> 'amministratore')::boolean and (d ->> 'importi')::boolean and (d ->> 'margini')::boolean
   limit 1;
  if v_admin is null then
    return jsonb_build_object('generale_id', p_generale_id, 'company_id', v_azienda,
                              'destinatari', v_destinatari, 'riepilogo', null);
  end if;

  -- Le claims tornano com'erano; mai vuote: chiamante_anonimo() le legge come JSON.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin
    v_riepilogo := public.commessa_generale_riepilogo(p_generale_id);
    begin
      v_contratto := public.generale_contratto_leggi(p_generale_id);
    exception when others then
      v_contratto := null;   -- un appalto senza contratto, o un modello che non lo usa
    end;
  exception when others then
    perform set_config('request.jwt.claim.sub', coalesce(v_prima_sub, ''), true);
    perform set_config('request.jwt.claims', coalesce(nullif(v_prima_claims, ''), '{}'), true);
    raise;
  end;
  perform set_config('request.jwt.claim.sub', coalesce(v_prima_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(nullif(v_prima_claims, ''), '{}'), true);

  select array_agg((f ->> 'id')::uuid) into v_ids
    from jsonb_array_elements(coalesce(v_riepilogo -> 'figlie', '[]'::jsonb)) f;
  v_ids := array_prepend(p_generale_id, coalesce(v_ids, '{}'::uuid[]));

  return jsonb_build_object(
    'generale_id', p_generale_id,
    'company_id', v_azienda,
    'destinatari', v_destinatari,
    'riepilogo', v_riepilogo,
    'contratto', v_contratto,
    'voci', (select coalesce(jsonb_agg(jsonb_build_object(
               'id', v.id, 'modello', v.modello, 'chiave', v.chiave, 'nome', v.nome, 'ambito', v.ambito,
               'obbligatoria', v.obbligatoria, 'con_scadenza', v.con_scadenza, 'tolta', v.tolta, 'posizione', v.posizione)), '[]'::jsonb)
               from public.commesse_generali_documenti_voci v where v.company_id = v_azienda),
    'allegati', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', a.id, 'order_id', a.order_id, 'file_name', a.file_name, 'file_url', a.file_url,
                   'file_type', a.file_type, 'created_at', a.created_at)), '[]'::jsonb)
                   from public.order_attachments a where a.order_id = any (v_ids)),
    'segni', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', s.id, 'order_id', s.order_id, 'voce', s.voce, 'tipo', s.tipo,
                'attachment_id', s.attachment_id, 'scadenza', s.scadenza)), '[]'::jsonb)
                from public.commesse_generali_documenti s where s.order_id = any (v_ids))
  );
end;
$$;
revoke all on function public.generali_avvisi_contesto(uuid) from public, anon, authenticated;
grant execute on function public.generali_avvisi_contesto(uuid) to service_role;

-- ── 5. Registrare gli avvisi di un giro e suonare la campanella ─────────────
-- p_avvisi: [{chiave, tipo, urgente, richiede, titolo, testo, link}], TUTTI quelli
-- veri oggi per la generale. I nuovi si aprono e avvisano; quelli aperti che non
-- ci sono più si chiudono. Una chiave chiusa da meno di 14 giorni non riavvisa:
-- una commessa che va e viene dalla perdita non suona ogni giorno.
-- p_destinatari: quello che ha restituito generali_avvisi_contesto.
create or replace function public.generali_avvisi_registra(p_generale_id uuid, p_avvisi jsonb, p_destinatari jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_azienda uuid;
  v_codice text;
  v_chiusi integer := 0;
  v_nuovi integer := 0;
  v_notifiche integer := 0;
begin
  select g.company_id, coalesce(nullif(o.order_code, ''), nullif(o.description, ''), 'Commessa generale')
    into v_azienda, v_codice
    from public.commesse_generali g
    join public.orders o on o.id = g.order_id
   where g.order_id = p_generale_id;
  if v_azienda is null then
    return jsonb_build_object('nuovi', 0, 'chiusi', 0, 'notifiche', 0);
  end if;
  if jsonb_typeof(coalesce(p_avvisi, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_destinatari, '[]'::jsonb)) <> 'array' then
    raise exception 'Avvisi e destinatari devono essere elenchi.' using errcode = '22023';
  end if;

  insert into public.commesse_generali_avvisi_controlli (generale_id, company_id, controllata_il)
  values (p_generale_id, v_azienda, now())
  on conflict (generale_id) do update set controllata_il = excluded.controllata_il;

  with oggi as (select distinct x ->> 'chiave' as chiave from jsonb_array_elements(coalesce(p_avvisi, '[]'::jsonb)) x),
  chiusi as (
    update public.commesse_generali_avvisi a set risolto_il = now()
     where a.generale_id = p_generale_id and a.risolto_il is null
       and not exists (select 1 from oggi where oggi.chiave = a.chiave)
    returning 1
  )
  select count(*) into v_chiusi from chiusi;

  -- Un'istruzione sola: nuovi eventi → a chi vanno → una notifica per persona e per scheda
  -- (dieci documenti mancanti sono una riga sola nella campanella).
  with proposti as (
    select distinct on (x ->> 'chiave')
           x ->> 'chiave' as chiave, coalesce(x ->> 'tipo', 'altro') as tipo,
           coalesce((x ->> 'urgente')::boolean, false) as urgente,
           nullif(x ->> 'richiede', '') as richiede,
           left(coalesce(x ->> 'titolo', ''), 160) as titolo, left(coalesce(x ->> 'testo', ''), 600) as testo,
           x ->> 'link' as link
      from jsonb_array_elements(coalesce(p_avvisi, '[]'::jsonb)) x
     where coalesce(x ->> 'chiave', '') <> '' and coalesce(x ->> 'titolo', '') <> ''
       and coalesce(x ->> 'link', '') like '/azienda/ordini/%'
  ),
  nuovi as (
    insert into public.commesse_generali_avvisi (company_id, generale_id, chiave, tipo, urgente, richiede, titolo, testo, link)
    select v_azienda, p_generale_id, p.chiave, p.tipo, p.urgente, p.richiede, p.titolo, p.testo, p.link
      from proposti p
     where not exists (
             select 1 from public.commesse_generali_avvisi a
              where a.generale_id = p_generale_id and a.chiave = p.chiave
                and (a.risolto_il is null or a.risolto_il > now() - interval '14 days'))
    on conflict do nothing
    returning id, richiede, titolo, testo, link
  ),
  -- A chi va ogni avviso nuovo: i permessi della persona decidono, le preferenze dicono dove.
  invii as (
    insert into public.commesse_generali_avvisi_invii (avviso_id, user_id, company_id, campanella_il, email_dovuta)
    select n.id, p.id, v_azienda,
           case when coalesce((d ->> 'in_app')::boolean, true) then now() end,
           coalesce((d ->> 'email_attiva')::boolean, true) and coalesce(d ->> 'email', '') <> ''
      from nuovi n
      cross join jsonb_array_elements(coalesce(p_destinatari, '[]'::jsonb)) d
      join public.profiles p on p.id = (d ->> 'user_id')::uuid
     where n.richiede is null
        or (n.richiede = 'importi' and coalesce((d ->> 'importi')::boolean, false))
        or (n.richiede = 'margini' and coalesce((d ->> 'margini')::boolean, false))
    on conflict (avviso_id, user_id) do nothing
    returning avviso_id, user_id, campanella_il
  ),
  per_scheda as (
    select i.user_id, n.link, count(*) as quanti,
           min(n.titolo) as titolo, string_agg(n.testo, ' · ' order by n.titolo) as testi
      from invii i
      join nuovi n on n.id = i.avviso_id
     where i.campanella_il is not null
     group by i.user_id, n.link
  ),
  inviate as (
    insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
    select v_azienda, s.user_id, 'commessa_generale_avviso',
           case when s.quanti = 1 then s.titolo else v_codice || ': ' || s.quanti || ' cose da guardare' end,
           left(s.testi, 300), 'order', p_generale_id, s.link
      from per_scheda s
    returning 1
  )
  select (select count(*) from nuovi), (select count(*) from inviate) into v_nuovi, v_notifiche;

  return jsonb_build_object('nuovi', v_nuovi, 'chiusi', v_chiusi, 'notifiche', v_notifiche);
end;
$$;
revoke all on function public.generali_avvisi_registra(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.generali_avvisi_registra(uuid, jsonb, jsonb) to service_role;

-- ── 6. Le email da mandare ──────────────────────────────────────────────────
-- Per persona e azienda, gli avvisi ancora aperti, nati negli ultimi 21 giorni e
-- non ancora in un'email. Chi ha già ricevuto oggi l'email delle generali aspetta
-- domani. La scelta «oggi sì o no» (lunedì, o un avviso urgente) è del codice.
create or replace function public.generali_avvisi_email_da_mandare(p_limite integer default 25)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with pendenti as (
    select i.user_id, i.company_id, a.id, a.generale_id, a.tipo, a.urgente, a.titolo, a.testo, a.link, a.creato_il,
           coalesce(nullif(o.order_code, ''), nullif(o.description, ''), 'Commessa generale') as generale
      from public.commesse_generali_avvisi_invii i
      join public.commesse_generali_avvisi a on a.id = i.avviso_id
      join public.orders o on o.id = a.generale_id and o.deleted_at is null
     where i.email_dovuta and i.email_il is null
       and a.risolto_il is null
       -- Chi ha spento le email nel frattempo non le riceve più.
       and coalesce((select np.commesse_generali_email from public.user_notification_preferences np
                      where np.user_id = i.user_id), true)
       and a.creato_il > now() - interval '21 days'
  ),
  persone as (
    select p.user_id, p.company_id
      from pendenti p
     where not exists (
             select 1 from public.commesse_generali_avvisi_invii j
              where j.user_id = p.user_id and j.company_id = p.company_id
                and (j.email_il at time zone 'Europe/Rome')::date = (now() at time zone 'Europe/Rome')::date)
     group by p.user_id, p.company_id
     order by bool_or(p.urgente) desc, min(p.creato_il)
     limit greatest(1, least(coalesce(p_limite, 25), 100))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', pe.user_id, 'company_id', pe.company_id, 'email', pr.email, 'nome', pr.first_name,
           'avvisi', (select jsonb_agg(jsonb_build_object(
                        'id', x.id, 'generale_id', x.generale_id, 'generale', x.generale, 'tipo', x.tipo,
                        'urgente', x.urgente, 'titolo', x.titolo, 'testo', x.testo, 'link', x.link,
                        'creato_il', x.creato_il) order by x.generale, x.urgente desc, x.creato_il)
                        from pendenti x where x.user_id = pe.user_id and x.company_id = pe.company_id))), '[]'::jsonb)
    from persone pe
    join public.profiles pr on pr.id = pe.user_id
   where coalesce(pr.email, '') <> '' and coalesce(pr.is_blocked, false) = false and pr.deleted_at is null;
$$;
revoke all on function public.generali_avvisi_email_da_mandare(integer) from public, anon, authenticated;
grant execute on function public.generali_avvisi_email_da_mandare(integer) to service_role;

create or replace function public.generali_avvisi_email_segna(p_user_id uuid, p_avvisi uuid[])
returns integer
language sql
volatile
security definer
set search_path to 'public'
as $$
  with segnati as (
    update public.commesse_generali_avvisi_invii
       set email_il = now()
     where user_id = p_user_id and avviso_id = any (coalesce(p_avvisi, '{}'::uuid[])) and email_il is null
    returning 1
  )
  select count(*)::integer from segnati;
$$;
revoke all on function public.generali_avvisi_email_segna(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.generali_avvisi_email_segna(uuid, uuid[]) to service_role;

-- ── 7. Anche sul telefono ───────────────────────────────────────────────────
-- trg_notifica_push manda le push solo per i tipi nel suo WHEN: si aggiunge il
-- nostro all'elenco che c'è, senza riscriverlo (altre migrazioni lo allungano).
do $push$
declare
  v_def text;
begin
  select pg_get_triggerdef(t.oid) into v_def
    from pg_trigger t
   where t.tgname = 'trg_notifica_push' and t.tgrelid = 'public.notifications'::regclass;
  if v_def is not null and position('commessa_generale_avviso' in v_def) = 0 and position('ARRAY[' in v_def) > 0 then
    execute 'drop trigger trg_notifica_push on public.notifications';
    execute replace(v_def, 'ARRAY[', 'ARRAY[''commessa_generale_avviso''::text, ');
  end if;
end
$push$;
