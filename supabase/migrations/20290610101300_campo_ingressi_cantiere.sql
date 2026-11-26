-- Controllo ingressi in cantiere col QR del tesserino (26/11/2026, piano campo completo, punto 2.4).
--
-- Il capocantiere (o il caposquadra, o l'ufficio) inquadra dall'app il QR del tesserino: oltre alla verifica
-- pubblica (in forza, formazione, idoneità, documenti: verifica_tesserino) dice se la persona è ASSEGNATA a
-- questo cantiere, e registra l'ingresso del giorno (registro ingressi). Stesse regole di chi può segnare il
-- fermo. Il registro lo leggono l'amministratore e chi l'ha registrato.

create table if not exists public.campo_ingressi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  giorno date not null,
  hr_profilo_id uuid references public.hr_profili(id) on delete set null,
  nome text not null,
  esito text not null check (esito in ('valido', 'da_verificare', 'non_valido')),
  assegnato boolean not null,
  registrato_da uuid references auth.users(id) on delete set null,
  registrato_il timestamptz not null default now()
);
create index if not exists campo_ingressi_ordine on public.campo_ingressi (order_id, giorno desc);
alter table public.campo_ingressi enable row level security;
revoke all on public.campo_ingressi from public, anon, authenticated;
drop policy if exists campo_ingressi_lettura on public.campo_ingressi;
create policy campo_ingressi_lettura on public.campo_ingressi for select to authenticated
  using (public.e_amministratore_di(company_id) or registrato_da = (select auth.uid()));
grant select on public.campo_ingressi to authenticated;

create or replace function public.campo_ingresso_verifica(p_token uuid, p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_verifica jsonb;
  v_profilo record;
  v_assegnato boolean;
begin
  if v_uid is null or public.utente_bloccato() then
    raise exception 'Sessione non autorizzata.' using errcode = '42501';
  end if;
  select o.company_id into v_company from public.orders o where o.id = p_order_id and o.deleted_at is null;
  if v_company is null or v_company is distinct from public.get_my_company_id() then
    raise exception 'Cantiere non trovato.' using errcode = '42501';
  end if;
  if not (public.e_amministratore_di(v_company)
          or (public.campo_e_ufficio(v_company)
              and not exists (select 1 from public.user_roles ur where ur.user_id = v_uid and ur.role in ('employee', 'subcontractor')))
          or exists (select 1 from public.order_campo_assignments a where a.order_id = p_order_id and a.user_id = v_uid and a.is_capocantiere)
          or exists (select 1 from public.squadre_commesse sc where sc.order_id = p_order_id and sc.squadra_id in (select public.campo_mie_squadre_capo()))) then
    raise exception 'Il controllo ingressi lo fa il capocantiere, il caposquadra o l''ufficio.' using errcode = '42501';
  end if;
  v_verifica := public.verifica_tesserino(p_token);
  if v_verifica is null then
    return jsonb_build_object('trovato', false);
  end if;
  select hp.id, hp.user_id, hp.company_id, trim(coalesce(hp.nome, '') || ' ' || coalesce(hp.cognome, '')) as nome into v_profilo
    from public.tesserini_codici t join public.hr_profili hp on hp.id = t.hr_profilo_id where t.token = p_token;
  v_assegnato := v_profilo.company_id = v_company and v_profilo.user_id is not null
    and exists (select 1 from public.order_campo_assignments a where a.order_id = p_order_id and a.user_id = v_profilo.user_id);
  insert into public.campo_ingressi (company_id, order_id, giorno, hr_profilo_id, nome, esito, assegnato, registrato_da)
  values (v_company, p_order_id, (now() at time zone 'Europe/Rome')::date, v_profilo.id, coalesce(nullif(v_profilo.nome, ''), 'Persona'),
          coalesce(v_verifica->>'esito', 'non_valido'), coalesce(v_assegnato, false), v_uid);
  return v_verifica || jsonb_build_object('trovato', true, 'assegnato', coalesce(v_assegnato, false),
                                          'altra_azienda', v_profilo.company_id is distinct from v_company);
end;
$function$;

revoke all on function public.campo_ingresso_verifica(uuid, uuid) from public, anon;
grant execute on function public.campo_ingresso_verifica(uuid, uuid) to authenticated;
