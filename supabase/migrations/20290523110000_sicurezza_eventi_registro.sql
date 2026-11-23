-- Registro infortuni, quasi-incidenti e situazioni pericolose (richiesta del founder, 23/11/2026).
--
-- Prima dal telefono c'era solo «Segnala un problema», che finisce nei ticket dell'assistenza clienti: un infortunio
-- si mescolava alle richieste dei clienti e nessuno ne teneva lo storico. Qui l'operaio segnala dal campo, chi
-- segue la sicurezza (titolare e chi ha «Sicurezza cantiere») riceve subito un avviso, prende in carico e chiude
-- con le azioni correttive. Le righe non si cancellano: è un registro.
--
-- Chi vede cosa:
-- - chi segnala vede le proprie segnalazioni;
-- - l'ufficio con «Sicurezza cantiere» vede e gestisce tutte quelle dell'azienda;
-- - nessuno cancella (nemmeno l'ufficio).
-- Le foto stanno nel bucket privato «sicurezza-eventi», percorso <azienda>/<evento>/<file>.

create table if not exists public.sicurezza_eventi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  segnalato_da uuid not null default auth.uid() references auth.users(id),
  tipo text not null check (tipo in ('infortunio', 'quasi_incidente', 'pericolo')),
  accaduto_il timestamptz not null default now(),
  luogo text check (luogo is null or length(luogo) <= 300),
  descrizione text not null check (length(btrim(descrizione)) between 3 and 4000),
  ferito boolean not null default false,
  persona_coinvolta text check (persona_coinvolta is null or length(persona_coinvolta) <= 200),
  parte_corpo text check (parte_corpo is null or length(parte_corpo) <= 200),
  soccorso text not null default 'nessuno' check (soccorso in ('nessuno', 'primo_soccorso', 'pronto_soccorso', 'ambulanza')),
  testimoni text check (testimoni is null or length(testimoni) <= 500),
  foto text[] not null default '{}' check (cardinality(foto) <= 6),
  stato text not null default 'nuova' check (stato in ('nuova', 'presa_in_carico', 'chiusa')),
  gestita_da uuid references auth.users(id),
  presa_in_carico_il timestamptz,
  azioni_correttive text check (azioni_correttive is null or length(azioni_correttive) <= 4000),
  note_ufficio text check (note_ufficio is null or length(note_ufficio) <= 4000),
  chiusa_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sicurezza_eventi_azienda_idx on public.sicurezza_eventi (company_id, created_at desc);
create index if not exists sicurezza_eventi_segnalatore_idx on public.sicurezza_eventi (segnalato_da, created_at desc);
create index if not exists sicurezza_eventi_commessa_idx on public.sicurezza_eventi (order_id) where order_id is not null;

alter table public.sicurezza_eventi enable row level security;

-- Alla nascita: chi segnala è chi ha fatto l'accesso, la gestione parte vuota, le foto stanno nella cartella giusta.
create or replace function private.sicurezza_evento_prepara()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.segnalato_da := auth.uid();
  end if;
  new.stato := 'nuova';
  new.gestita_da := null;
  new.presa_in_carico_il := null;
  new.chiusa_il := null;
  new.azioni_correttive := null;
  new.note_ufficio := null;
  new.created_at := now();
  if new.accaduto_il > now() + interval '10 minutes' then
    new.accaduto_il := now();
  end if;
  if exists (
    select 1 from unnest(new.foto) f
    where f !~ ('^' || new.company_id::text || '/' || new.id::text || '/[A-Za-z0-9._-]+$')
  ) then
    raise exception using errcode = '22023', message = 'Foto non valida.';
  end if;
  if new.order_id is not null and not exists (
    select 1 from public.orders o where o.id = new.order_id and o.company_id = new.company_id
  ) then
    raise exception using errcode = '22023', message = 'Cantiere non valido.';
  end if;
  return new;
end;
$$;

-- In gestione: chi segnala e cosa ha scritto non cambiano; date di presa in carico e chiusura le mette il database.
create or replace function private.sicurezza_evento_gestisci()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.id := old.id;
  new.company_id := old.company_id;
  new.segnalato_da := old.segnalato_da;
  new.created_at := old.created_at;
  new.foto := old.foto;
  new.updated_at := now();
  if new.stato is distinct from old.stato then
    if new.stato in ('presa_in_carico', 'chiusa') and old.stato = 'nuova' then
      new.gestita_da := coalesce(auth.uid(), new.gestita_da);
      new.presa_in_carico_il := now();
    end if;
    new.chiusa_il := case when new.stato = 'chiusa' then now() else null end;
  else
    new.chiusa_il := old.chiusa_il;
    new.presa_in_carico_il := old.presa_in_carico_il;
  end if;
  return new;
end;
$$;

-- Avviso subito a chi segue la sicurezza: campanella e notifica sul telefono (trg_notifica_push).
create or replace function private.sicurezza_evento_avvisa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chi text;
  v_cantiere text;
  v_titolo text;
begin
  select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
    into v_chi from public.profiles p where p.id = new.segnalato_da;
  select o.order_code into v_cantiere from public.orders o where o.id = new.order_id;

  v_titolo := case new.tipo
      when 'infortunio' then 'URGENTE · Infortunio segnalato'
      when 'quasi_incidente' then 'Quasi-incidente segnalato'
      else 'Situazione pericolosa segnalata'
    end || coalesce(' · ' || v_cantiere, '');

  insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  select new.company_id, destinatari.user_id, 'sicurezza_evento', v_titolo,
         left(coalesce(v_chi || ': ', '') || btrim(new.descrizione), 300),
         'sicurezza_evento', new.id, '/azienda/sicurezza-cantiere?tab=eventi'
    from (
      select p.id as user_id
        from public.profiles p
        join public.user_roles ur on ur.user_id = p.id and ur.role = 'company_admin'
       where p.company_id = new.company_id
      union
      select sp.user_id
        from public.staff_permissions sp
       where sp.company_id = new.company_id and sp.can_view_sicurezza_cantiere
    ) destinatari
   where destinatari.user_id is distinct from new.segnalato_da;
  return new;
end;
$$;

revoke all on function private.sicurezza_evento_prepara() from public, anon, authenticated;
revoke all on function private.sicurezza_evento_gestisci() from public, anon, authenticated;
revoke all on function private.sicurezza_evento_avvisa() from public, anon, authenticated;

drop trigger if exists trg_sicurezza_evento_prepara on public.sicurezza_eventi;
create trigger trg_sicurezza_evento_prepara before insert on public.sicurezza_eventi
  for each row execute function private.sicurezza_evento_prepara();
drop trigger if exists trg_sicurezza_evento_gestisci on public.sicurezza_eventi;
create trigger trg_sicurezza_evento_gestisci before update on public.sicurezza_eventi
  for each row execute function private.sicurezza_evento_gestisci();
drop trigger if exists trg_sicurezza_evento_avvisa on public.sicurezza_eventi;
create trigger trg_sicurezza_evento_avvisa after insert on public.sicurezza_eventi
  for each row execute function private.sicurezza_evento_avvisa();

drop policy if exists blocco_utente_bloccato on public.sicurezza_eventi;
create policy blocco_utente_bloccato on public.sicurezza_eventi as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

drop policy if exists sicurezza_eventi_segnala on public.sicurezza_eventi;
create policy sicurezza_eventi_segnala on public.sicurezza_eventi for insert to authenticated
  with check (
    company_id = (select public.get_effective_company_id())
    and segnalato_da = (select auth.uid())
    and not (select public.utente_e_cliente_esterno())
  );

drop policy if exists sicurezza_eventi_lettura on public.sicurezza_eventi;
create policy sicurezza_eventi_lettura on public.sicurezza_eventi for select to authenticated
  using (
    segnalato_da = (select auth.uid())
    or public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id)
  );

drop policy if exists sicurezza_eventi_gestione on public.sicurezza_eventi;
create policy sicurezza_eventi_gestione on public.sicurezza_eventi for update to authenticated
  using (
    public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id)
    and not public.utente_sola_lettura(company_id)
  )
  with check (
    public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id)
    and not public.utente_sola_lettura(company_id)
  );

revoke all on public.sicurezza_eventi from anon;
revoke delete, truncate on public.sicurezza_eventi from authenticated;
grant select, insert, update on public.sicurezza_eventi to authenticated;

-- Foto: cartella privata. Carica chi è dell'azienda; legge chi ha caricato e chi segue la sicurezza; nessuno sostituisce
-- o cancella dal browser.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sicurezza-eventi', 'sicurezza-eventi', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists sicurezza_eventi_foto_carica on storage.objects;
create policy sicurezza_eventi_foto_carica on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sicurezza-eventi'
    and (storage.foldername(name))[1] = (select public.get_effective_company_id())::text
    and not (select public.utente_bloccato())
    and not (select public.utente_e_cliente_esterno())
  );

drop policy if exists sicurezza_eventi_foto_leggi on storage.objects;
create policy sicurezza_eventi_foto_leggi on storage.objects for select to authenticated
  using (
    bucket_id = 'sicurezza-eventi'
    and not (select public.utente_bloccato())
    and (
      owner_id = (select auth.uid())::text
      or case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere',
                  ((storage.foldername(name))[1])::uuid)
           else false end
    )
  );

drop policy if exists sicurezza_eventi_foto_immutabili on storage.objects;
create policy sicurezza_eventi_foto_immutabili on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'sicurezza-eventi');
drop policy if exists sicurezza_eventi_foto_conserva on storage.objects;
create policy sicurezza_eventi_foto_conserva on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'sicurezza-eventi');
drop policy if exists sicurezza_eventi_foto_anon on storage.objects;
create policy sicurezza_eventi_foto_anon on storage.objects as restrictive for all to anon
  using (bucket_id <> 'sicurezza-eventi') with check (bucket_id <> 'sicurezza-eventi');
