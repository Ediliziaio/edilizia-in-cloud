-- Mezzi e attrezzature, seconda tornata (24/09/2026, richiesta di Florin).
--
--   · foto del mezzo (galleria, con una copertina) e foto delle segnalazioni;
--   · storico delle assegnazioni: chi aveva il mezzo e su quale cantiere, giorno
--     per giorno — quando arriva una multa si sa chi guidava;
--   · attrezzi caricati su un mezzo ("cosa c'è sul Ducato");
--   · valore di acquisto e rata di leasing/noleggio, per i costi del parco;
--   · segnalazioni dal telefono di chi ha il mezzo (/campo): km aggiornati,
--     guasti e danni con le foto, che arrivano in campanella all'ufficio.
--
-- L'operaio vede SOLO i mezzi che ha in carico (e gli attrezzi caricati sopra)
-- e i loro documenti, attraverso mezzi_in_carico(); può mandare segnalazioni e
-- foto. Tutto il resto resta ai permessi del Magazzino, come nella prima tornata.
--
-- Idempotente.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── Colonne nuove sul mezzo ─────────────────────────────────────────────────
alter table public.mezzi
  add column if not exists foto_path text,
  add column if not exists su_mezzo_id uuid references public.mezzi(id) on delete set null,
  add column if not exists valore_acquisto numeric(12,2),
  add column if not exists data_acquisto date,
  add column if not exists rata_mensile numeric(12,2);

alter table public.mezzi drop constraint if exists mezzi_su_se_stesso_chk;
alter table public.mezzi add constraint mezzi_su_se_stesso_chk check (su_mezzo_id is null or su_mezzo_id <> id);
create index if not exists idx_mezzi_su_mezzo on public.mezzi(su_mezzo_id) where su_mezzo_id is not null;

-- Un attrezzo si carica su un mezzo della stessa azienda, che a sua volta non
-- è caricato su un altro: un livello solo, niente giri.
create or replace function public.mezzi_controlla_carico()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_sopra record;
begin
  if new.su_mezzo_id is null then
    return new;
  end if;
  select company_id, su_mezzo_id into v_sopra from public.mezzi where id = new.su_mezzo_id;
  if v_sopra.company_id is distinct from new.company_id then
    raise exception 'Il mezzo su cui caricare non è di questa azienda' using errcode = '23514';
  end if;
  if v_sopra.su_mezzo_id is not null then
    raise exception 'Non si può caricare su un attrezzo che è già caricato su un altro mezzo' using errcode = '23514';
  end if;
  if exists (select 1 from public.mezzi where su_mezzo_id = new.id and deleted_at is null) then
    raise exception 'Su questo mezzo sono caricati degli attrezzi: non si può caricarlo su un altro' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.mezzi_controlla_carico() from public, anon, authenticated;

drop trigger if exists trg_mezzi_controlla_carico on public.mezzi;
create trigger trg_mezzi_controlla_carico before insert or update of su_mezzo_id on public.mezzi
  for each row execute function public.mezzi_controlla_carico();

-- ── Chi ha il mezzo in carico: io ───────────────────────────────────────────
-- I profili del personale dell'utente: quello collegato all'utente, oppure
-- quello collegato alla sua anagrafica dipendente (employees.user_id).
create or replace function public.miei_hr_profili()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select hp.id from public.hr_profili hp
   where hp.user_id = auth.uid()
      or hp.employee_id in (select e.id from public.employees e where e.user_id = auth.uid());
$$;
revoke all on function public.miei_hr_profili() from public, anon;
grant execute on function public.miei_hr_profili() to authenticated;

-- true se il mezzo è in carico all'utente, o è un attrezzo caricato su un mezzo
-- in carico all'utente. Citata dalle policy: security definer per non passare
-- dalla RLS di mezzi dentro la RLS di mezzi.
create or replace function public.mezzo_in_carico_a_me(p_mezzo_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.mezzi m
     where m.id = p_mezzo_id
       and m.deleted_at is null
       and (
         m.assegnato_hr_profilo_id in (select public.miei_hr_profili())
         or exists (
           select 1 from public.mezzi sopra
            where sopra.id = m.su_mezzo_id
              and sopra.deleted_at is null
              and sopra.assegnato_hr_profilo_id in (select public.miei_hr_profili())
         )
       )
  );
$$;
revoke all on function public.mezzo_in_carico_a_me(uuid) from public, anon;
grant execute on function public.mezzo_in_carico_a_me(uuid) to authenticated;

create index if not exists idx_mezzi_assegnato_hr on public.mezzi(assegnato_hr_profilo_id) where assegnato_hr_profilo_id is not null;

-- Quello che vede chi ha il mezzo in carico, dal telefono: il mezzo, i km e i
-- documenti (assicurazione e libretto da mostrare a un controllo). Niente
-- accesso diretto alle tabelle: valore d'acquisto, rata del leasing e fatture
-- dell'officina restano all'ufficio.
create or replace function public.mezzi_in_carico()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with miei as (select public.miei_hr_profili() as id),
  principali as (
    select m.id from public.mezzi m
     where m.deleted_at is null and m.assegnato_hr_profilo_id in (select id from miei)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'nome', m.nome, 'tipo', m.tipo, 'targa', m.targa,
           'marca', m.marca, 'modello', m.modello, 'stato', m.stato,
           'contatore', m.contatore, 'contatore_unita', m.contatore_unita,
           'contatore_aggiornato_il', m.contatore_aggiornato_il,
           'foto_path', m.foto_path, 'su_mezzo_id', m.su_mezzo_id,
           'documenti', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', d.id, 'categoria', d.categoria, 'titolo', d.titolo, 'ente', d.ente,
                      'data_scadenza', d.data_scadenza, 'alert_giorni_prima', d.alert_giorni_prima,
                      'file_path', d.file_path, 'file_name', d.file_name)
                    order by d.data_scadenza desc nulls last)
               from public.mezzi_documenti d where d.mezzo_id = m.id), '[]'::jsonb)
         ) order by m.su_mezzo_id nulls first, m.nome), '[]'::jsonb)
    from public.mezzi m
   where m.deleted_at is null
     and (m.id in (select id from principali) or m.su_mezzo_id in (select id from principali));
$$;
revoke all on function public.mezzi_in_carico() from public, anon;
grant execute on function public.mezzi_in_carico() to authenticated;

-- ── Storico delle assegnazioni ──────────────────────────────────────────────
create table if not exists public.mezzi_assegnazioni (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  mezzo_id uuid not null references public.mezzi(id) on delete cascade,
  hr_profilo_id uuid references public.hr_profili(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  su_mezzo_id uuid references public.mezzi(id) on delete set null,
  dal timestamptz not null default now(),
  al timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint mezzi_assegnazioni_periodo_chk check (al is null or al >= dal)
);
create index if not exists idx_mezzi_assegnazioni_mezzo on public.mezzi_assegnazioni(mezzo_id, dal desc);
create index if not exists idx_mezzi_assegnazioni_order on public.mezzi_assegnazioni(order_id) where order_id is not null;

-- Ogni cambio di persona, cantiere o "caricato su" chiude il periodo aperto e ne
-- apre uno nuovo. Eliminare il mezzo chiude il periodo senza aprirne altri.
create or replace function public.mezzi_storico_assegnazione()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE'
     and new.assegnato_hr_profilo_id is not distinct from old.assegnato_hr_profilo_id
     and new.assegnato_order_id is not distinct from old.assegnato_order_id
     and new.su_mezzo_id is not distinct from old.su_mezzo_id
     and new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;

  update public.mezzi_assegnazioni
     set al = now()
   where mezzo_id = new.id and al is null;

  if new.deleted_at is null
     and (new.assegnato_hr_profilo_id is not null or new.assegnato_order_id is not null or new.su_mezzo_id is not null) then
    insert into public.mezzi_assegnazioni (company_id, mezzo_id, hr_profilo_id, order_id, su_mezzo_id, created_by)
    values (new.company_id, new.id, new.assegnato_hr_profilo_id, new.assegnato_order_id, new.su_mezzo_id, auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function public.mezzi_storico_assegnazione() from public, anon, authenticated;

drop trigger if exists trg_mezzi_storico_assegnazione on public.mezzi;
create trigger trg_mezzi_storico_assegnazione
  after insert or update of assegnato_hr_profilo_id, assegnato_order_id, su_mezzo_id, deleted_at on public.mezzi
  for each row execute function public.mezzi_storico_assegnazione();

-- Chi aveva già un mezzo assegnato prima di questa migrazione: il periodo parte
-- da quando il mezzo è stato creato.
insert into public.mezzi_assegnazioni (company_id, mezzo_id, hr_profilo_id, order_id, su_mezzo_id, dal, created_by)
select m.company_id, m.id, m.assegnato_hr_profilo_id, m.assegnato_order_id, m.su_mezzo_id, m.created_at, m.created_by
  from public.mezzi m
 where m.deleted_at is null
   and (m.assegnato_hr_profilo_id is not null or m.assegnato_order_id is not null or m.su_mezzo_id is not null)
   and not exists (select 1 from public.mezzi_assegnazioni a where a.mezzo_id = m.id);

alter table public.mezzi_assegnazioni enable row level security;
revoke all on public.mezzi_assegnazioni from anon;

drop policy if exists mezzi_assegnazioni_lettura on public.mezzi_assegnazioni;
create policy mezzi_assegnazioni_lettura on public.mezzi_assegnazioni for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_warehouse', company_id));
drop policy if exists mezzi_assegnazioni_modifica on public.mezzi_assegnazioni;
create policy mezzi_assegnazioni_modifica on public.mezzi_assegnazioni for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', company_id));
drop policy if exists blocco_utente_bloccato on public.mezzi_assegnazioni;
create policy blocco_utente_bloccato on public.mezzi_assegnazioni
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- ── Segnalazioni dal campo ──────────────────────────────────────────────────
create table if not exists public.mezzi_segnalazioni (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  mezzo_id uuid not null references public.mezzi(id) on delete cascade,
  tipo text not null default 'guasto',
  descrizione text,
  contatore numeric(12,1),
  stato text not null default 'aperta',
  hr_profilo_id uuid references public.hr_profili(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  chiusa_at timestamptz,
  chiusa_da uuid,
  nota_chiusura text,
  updated_at timestamptz not null default now(),
  constraint mezzi_segnalazioni_tipo_chk check (tipo in ('guasto','danno','km','altro')),
  constraint mezzi_segnalazioni_stato_chk check (stato in ('aperta','in_lavorazione','chiusa'))
);
create index if not exists idx_mezzi_segnalazioni_mezzo on public.mezzi_segnalazioni(mezzo_id, created_at desc);
create index if not exists idx_mezzi_segnalazioni_aperte on public.mezzi_segnalazioni(company_id) where stato <> 'chiusa';
drop trigger if exists trg_mezzi_segnalazioni_updated on public.mezzi_segnalazioni;
create trigger trg_mezzi_segnalazioni_updated before update on public.mezzi_segnalazioni
  for each row execute function public.set_updated_at();

-- Prima dell'inserimento: l'azienda la decide il mezzo (non chi scrive), chi
-- segnala è l'utente, e una lettura dei km nasce già chiusa.
create or replace function public.mezzi_segnalazione_prepara()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  select company_id into new.company_id from public.mezzi where id = new.mezzo_id;
  new.created_by := coalesce(auth.uid(), new.created_by);
  if new.hr_profilo_id is null then
    select id into new.hr_profilo_id from public.miei_hr_profili() as t(id) limit 1;
  end if;
  if new.tipo = 'km' then
    new.stato := 'chiusa';
    new.chiusa_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.mezzi_segnalazione_prepara() from public, anon, authenticated;

drop trigger if exists trg_mezzi_segnalazione_prepara on public.mezzi_segnalazioni;
create trigger trg_mezzi_segnalazione_prepara before insert on public.mezzi_segnalazioni
  for each row execute function public.mezzi_segnalazione_prepara();

-- Dopo: i km più avanti di quelli del mezzo li aggiornano (l'operaio non può
-- scrivere sul mezzo, quindi security definer), e guasti e danni arrivano in
-- campanella a chi gestisce i mezzi: admin e chi modifica il Magazzino.
create or replace function public.mezzi_segnalazione_avvisa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mezzo record;
  v_chi text;
  v_titolo text;
begin
  select id, company_id, nome, targa, contatore into v_mezzo from public.mezzi where id = new.mezzo_id;

  if new.contatore is not null and (v_mezzo.contatore is null or v_mezzo.contatore < new.contatore) then
    update public.mezzi
       set contatore = new.contatore,
           contatore_aggiornato_il = (new.created_at at time zone 'Europe/Rome')::date
     where id = new.mezzo_id;
  end if;

  if new.tipo = 'km' then
    return new;
  end if;

  select nullif(trim(coalesce(hp.nome, '') || ' ' || coalesce(hp.cognome, '')), '')
    into v_chi from public.hr_profili hp where hp.id = new.hr_profilo_id;

  v_titolo := case new.tipo
                when 'guasto' then 'Guasto segnalato'
                when 'danno' then 'Danno segnalato'
                else 'Segnalazione'
              end
              || ': ' || v_mezzo.nome || coalesce(' (' || v_mezzo.targa || ')', '');

  insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  select v_mezzo.company_id, destinatari.user_id, 'mezzo_segnalazione', v_titolo,
         left(coalesce(v_chi || ': ', '') || coalesce(nullif(trim(new.descrizione), ''), 'senza descrizione'), 300),
         'mezzo', new.mezzo_id, '/azienda/mezzi/' || new.mezzo_id
    from (
      select p.id as user_id
        from public.profiles p
        join public.user_roles ur on ur.user_id = p.id and ur.role = 'company_admin'
       where p.company_id = v_mezzo.company_id
      union
      select sp.user_id
        from public.staff_permissions sp
       where sp.company_id = v_mezzo.company_id and sp.can_edit_warehouse
    ) destinatari
   where destinatari.user_id is distinct from new.created_by;

  return new;
end;
$$;
revoke all on function public.mezzi_segnalazione_avvisa() from public, anon, authenticated;

drop trigger if exists trg_mezzi_segnalazione_avvisa on public.mezzi_segnalazioni;
create trigger trg_mezzi_segnalazione_avvisa after insert on public.mezzi_segnalazioni
  for each row execute function public.mezzi_segnalazione_avvisa();

alter table public.mezzi_segnalazioni enable row level security;
revoke all on public.mezzi_segnalazioni from anon;

drop policy if exists mezzi_segnalazioni_lettura on public.mezzi_segnalazioni;
create policy mezzi_segnalazioni_lettura on public.mezzi_segnalazioni for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_warehouse', company_id)
         or public.mezzo_in_carico_a_me(mezzo_id));
drop policy if exists mezzi_segnalazioni_invio on public.mezzi_segnalazioni;
create policy mezzi_segnalazioni_invio on public.mezzi_segnalazioni for insert to authenticated
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', company_id)
              or public.mezzo_in_carico_a_me(mezzo_id));
drop policy if exists mezzi_segnalazioni_gestione on public.mezzi_segnalazioni;
create policy mezzi_segnalazioni_gestione on public.mezzi_segnalazioni for update to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', company_id));
drop policy if exists mezzi_segnalazioni_elimina on public.mezzi_segnalazioni;
create policy mezzi_segnalazioni_elimina on public.mezzi_segnalazioni for delete to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', company_id));
drop policy if exists blocco_utente_bloccato on public.mezzi_segnalazioni;
create policy blocco_utente_bloccato on public.mezzi_segnalazioni
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- ── Foto ────────────────────────────────────────────────────────────────────
create table if not exists public.mezzi_foto (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  mezzo_id uuid not null references public.mezzi(id) on delete cascade,
  segnalazione_id uuid references public.mezzi_segnalazioni(id) on delete cascade,
  file_path text not null,
  didascalia text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_mezzi_foto_mezzo on public.mezzi_foto(mezzo_id, created_at desc);
create index if not exists idx_mezzi_foto_segnalazione on public.mezzi_foto(segnalazione_id) where segnalazione_id is not null;

alter table public.mezzi_foto enable row level security;
revoke all on public.mezzi_foto from anon;

drop policy if exists mezzi_foto_lettura on public.mezzi_foto;
create policy mezzi_foto_lettura on public.mezzi_foto for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_warehouse', company_id)
         or public.mezzo_in_carico_a_me(mezzo_id));
drop policy if exists mezzi_foto_invio on public.mezzi_foto;
create policy mezzi_foto_invio on public.mezzi_foto for insert to authenticated
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', company_id)
              or (public.mezzo_in_carico_a_me(mezzo_id) and created_by = (select auth.uid())));
drop policy if exists mezzi_foto_modifica on public.mezzi_foto;
create policy mezzi_foto_modifica on public.mezzi_foto for update to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', company_id));
drop policy if exists mezzi_foto_elimina on public.mezzi_foto;
create policy mezzi_foto_elimina on public.mezzi_foto for delete to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', company_id)
         or created_by = (select auth.uid()));
drop policy if exists blocco_utente_bloccato on public.mezzi_foto;
create policy blocco_utente_bloccato on public.mezzi_foto
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- ── File per chi ha il mezzo in carico ──────────────────────────────────────
-- Legge solo i file dei documenti e delle foto del suo mezzo (non le fatture
-- dell'officina che stanno nella stessa cartella), e carica foto nella cartella
-- del suo mezzo.
create or replace function public.mezzo_da_percorso(p_percorso text)
returns uuid
language sql
immutable
set search_path to 'public'
as $$
  select case
           when split_part(p_percorso, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then split_part(p_percorso, '/', 2)::uuid
         end;
$$;
revoke all on function public.mezzo_da_percorso(text) from public, anon;
grant execute on function public.mezzo_da_percorso(text) to authenticated;

-- Un file è visibile a chi ha il mezzo in carico se è di un suo documento o di
-- una sua foto. Security definer: l'operaio non legge le tabelle dei documenti.
create or replace function public.file_mezzo_visibile_a_me(p_percorso text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.mezzo_in_carico_a_me(public.mezzo_da_percorso(p_percorso))
     and (exists (select 1 from public.mezzi_documenti d where d.file_path = p_percorso)
          or exists (select 1 from public.mezzi_foto f where f.file_path = p_percorso));
$$;
revoke all on function public.file_mezzo_visibile_a_me(text) from public, anon;
grant execute on function public.file_mezzo_visibile_a_me(text) to authenticated;

drop policy if exists mezzi_file_lettura_in_carico on storage.objects;
create policy mezzi_file_lettura_in_carico on storage.objects for select to authenticated
  using (bucket_id = 'mezzi-documenti' and public.file_mezzo_visibile_a_me(name));

drop policy if exists mezzi_file_invio_in_carico on storage.objects;
create policy mezzi_file_invio_in_carico on storage.objects for insert to authenticated
  with check (bucket_id = 'mezzi-documenti'
    and (storage.foldername(name))[1] = public.get_my_company_id()::text
    and public.mezzo_in_carico_a_me(public.mezzo_da_percorso(name)));

notify pgrst, 'reload schema';
