-- see file 20290529100000_campo_spese_e_risposte.sql
create table if not exists public.campo_spese (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  order_id uuid references public.orders(id) on delete set null,
  giorno date not null default current_date,
  tipo text not null default 'altro'
    check (tipo in ('carburante', 'pedaggio', 'parcheggio', 'pasto', 'materiale', 'altro')),
  importo numeric(10,2) not null check (importo > 0 and importo < 100000),
  descrizione text check (descrizione is null or length(descrizione) <= 500),
  foto_path text,
  pagata_con text not null default 'soldi_miei' check (pagata_con in ('soldi_miei', 'carta_aziendale')),
  stato text not null default 'inviata' check (stato in ('inviata', 'approvata', 'rifiutata', 'rimborsata')),
  nota_ufficio text check (nota_ufficio is null or length(nota_ufficio) <= 500),
  deciso_da uuid,
  deciso_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campo_spese_company_stato_idx on public.campo_spese (company_id, stato, giorno desc);
create index if not exists campo_spese_user_idx on public.campo_spese (user_id, giorno desc);
alter table public.campo_spese enable row level security;
drop policy if exists campo_spese_mie_lettura on public.campo_spese;
create policy campo_spese_mie_lettura on public.campo_spese for select to authenticated
  using (user_id = (select auth.uid()) or (select public.e_amministratore_di(company_id)));
drop policy if exists campo_spese_mie_inserimento on public.campo_spese;
create policy campo_spese_mie_inserimento on public.campo_spese for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and company_id = (select public.get_my_company_id())
    and stato = 'inviata' and deciso_da is null and deciso_il is null and nota_ufficio is null
  );
drop policy if exists campo_spese_mie_cancellazione on public.campo_spese;
create policy campo_spese_mie_cancellazione on public.campo_spese for delete to authenticated
  using (user_id = (select auth.uid()) and stato = 'inviata');
drop policy if exists campo_spese_ufficio on public.campo_spese;
create policy campo_spese_ufficio on public.campo_spese for update to authenticated
  using ((select public.e_amministratore_di(company_id)))
  with check ((select public.e_amministratore_di(company_id)));
drop policy if exists blocco_utente_bloccato on public.campo_spese;
create policy blocco_utente_bloccato on public.campo_spese as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
grant select, insert, delete on public.campo_spese to authenticated;
grant update (stato, nota_ufficio, deciso_da, deciso_il, updated_at) on public.campo_spese to authenticated;
insert into storage.buckets (id, name, public)
values ('campo-spese', 'campo-spese', false)
on conflict (id) do nothing;
drop policy if exists campo_spese_foto_carica on storage.objects;
create policy campo_spese_foto_carica on storage.objects for insert to authenticated
  with check (
    bucket_id = 'campo-spese'
    and (storage.foldername(name))[1] = (select public.get_my_company_id())::text
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
drop policy if exists campo_spese_foto_leggi on storage.objects;
create policy campo_spese_foto_leggi on storage.objects for select to authenticated
  using (
    bucket_id = 'campo-spese'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or public.e_amministratore_di(nullif((storage.foldername(name))[1], '')::uuid)
    )
  );
create or replace function public.campo_spese_avvisi()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nome text;
  v_euro text;
begin
  v_euro := replace(to_char(new.importo, 'FM999G990D00'), ',', '.') || ' €';
  begin
    if tg_op = 'INSERT' then
      select coalesce(nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), 'Un operaio')
        into v_nome from public.profiles where id = new.user_id;
      perform public.create_notification(new.company_id, ur.user_id, 'campo_spesa',
        'Spesa da approvare · ' || coalesce(v_nome, 'Un operaio'),
        left(initcap(replace(new.tipo, '_', ' ')) || ' · ' || v_euro || coalesce(' · ' || new.descrizione, ''), 300),
        'campo_spesa', new.id, '/azienda/personale?tab=spese')
      from public.user_roles ur
      join public.profiles p on p.id = ur.user_id and p.company_id = new.company_id
      where ur.role = 'company_admin' and ur.user_id <> new.user_id;
    elsif new.stato is distinct from old.stato and new.stato in ('approvata', 'rifiutata', 'rimborsata') then
      perform public.create_notification(new.company_id, new.user_id, 'campo_spesa_esito',
        case new.stato when 'approvata' then 'Spesa approvata' when 'rimborsata' then 'Spesa rimborsata' else 'Spesa non approvata' end,
        left(initcap(replace(new.tipo, '_', ' ')) || ' · ' || v_euro || coalesce(' · ' || new.nota_ufficio, ''), 300),
        'campo_spesa', new.id, '/campo/spese');
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke all on function public.campo_spese_avvisi() from public, anon;
drop trigger if exists trg_campo_spese_avvisi on public.campo_spese;
create trigger trg_campo_spese_avvisi after insert or update of stato on public.campo_spese
  for each row execute function public.campo_spese_avvisi();
alter table public.tickets add column if not exists serve_entro date;
create or replace function public.campo_mie_segnalazioni()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', t.id, 'titolo', coalesce(t.titolo, t.subject), 'status', t.status,
               'category', t.category, 'merce_stato', t.merce_stato, 'serve_entro', t.serve_entro,
               'order_code', o.order_code, 'created_at', t.created_at) x
        from public.tickets t
        left join public.orders o on o.id = t.order_id
       where t.created_by = auth.uid() and t.fonte = 'campo'
         and t.created_at > now() - interval '45 days'
       order by t.created_at desc
       limit 20
    ) s;
$$;
revoke all on function public.campo_mie_segnalazioni() from public, anon;
grant execute on function public.campo_mie_segnalazioni() to authenticated;
create or replace function public.notify_hr_richiesta_esito()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid;
  v_tipo text;
  v_periodo text;
begin
  if new.stato is not distinct from old.stato or new.stato not in ('approvata', 'rifiutata') then
    return new;
  end if;
  v_user := coalesce(new.user_id, (select pr.user_id from public.hr_profili pr where pr.id = new.profilo_id));
  if v_user is null or v_user = auth.uid() then
    return new;
  end if;
  v_tipo := case new.tipo when 'ferie' then 'Richiesta di ferie' when 'permesso' then 'Richiesta di permesso'
                          when 'rol' then 'Richiesta di ROL' else 'Richiesta' end;
  if new.data_inizio is not null then
    v_periodo := to_char(new.data_inizio, 'DD/MM');
    if new.data_fine is not null and new.data_fine <> new.data_inizio then
      v_periodo := v_periodo || ' → ' || to_char(new.data_fine, 'DD/MM');
    end if;
  end if;
  begin
    perform public.create_notification(new.company_id, v_user, 'hr_richiesta_esito',
      v_tipo || case when new.stato = 'approvata' then ' approvata' else ' non approvata' end
        || coalesce(' · ' || v_periodo, ''),
      left(coalesce(nullif(btrim(new.note_risposta), ''),
        case when new.stato = 'approvata' then 'L''ufficio ha approvato la tua richiesta.' else 'L''ufficio non ha approvato la tua richiesta.' end), 300),
      'hr_richiesta', new.id, '/campo/ferie');
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke all on function public.notify_hr_richiesta_esito() from public, anon;
drop trigger if exists trg_notify_hr_richiesta_esito on public.hr_richieste;
create trigger trg_notify_hr_richiesta_esito after update of stato on public.hr_richieste
  for each row execute function public.notify_hr_richiesta_esito();
