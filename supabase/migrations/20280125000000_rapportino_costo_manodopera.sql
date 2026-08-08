-- ============================================================================
-- Rapportino approvato → costo manodopera commessa — GIÀ APPLICATA sul live
-- (08/08/2026 via Management API, testata E2E andata+storno su Demo Azienda 2:
--  8h × 28,50€ = 228,00€ su order_employees con phase_id, revoca → 0).
-- ============================================================================
alter table public.employees add column if not exists costo_orario numeric(8,2);

-- ============================================================================
-- Rapportino approvato → costo manodopera sulla commessa
-- ============================================================================
-- Distinzione voluta dal titolare: il DIPENDENTE costa a ore (costo_orario ×
-- ore del rapportino), il SUBAPPALTATORE costa a contratto/SAL — le sue ore
-- non generano un secondo costo. Trigger sul DB così vale per OGNI strada di
-- approvazione: UI commessa, Silvio (approva_rapportini), WhatsApp.

-- 1) Identità: l'autore del rapportino (auth user) ↔ il dipendente
alter table public.employees add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists uq_employees_company_user
  on public.employees(company_id, user_id) where user_id is not null;

-- Backfill prudente via email: solo quando il match è UNIVOCO
-- (una sola scheda dipendente per email nell'azienda, un solo profilo per email)
update public.employees e
set user_id = m.profile_id
from (
  select e2.id as employee_id, min(p.id::text)::uuid as profile_id
  from public.employees e2
  join public.profiles p on lower(p.email) = lower(e2.email)
  where e2.email is not null and e2.user_id is null
  group by e2.id
  having count(distinct p.id) = 1
) m
where e.id = m.employee_id
  and not exists (
    select 1 from public.employees e3
    where e3.company_id = e.company_id and e3.user_id = m.profile_id and e3.id <> e.id
  )
  and (
    select count(*) from public.employees e4
    where e4.company_id = e.company_id and lower(e4.email) = lower(e.email)
  ) = 1;

-- 2) Traccia sul rapportino di cosa è stato registrato (per idempotenza e storno)
alter table public.campo_rapportini add column if not exists costo_manodopera numeric(12,2);
alter table public.campo_rapportini add column if not exists costo_registrato_at timestamptz;

-- 3) Trigger: approvazione → costo; revoca dell'approvazione → storno
create or replace function public.fn_rapportino_costo_manodopera()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_emp record;
  v_ore numeric;
  v_costo numeric;
  v_fase uuid;
  v_row_id uuid;
begin
  -- ── APPROVAZIONE ─────────────────────────────────────────────────────────
  if new.stato = 'approvato' and old.stato is distinct from 'approvato'
     and new.costo_registrato_at is null then

    select id, costo_orario into v_emp
      from employees
     where company_id = new.company_id and user_id = new.user_id
     limit 1;

    if v_emp.id is null then
      -- Subappaltatore (o autore non mappato): il suo costo vive nel
      -- contratto/SAL subappalto, qui si marca solo che non c'è nulla da
      -- registrare — niente doppio conteggio.
      new.costo_manodopera := 0;
      new.costo_registrato_at := now();
      return new;
    end if;

    v_ore := coalesce(new.ore_lavorate, 0) + coalesce(new.ore_straordinario, 0);
    v_costo := round(v_ore * coalesce(v_emp.costo_orario, 0), 2);

    -- Fase: attribuzione solo se il rapportino ne dichiara UNA (le ore sono
    -- del giorno intero, spalmarle a caso su più fasi sarebbe inventare)
    if jsonb_typeof(new.fasi_lavorate) = 'array'
       and jsonb_array_length(new.fasi_lavorate) = 1 then
      v_fase := (new.fasi_lavorate->0->>'phase_id')::uuid;
    end if;

    if v_costo > 0 then
      select id into v_row_id
        from order_employees
       where order_id = new.order_id
         and employee_id = v_emp.id
         and phase_id is not distinct from v_fase
       limit 1;

      if v_row_id is not null then
        update order_employees
           set hours_worked = hours_worked + v_ore,
               total_cost   = total_cost + v_costo
         where id = v_row_id;
      else
        insert into order_employees (order_id, employee_id, phase_id, hourly_rate, hours_worked, total_cost)
        values (new.order_id, v_emp.id, v_fase, coalesce(v_emp.costo_orario, 0), v_ore, v_costo);
      end if;
    end if;

    new.costo_manodopera := v_costo;
    new.costo_registrato_at := now();
    return new;
  end if;

  -- ── REVOCA (approvato → altro stato) ─────────────────────────────────────
  if old.stato = 'approvato' and new.stato is distinct from 'approvato'
     and old.costo_registrato_at is not null and coalesce(old.costo_manodopera, 0) > 0 then

    select id, costo_orario into v_emp
      from employees
     where company_id = new.company_id and user_id = new.user_id
     limit 1;

    if v_emp.id is not null then
      v_ore := coalesce(new.ore_lavorate, 0) + coalesce(new.ore_straordinario, 0);
      if jsonb_typeof(new.fasi_lavorate) = 'array'
         and jsonb_array_length(new.fasi_lavorate) = 1 then
        v_fase := (new.fasi_lavorate->0->>'phase_id')::uuid;
      end if;

      update order_employees
         set hours_worked = greatest(0, hours_worked - v_ore),
             total_cost   = greatest(0, total_cost - old.costo_manodopera)
       where id = (
         select id from order_employees
          where order_id = new.order_id
            and employee_id = v_emp.id
            and phase_id is not distinct from v_fase
          limit 1
       );
    end if;

    new.costo_manodopera := null;
    new.costo_registrato_at := null;
    return new;
  end if;

  return new;
end $$;

drop trigger if exists trg_rapportino_costo_manodopera on public.campo_rapportini;
create trigger trg_rapportino_costo_manodopera
  before update on public.campo_rapportini
  for each row execute function public.fn_rapportino_costo_manodopera();

-- Auto-aggancio account→dipendente: quando la scheda ha un'email che combacia
-- in modo UNIVOCO con un profilo, user_id si collega da solo (niente UI
-- obbligatoria per il titolare). Vale per schede nuove e modifiche email.
create or replace function public.fn_employees_autolink_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pid uuid;
begin
  if new.user_id is not null or new.email is null or trim(new.email) = '' then
    return new;
  end if;
  select min(p.id::text)::uuid into v_pid
    from profiles p where lower(p.email) = lower(new.email)
    having count(distinct p.id) = 1;
  if v_pid is null then return new; end if;
  if exists (select 1 from employees e where e.company_id = new.company_id and e.user_id = v_pid and e.id is distinct from new.id) then
    return new;
  end if;
  new.user_id := v_pid;
  return new;
end $$;

drop trigger if exists trg_employees_autolink_user on public.employees;
create trigger trg_employees_autolink_user
  before insert or update of email on public.employees
  for each row execute function public.fn_employees_autolink_user();

select
  (select count(*) from employees where user_id is not null) as agganciati,
