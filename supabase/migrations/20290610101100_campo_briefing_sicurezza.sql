-- «5 minuti di sicurezza» del mattino con la squadra (26/11/2026, piano campo completo, punto 2.5).
--
-- Il capocantiere o il caposquadra sceglie l'argomento, spunta chi c'era e ognuno firma col dito sul suo
-- telefono. Resta la prova che la formazione breve è stata fatta (giorno, cantiere, argomento, presenti con la
-- firma e l'ora). Lo registra chi coordina il cantiere (stesse regole del fermo); lo legge l'amministratore e
-- chi l'ha registrato. Le firme sono PNG piccoli dentro la riga (al massimo 80 kB l'una, 60 persone).

create table if not exists public.campo_briefing_sicurezza (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  giorno date not null,
  argomento text not null check (length(argomento) between 3 and 200),
  note text,
  presenti jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists campo_briefing_sicurezza_ordine on public.campo_briefing_sicurezza (order_id, giorno desc);
alter table public.campo_briefing_sicurezza enable row level security;
revoke all on public.campo_briefing_sicurezza from public, anon, authenticated;
drop policy if exists campo_briefing_lettura on public.campo_briefing_sicurezza;
create policy campo_briefing_lettura on public.campo_briefing_sicurezza for select to authenticated
  using (public.e_amministratore_di(company_id) or created_by = (select auth.uid()));
grant select on public.campo_briefing_sicurezza to authenticated;

create or replace function public.campo_briefing_registra(p_order_id uuid, p_argomento text, p_note text, p_presenti jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_id uuid;
  v_p jsonb;
begin
  if v_uid is null or public.utente_bloccato() then
    raise exception 'Sessione non autorizzata.' using errcode = '42501';
  end if;
  select o.company_id into v_company from public.orders o where o.id = p_order_id and o.deleted_at is null;
  if v_company is null or v_company is distinct from public.get_my_company_id() then
    raise exception 'Cantiere non trovato.' using errcode = '42501';
  end if;
  if not (public.e_amministratore_di(v_company)
          or exists (select 1 from public.order_campo_assignments a where a.order_id = p_order_id and a.user_id = v_uid and a.is_capocantiere)
          or exists (select 1 from public.squadre_commesse sc where sc.order_id = p_order_id and sc.squadra_id in (select public.campo_mie_squadre_capo()))) then
    raise exception 'I 5 minuti di sicurezza li registra il capocantiere o il caposquadra.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_argomento, ''))) not between 3 and 200 then
    raise exception 'Scegli l''argomento.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_presenti, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_presenti) not between 1 and 60 then
    raise exception 'Segna chi c''era (da 1 a 60 persone).' using errcode = '22023';
  end if;
  for v_p in select * from jsonb_array_elements(p_presenti) loop
    if length(coalesce(v_p->>'nome', '')) not between 1 and 120
       or length(coalesce(v_p->>'firma', '')) > 110000
       or (v_p ? 'firma' and v_p->>'firma' !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$') then
      raise exception 'Firma o nome non validi.' using errcode = '22023';
    end if;
  end loop;
  insert into public.campo_briefing_sicurezza (company_id, order_id, giorno, argomento, note, presenti, created_by)
  values (v_company, p_order_id, (now() at time zone 'Europe/Rome')::date, btrim(p_argomento),
          nullif(left(btrim(coalesce(p_note, '')), 1000), ''), p_presenti, v_uid)
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.campo_briefing_registra(uuid, text, text, jsonb) from public, anon;
grant execute on function public.campo_briefing_registra(uuid, text, text, jsonb) to authenticated;
