-- Fermo cantiere per maltempo (26/11/2026, piano campo completo, punto 2.6).
--
-- Quando piove o nevica e il cantiere si ferma, il capocantiere o il caposquadra lo segna dall'app: il giorno,
-- la causa, le ore perse per ogni persona e il meteo di quel giorno come prova. In ufficio l'elenco si esporta
-- per la domanda di cassa integrazione (CIGO). Uno per cantiere, giorno e causa: risegnarlo lo corregge.
-- Può segnarlo chi vede la squadra in app (stesse regole di campo_squadra_oggi): capocantiere, caposquadra,
-- ufficio. La lettura è dell'amministratore e di chi l'ha segnato.

create table if not exists public.campo_fermi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  giorno date not null,
  causa text not null check (causa in ('maltempo', 'altro')),
  persone jsonb not null default '[]'::jsonb,
  ore_perse numeric not null default 0 check (ore_perse >= 0 and ore_perse <= 2400),
  meteo jsonb,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, giorno, causa)
);
alter table public.campo_fermi enable row level security;
revoke all on public.campo_fermi from public, anon, authenticated;
drop policy if exists campo_fermi_lettura on public.campo_fermi;
create policy campo_fermi_lettura on public.campo_fermi for select to authenticated
  using (public.e_amministratore_di(company_id) or created_by = (select auth.uid()));
grant select on public.campo_fermi to authenticated;

create or replace function public.campo_fermo_registra(
  p_order_id uuid, p_giorno date, p_causa text, p_persone jsonb, p_meteo jsonb, p_note text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_ore numeric;
  v_id uuid;
begin
  if v_uid is null or public.utente_bloccato() then
    raise exception 'Sessione non autorizzata.' using errcode = '42501';
  end if;
  select o.company_id into v_company from public.orders o where o.id = p_order_id and o.deleted_at is null;
  if v_company is null or v_company is distinct from public.get_my_company_id() then
    raise exception 'Cantiere non trovato.' using errcode = '42501';
  end if;
  -- Chi coordina il cantiere: amministratore, ufficio (non operaio), capocantiere, caposquadra di una squadra lì.
  if not (public.e_amministratore_di(v_company)
          or (public.campo_e_ufficio(v_company)
              and not exists (select 1 from public.user_roles ur where ur.user_id = v_uid and ur.role in ('employee', 'subcontractor')))
          or exists (select 1 from public.order_campo_assignments a where a.order_id = p_order_id and a.user_id = v_uid and a.is_capocantiere)
          or exists (select 1 from public.squadre_commesse sc where sc.order_id = p_order_id and sc.squadra_id in (select public.campo_mie_squadre_capo()))) then
    raise exception 'Il fermo lo segna il capocantiere, il caposquadra o l''ufficio.' using errcode = '42501';
  end if;
  if p_giorno is null or p_giorno > (now() at time zone 'Europe/Rome')::date or p_giorno < (now() at time zone 'Europe/Rome')::date - 30 then
    raise exception 'Il giorno va da un mese fa a oggi.' using errcode = '22023';
  end if;
  if p_causa not in ('maltempo', 'altro') then
    raise exception 'Causa non valida.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_persone, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_persone, '[]'::jsonb)) > 200 then
    raise exception 'Elenco delle persone non valido.' using errcode = '22023';
  end if;
  select coalesce(sum(least(greatest(coalesce((x->>'ore')::numeric, 0), 0), 24)), 0) into v_ore
    from jsonb_array_elements(coalesce(p_persone, '[]'::jsonb)) x;
  insert into public.campo_fermi (company_id, order_id, giorno, causa, persone, ore_perse, meteo, note, created_by)
  values (v_company, p_order_id, p_giorno, p_causa, coalesce(p_persone, '[]'::jsonb), v_ore, p_meteo,
          nullif(left(btrim(coalesce(p_note, '')), 1000), ''), v_uid)
  on conflict (order_id, giorno, causa) do update
    set persone = excluded.persone, ore_perse = excluded.ore_perse, meteo = coalesce(excluded.meteo, campo_fermi.meteo),
        note = excluded.note, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.campo_fermo_registra(uuid, date, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.campo_fermo_registra(uuid, date, text, jsonb, jsonb, text) to authenticated;
