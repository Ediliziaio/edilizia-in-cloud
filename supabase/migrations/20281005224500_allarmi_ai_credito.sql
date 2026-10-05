-- Allarmi dei provider AI: il credito finito si deve sapere SUBITO.
--
-- Dal 02/10/2026 il conto OpenRouter era a zero e quasi ogni chiamata AI
-- rispondeva 402; Silvio ripiegava su gpt-4o-mini e il resto taceva. L'unico
-- avviso esistente stava in una sola funzione (la lettura dei PDF), finiva
-- solo nella campanella e al massimo una volta al giorno: il titolare non
-- l'ha saputo. Qui il registro degli allarmi: una riga per ogni guasto
-- (credito esaurito, chiave rifiutata, tetto della chiave, credito in calo),
-- aperta alla prima segnalazione e chiusa quando il provider risponde di nuovo.
--
-- Chi scrive: le funzioni AI nel punto in cui il provider risponde male
-- (_shared/allarmeAI.ts → ai_allarme_registra) e il controllo del canarino
-- ogni 5 minuti (ops-canarino, modo «credito-ai»). Chi avvisa: solo il
-- canarino, che prende in carico gli allarmi da comunicare con
-- ai_allarmi_da_notificare() in modo atomico (due controlli insieme non
-- mandano due email).
--
-- Promemoria spaziati: subito, dopo 30 minuti, dopo 2 ore, poi ogni 6 ore; il
-- «credito in calo» una volta al giorno. Il cron e la sveglia immediata del
-- canarino NON stanno in questa migrazione: si accendono (migrazione
-- successiva) solo dopo che la nuova versione di ops-canarino è online — una
-- versione vecchia, ricevendo un modo che non conosce, spedirebbe il rapporto
-- del mattino a ogni chiamata.
--
-- Tutto idempotente. Le funzioni nascono chiuse (REVOKE a PUBLIC, anon e
-- authenticated) e si aprono solo al service role.

create table if not exists public.ai_allarmi (
  id                     uuid primary key default gen_random_uuid(),
  provider               text not null,
  motivo                 text not null,
  aperto_il              timestamptz not null default now(),
  ultima_vista           timestamptz not null default now(),
  -- «almeno»: i conteggi arrivano a lotti da ogni isolate, non sono esatti.
  conteggio              integer not null default 0,
  funzioni               jsonb not null default '{}'::jsonb,
  modelli                jsonb not null default '{}'::jsonb,
  -- Id delle aziende colpite, al massimo 200.
  aziende                jsonb not null default '[]'::jsonb,
  ultimo_dettaglio       text,
  ultima_notifica        timestamptz,
  -- Il valore di ultima_notifica prima dell'ultima presa in carico: serve a
  -- rimettere le cose a posto se l'email non parte.
  ultima_notifica_prima  timestamptz,
  notifiche_inviate      integer not null default 0,
  -- Ultima volta che una funzione ha svegliato il canarino per questo allarme.
  ultima_sveglia         timestamptz,
  chiuso_il              timestamptz,
  chiuso_nota            text,
  constraint ai_allarmi_motivo_valido
    check (motivo in ('credito_esaurito', 'credito_basso', 'chiave_non_valida', 'limite_chiave'))
);

-- Un solo allarme APERTO per (provider, motivo): le segnalazioni successive lo aggiornano.
create unique index if not exists ai_allarmi_uno_aperto
  on public.ai_allarmi (provider, motivo)
  where chiuso_il is null;

create index if not exists ai_allarmi_recenti on public.ai_allarmi (aperto_il desc);

alter table public.ai_allarmi enable row level security;

revoke all on public.ai_allarmi from anon, authenticated;
grant select on public.ai_allarmi to authenticated;
grant all on public.ai_allarmi to service_role;

drop policy if exists ai_allarmi_super_admin_select on public.ai_allarmi;
create policy ai_allarmi_super_admin_select on public.ai_allarmi
  for select to authenticated
  using ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)));

-- Ogni quanto si ripete l'avviso di un allarme ancora aperto.
create or replace function public.ai_allarme_intervallo(p_motivo text, p_inviate integer)
returns interval
language sql
immutable
set search_path = public
as $$
  select case
    when p_motivo = 'credito_basso' then interval '24 hours'
    when coalesce(p_inviate, 0) <= 1 then interval '30 minutes'
    when p_inviate = 2 then interval '2 hours'
    else interval '6 hours'
  end
$$;

-- Registra una segnalazione: apre l'allarme o ne aggiorna uno aperto. Risponde
-- {id, nuovo, da_notificare}: da_notificare dice a chi chiama di svegliare il
-- canarino ORA (al massimo una volta ogni 2 minuti per allarme, e solo se la
-- sveglia immediata è accesa).
create or replace function public.ai_allarme_registra(
  p_provider text,
  p_motivo text,
  p_funzione text default null,
  p_modello text default null,
  p_dettaglio text default null,
  p_azienda uuid default null,
  p_conteggio integer default 1
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := greatest(coalesce(p_conteggio, 1), 1);
  v_id uuid;
  v_nuovo boolean;
  v_riga public.ai_allarmi%rowtype;
  v_attiva boolean;
  v_sveglia boolean;
begin
  if p_provider is null or p_motivo is null then
    raise exception 'ai_allarme_registra: provider e motivo sono obbligatori';
  end if;
  -- Chi chiama è una funzione AI in corso: meglio fallire in fretta che bloccarla.
  perform set_config('lock_timeout', '2s', true);
  perform set_config('statement_timeout', '5s', true);

  insert into public.ai_allarmi as a (provider, motivo, conteggio, funzioni, modelli, aziende, ultimo_dettaglio)
  values (
    p_provider,
    p_motivo,
    v_n,
    case when p_funzione is null then '{}'::jsonb else jsonb_build_object(p_funzione, v_n) end,
    case when p_modello is null then '{}'::jsonb else jsonb_build_object(p_modello, v_n) end,
    case when p_azienda is null then '[]'::jsonb else jsonb_build_array(p_azienda::text) end,
    left(p_dettaglio, 600)
  )
  on conflict (provider, motivo) where chiuso_il is null
  do update set
    ultima_vista = now(),
    conteggio = a.conteggio + v_n,
    funzioni = case
      when p_funzione is null then a.funzioni
      else a.funzioni || jsonb_build_object(p_funzione, coalesce((a.funzioni ->> p_funzione)::integer, 0) + v_n)
    end,
    modelli = case
      when p_modello is null then a.modelli
      else a.modelli || jsonb_build_object(p_modello, coalesce((a.modelli ->> p_modello)::integer, 0) + v_n)
    end,
    aziende = case
      when p_azienda is null
        or a.aziende @> to_jsonb(p_azienda::text)
        or jsonb_array_length(a.aziende) >= 200
      then a.aziende
      else a.aziende || to_jsonb(p_azienda::text)
    end,
    ultimo_dettaglio = coalesce(left(p_dettaglio, 600), a.ultimo_dettaglio)
  returning a.id, (a.xmax = 0) into v_id, v_nuovo;

  select * into v_riga from public.ai_allarmi where id = v_id;

  select coalesce(
    (select value = 'true' from public.platform_settings where key = 'ai_allarmi_sveglia_immediata'),
    false
  ) into v_attiva;

  v_sveglia := v_attiva
    and (v_riga.ultima_notifica is null
         or v_riga.ultima_notifica < now() - public.ai_allarme_intervallo(v_riga.motivo, v_riga.notifiche_inviate))
    and (v_riga.ultima_sveglia is null or v_riga.ultima_sveglia < now() - interval '2 minutes');

  if v_sveglia then
    update public.ai_allarmi set ultima_sveglia = now() where id = v_id;
  end if;

  return jsonb_build_object('id', v_id, 'nuovo', v_nuovo, 'da_notificare', v_sveglia);
end;
$$;

-- Prende in carico gli allarmi aperti che vanno comunicati (mai avvisati, o
-- con il promemoria scaduto) e li restituisce. L'UPDATE è l'atomicità: due
-- controlli in parallelo non prendono lo stesso allarme.
create or replace function public.ai_allarmi_da_notificare()
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('lock_timeout', '3s', true);
  return query
    with prese as (
      update public.ai_allarmi a
         set ultima_notifica_prima = a.ultima_notifica,
             ultima_notifica = now(),
             notifiche_inviate = a.notifiche_inviate + 1
       where a.chiuso_il is null
         and (a.ultima_notifica is null
              or a.ultima_notifica < now() - public.ai_allarme_intervallo(a.motivo, a.notifiche_inviate))
      returning a.*
    )
    select to_jsonb(p) from prese p;
end;
$$;

-- L'email non è partita: l'allarme torna com'era, e il controllo successivo riprova.
create or replace function public.ai_allarme_rilascia(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_allarmi
     set ultima_notifica = ultima_notifica_prima,
         ultima_notifica_prima = null,
         notifiche_inviate = greatest(notifiche_inviate - 1, 0)
   where id = p_id and chiuso_il is null
$$;

-- Chiude un allarme (il provider risponde di nuovo, o il saldo è risalito).
-- Restituisce la riga chiusa, o null se era già chiusa: chi chiama sa se è lui
-- a dover avvisare del ripristino.
create or replace function public.ai_allarme_chiudi(p_id uuid, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_riga public.ai_allarmi%rowtype;
begin
  update public.ai_allarmi
     set chiuso_il = now(), chiuso_nota = left(p_nota, 300)
   where id = p_id and chiuso_il is null
  returning * into v_riga;
  if not found then
    return null;
  end if;
  return to_jsonb(v_riga);
end;
$$;

revoke all on function public.ai_allarme_intervallo(text, integer) from public, anon, authenticated;
revoke all on function public.ai_allarme_registra(text, text, text, text, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.ai_allarmi_da_notificare() from public, anon, authenticated;
revoke all on function public.ai_allarme_rilascia(uuid) from public, anon, authenticated;
revoke all on function public.ai_allarme_chiudi(uuid, text) from public, anon, authenticated;

grant execute on function public.ai_allarme_intervallo(text, integer) to service_role;
grant execute on function public.ai_allarme_registra(text, text, text, text, text, uuid, integer) to service_role;
grant execute on function public.ai_allarmi_da_notificare() to service_role;
grant execute on function public.ai_allarme_rilascia(uuid) to service_role;
grant execute on function public.ai_allarme_chiudi(uuid, text) to service_role;

comment on table public.ai_allarmi is
  'Allarmi dei provider AI (credito esaurito/in calo, chiave rifiutata, tetto della chiave). Una riga per guasto; scrive _shared/allarmeAI.ts e ops-canarino (modo credito-ai).';
