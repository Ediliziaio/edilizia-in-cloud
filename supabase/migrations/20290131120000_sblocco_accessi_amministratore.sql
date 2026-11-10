create table if not exists public.login_lock_resets (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  email       text not null,
  ip_address  inet not null,
  reset_at    timestamptz not null default now(),
  reset_by    uuid references auth.users(id) on delete set null
);

comment on table public.login_lock_resets is
  'Sblocchi fatti da un amministratore: da reset_at in poi il conteggio dei tentativi falliti per (email, ip_address) riparte da zero. Lo storico in login_attempts resta intatto.';

create index if not exists login_lock_resets_coppia_idx
  on public.login_lock_resets (email, ip_address, reset_at desc);

create index if not exists login_lock_resets_azienda_idx
  on public.login_lock_resets (company_id, reset_at desc);

alter table public.login_lock_resets enable row level security;

revoke all on public.login_lock_resets from public, anon, authenticated;

create or replace function public.stato_blocco_accesso(p_email text, p_ip inet)
returns table (
  bloccato        boolean,
  tentativi       integer,
  max_tentativi   integer,
  finestra_minuti integer,
  sbloccato_il    timestamptz,
  company_id      uuid,
  user_id         uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_utente        uuid;
  v_azienda       uuid;
  v_max           integer;
  v_minuti        integer;
  v_finestra      interval;
  v_inizio        timestamptz;
  v_ultimo_ok     timestamptz;
  v_ultimo_reset  timestamptz;
  v_conteggio     integer;
  v_scadenza      timestamptz;
begin
  select pr.id, pr.company_id into v_utente, v_azienda
    from public.profiles pr
   where pr.email = p_email
   limit 1;

  if v_azienda is null or p_ip is null then
    return query select false, 0, 0, 0, null::timestamptz, v_azienda, v_utente;
    return;
  end if;

  select coalesce(c.max_failed_attempts, 5),
         coalesce(c.lockout_duration_minutes, 30)
    into v_max, v_minuti
    from public.companies c
   where c.id = v_azienda;

  v_finestra := make_interval(mins => case when v_minuti > 0 then v_minuti else 24 * 60 end);
  v_inizio   := now() - v_finestra;

  select max(la.created_at) into v_ultimo_ok
    from public.login_attempts la
   where la.email = p_email
     and la.ip_address = p_ip
     and la.success
     and la.created_at > v_inizio;

  select max(r.reset_at) into v_ultimo_reset
    from public.login_lock_resets r
   where r.email = p_email
     and r.ip_address = p_ip
     and r.reset_at > v_inizio;

  v_inizio := greatest(v_inizio, coalesce(v_ultimo_ok, v_inizio), coalesce(v_ultimo_reset, v_inizio));

  select count(*) into v_conteggio
    from public.login_attempts la
   where la.email = p_email
     and la.ip_address = p_ip
     and not la.success
     and la.failure_reason = 'invalid_credentials'
     and la.created_at > v_inizio;

  if v_conteggio >= v_max then
    select la.created_at + v_finestra into v_scadenza
      from public.login_attempts la
     where la.email = p_email
       and la.ip_address = p_ip
       and not la.success
       and la.failure_reason = 'invalid_credentials'
       and la.created_at > v_inizio
     order by la.created_at desc
     offset (v_max - 1) limit 1;
  end if;

  return query select v_conteggio >= v_max, v_conteggio, v_max,
                      (extract(epoch from v_finestra)::integer / 60),
                      v_scadenza, v_azienda, v_utente;
end;
$$;

comment on function public.stato_blocco_accesso(text, inet) is
  'Dice se la coppia (email, IP) e bloccata dall anti-forza-bruta, quanti tentativi ha a carico e quando si riapre. Unico posto dove il blocco si calcola.';

revoke all on function public.stato_blocco_accesso(text, inet) from public, anon, authenticated;
grant execute on function public.stato_blocco_accesso(text, inet) to service_role;

create or replace function public.accessi_bloccati()
returns table (
  email            text,
  ip_address       text,
  nome             text,
  user_id          uuid,
  tentativi        integer,
  max_tentativi    integer,
  sbloccato_il     timestamptz,
  ultimo_tentativo timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_azienda uuid;
begin
  select pr.company_id into v_azienda
    from public.profiles pr
   where pr.id = auth.uid();

  if v_azienda is null then
    return;
  end if;

  if not (public.has_role(auth.uid(), 'company_admin'::app_role)
          or public.is_super_admin(auth.uid())) then
    return;
  end if;

  return query
  with coppie as (
    select la.email as e, la.ip_address as ip, max(la.created_at) as ultimo
      from public.login_attempts la
      join public.profiles pr on pr.email = la.email
     where pr.company_id = v_azienda
       and not la.success
       and la.failure_reason = 'invalid_credentials'
       and la.created_at > now() - interval '24 hours'
       and la.ip_address is not null
     group by la.email, la.ip_address
  )
  select c.e,
         host(c.ip),
         nullif(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''),
         pr.id,
         s.tentativi,
         s.max_tentativi,
         s.sbloccato_il,
         c.ultimo
    from coppie c
    cross join lateral public.stato_blocco_accesso(c.e, c.ip) s
    left join public.profiles pr on pr.email = c.e and pr.company_id = v_azienda
   where s.bloccato
   order by c.ultimo desc;
end;
$$;

comment on function public.accessi_bloccati() is
  'Elenco delle coppie (email, IP) bloccate adesso nell azienda di chi chiama. Solo company_admin e super_admin: a chiunque altro risponde vuoto.';

revoke all on function public.accessi_bloccati() from public, anon;
grant execute on function public.accessi_bloccati() to authenticated, service_role;

create or replace function public.sblocca_accesso(p_email text, p_ip text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_mia_azienda uuid;
  v_utente      uuid;
  v_sua_azienda uuid;
  v_ip          inet;
begin
  if p_email is null or p_ip is null then
    raise exception 'Serve l email e l indirizzo da sbloccare.';
  end if;

  begin
    v_ip := p_ip::inet;
  exception when others then
    raise exception 'Indirizzo non valido.';
  end;

  select pr.company_id into v_mia_azienda
    from public.profiles pr
   where pr.id = auth.uid();

  if v_mia_azienda is null then
    raise exception 'Non riesco a capire di quale azienda fai parte.';
  end if;

  if not (public.has_role(auth.uid(), 'company_admin'::app_role)
          or public.is_super_admin(auth.uid())) then
    raise exception 'Solo un amministratore puo sbloccare un accesso.';
  end if;

  select pr.id, pr.company_id into v_utente, v_sua_azienda
    from public.profiles pr
   where pr.email = p_email
   limit 1;

  if v_sua_azienda is null or v_sua_azienda <> v_mia_azienda then
    raise exception 'Questo accesso non e di un utente della tua azienda.';
  end if;

  insert into public.login_lock_resets (company_id, email, ip_address, reset_by)
  values (v_mia_azienda, p_email, v_ip, auth.uid());

  insert into public.user_audit_log (actor_id, company_id, action, target_user_id, details, ip_address)
  values (auth.uid(), v_mia_azienda, 'account_unlocked', v_utente,
          jsonb_build_object('email', p_email, 'ip_address', host(v_ip)), v_ip);

  return true;
end;
$$;

comment on function public.sblocca_accesso(text, text) is
  'Azzera il blocco per troppi tentativi su una coppia (email, IP) della propria azienda. Non cancella i tentativi: scrive un punto di ripartenza in login_lock_resets.';

revoke all on function public.sblocca_accesso(text, text) from public, anon;
grant execute on function public.sblocca_accesso(text, text) to authenticated, service_role;