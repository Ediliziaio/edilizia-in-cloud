create table if not exists public.hr_impostazioni_benefit (
  company_id uuid primary key references public.companies(id) on delete cascade,
  buono_pasto_attivo boolean not null default true,
  buono_pasto_modalita text not null default 'entrambi'
    check (buono_pasto_modalita in ('fisso','ricevuta','entrambi')),
  buono_pasto_valore numeric(8,2) not null default 8.00,
  buono_pasto_soglia_ore numeric(4,1) not null default 6.0,
  km_tariffa_eur numeric(6,3) not null default 0.350,
  updated_at timestamptz not null default now()
);
alter table public.hr_impostazioni_benefit enable row level security;

drop policy if exists hib_select on public.hr_impostazioni_benefit;
create policy hib_select on public.hr_impostazioni_benefit for select to authenticated
  using (company_id in (select p.company_id from public.profiles p where p.id = auth.uid()));
drop policy if exists hib_write on public.hr_impostazioni_benefit;
create policy hib_write on public.hr_impostazioni_benefit for all to authenticated
  using (public.e_amministratore_di(company_id))
  with check (public.e_amministratore_di(company_id));

create or replace function public.impostazioni_benefit(p_company uuid)
returns table (
  buono_pasto_attivo boolean, buono_pasto_modalita text,
  buono_pasto_valore numeric, buono_pasto_soglia_ore numeric, km_tariffa_eur numeric
)
language sql stable security definer set search_path to 'public' as $$
  select coalesce(b.buono_pasto_attivo, true),
         coalesce(b.buono_pasto_modalita, 'entrambi'),
         coalesce(b.buono_pasto_valore, 8.00),
         coalesce(b.buono_pasto_soglia_ore, 6.0),
         coalesce(b.km_tariffa_eur, 0.350)
    from (select 1) x
    left join public.hr_impostazioni_benefit b on b.company_id = p_company;
$$;
revoke all on function public.impostazioni_benefit(uuid) from public, anon;
grant execute on function public.impostazioni_benefit(uuid) to authenticated, service_role;

create table if not exists public.hr_buoni_pasto (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profilo_id uuid not null references public.hr_profili(id) on delete cascade,
  giorno date not null,
  order_id uuid references public.orders(id) on delete set null,
  tipo text not null check (tipo in ('fisso','ricevuta')),
  importo numeric(8,2) not null default 0,
  esercente text,
  foto_url text,
  ocr_dati jsonb,
  stato text not null default 'maturato'
    check (stato in ('maturato','da_erogare','erogato','annullato')),
  rapportino_id uuid references public.campo_rapportini(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_buono_pasto_fisso
  on public.hr_buoni_pasto(profilo_id, giorno) where tipo = 'fisso';
create index if not exists idx_buoni_pasto_azienda_giorno
  on public.hr_buoni_pasto(company_id, giorno);
create index if not exists idx_buoni_pasto_profilo
  on public.hr_buoni_pasto(profilo_id, giorno);

alter table public.hr_buoni_pasto enable row level security;

drop policy if exists hbp_select on public.hr_buoni_pasto;
create policy hbp_select on public.hr_buoni_pasto for select to authenticated
  using (public.e_amministratore_di(company_id)
      or profilo_id = public.hr_profilo_da_user(auth.uid(), company_id));
drop policy if exists hbp_insert_ricevuta on public.hr_buoni_pasto;
create policy hbp_insert_ricevuta on public.hr_buoni_pasto for insert to authenticated
  with check (tipo = 'ricevuta'
              and profilo_id = public.hr_profilo_da_user(auth.uid(), company_id));
drop policy if exists hbp_admin_all on public.hr_buoni_pasto;
create policy hbp_admin_all on public.hr_buoni_pasto for all to authenticated
  using (public.e_amministratore_di(company_id))
  with check (public.e_amministratore_di(company_id));

create or replace function public.matura_buono_pasto_da_giornata()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_company uuid;
  v_attivo boolean; v_modalita text; v_valore numeric; v_soglia numeric;
begin
  select company_id into v_company from public.hr_profili where id = new.profilo_id;
  if v_company is null then return new; end if;

  select buono_pasto_attivo, buono_pasto_modalita, buono_pasto_valore, buono_pasto_soglia_ore
    into v_attivo, v_modalita, v_valore, v_soglia
    from public.impostazioni_benefit(v_company);

  if not coalesce(v_attivo, true) or v_modalita = 'ricevuta' then
    delete from public.hr_buoni_pasto
     where profilo_id = new.profilo_id and giorno = new.data
       and tipo = 'fisso' and stato = 'maturato';
    return new;
  end if;

  if coalesce(new.ore_lavorate, 0) >= coalesce(v_soglia, 6.0) then
    if exists (select 1 from public.hr_buoni_pasto
                where profilo_id = new.profilo_id and giorno = new.data and tipo = 'fisso') then
      update public.hr_buoni_pasto
         set importo = v_valore, updated_at = now()
       where profilo_id = new.profilo_id and giorno = new.data
         and tipo = 'fisso' and stato = 'maturato';
    else
      insert into public.hr_buoni_pasto (company_id, profilo_id, giorno, tipo, importo, stato)
      values (v_company, new.profilo_id, new.data, 'fisso', v_valore, 'maturato');
    end if;
  else
    delete from public.hr_buoni_pasto
     where profilo_id = new.profilo_id and giorno = new.data
       and tipo = 'fisso' and stato = 'maturato';
  end if;
  return new;
end $$;

drop trigger if exists trg_matura_buono_pasto on public.hr_giornate;
create trigger trg_matura_buono_pasto
  after insert or update of ore_lavorate on public.hr_giornate
  for each row execute function public.matura_buono_pasto_da_giornata();

create or replace function public.set_hr_buoni_pasto_updated_at()
returns trigger language plpgsql set search_path to 'public' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_hr_buoni_pasto_updated on public.hr_buoni_pasto;
create trigger trg_hr_buoni_pasto_updated
  before update on public.hr_buoni_pasto
  for each row execute function public.set_hr_buoni_pasto_updated_at();
