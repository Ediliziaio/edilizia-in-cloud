-- POS sul modello ufficiale (24/09/2026, richiesta di Florin).
--
-- Il generatore di prima scriveva un testo AI di una pagina e mezza, con
-- l'indirizzo della sede al posto di quello del cantiere, e lo esportava come
-- JSON grezzo. Ora il POS segue il modello semplificato del Decreto
-- Interministeriale 9 settembre 2014 (Allegato I), sui contenuti minimi
-- dell'Allegato XV, punto 3.2.1, del D.Lgs 81/2008:
--
--   · sicurezza_figure — le figure della sicurezza dell'impresa (datore di
--     lavoro, direttore tecnico, capocantiere, RSPP, medico, RLS/RLST, addetti
--     alle emergenze): si scrivono una volta e ogni POS le riprende;
--   · pos_documents.contenuto — il POS strutturato come il modello; revisione e
--     storico delle revisioni; chi l'ha approvato e quando; «iter» con le date
--     di firma, consultazione dell'RLS e verifiche di affidataria e CSE
--     (art. 101 comma 3);
--   · l'approvazione passa SOLO dal server (edge genera-pos, azione approva),
--     che prima controlla i contenuti minimi: un POS senza uno degli elementi
--     dell'Allegato XV è sanzionabile (art. 159). Un POS approvato non si
--     modifica: si apre una nuova revisione;
--   · accesso ai POS e alle figure solo con il permesso Sicurezza Cantiere
--     (prima bastava essere dell'azienda: anche un cliente del portale);
--   · bucket sicurezza-documenti per le schede di sicurezza e la valutazione
--     del rumore da allegare.
--
-- Idempotente.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── Figure della sicurezza dell'impresa ─────────────────────────────────────
create table if not exists public.sicurezza_figure (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ruolo text not null,
  nominativo text not null,
  hr_profilo_id uuid references public.hr_profili(id) on delete set null,
  esterno boolean not null default false,
  telefono text,
  email text,
  mansioni_sicurezza text,
  attestato text,
  scadenza date,
  note text,
  attivo boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sicurezza_figure_ruolo_chk check (ruolo in (
    'datore_lavoro', 'dirigente', 'direttore_tecnico', 'preposto', 'capocantiere', 'rspp',
    'medico_competente', 'rls', 'rlst', 'addetto_antincendio', 'addetto_primo_soccorso'
  )),
  constraint sicurezza_figure_nominativo_chk check (length(trim(nominativo)) > 0)
);
create index if not exists idx_sicurezza_figure_company on public.sicurezza_figure(company_id, ruolo) where attivo;

drop trigger if exists trg_sicurezza_figure_updated on public.sicurezza_figure;
create trigger trg_sicurezza_figure_updated before update on public.sicurezza_figure
  for each row execute function public.update_updated_at_column();

alter table public.sicurezza_figure enable row level security;
revoke all on public.sicurezza_figure from anon;

drop policy if exists sicurezza_figure_lettura on public.sicurezza_figure;
create policy sicurezza_figure_lettura on public.sicurezza_figure for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id));
drop policy if exists sicurezza_figure_modifica on public.sicurezza_figure;
create policy sicurezza_figure_modifica on public.sicurezza_figure for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id));
drop policy if exists sola_lettura_non_crea on public.sicurezza_figure;
create policy sola_lettura_non_crea on public.sicurezza_figure as restrictive for insert to authenticated
  with check (not public.utente_sola_lettura(company_id));
drop policy if exists sola_lettura_non_modifica on public.sicurezza_figure;
create policy sola_lettura_non_modifica on public.sicurezza_figure as restrictive for update to authenticated
  using (not public.utente_sola_lettura(company_id)) with check (not public.utente_sola_lettura(company_id));
drop policy if exists sola_lettura_non_elimina on public.sicurezza_figure;
create policy sola_lettura_non_elimina on public.sicurezza_figure as restrictive for delete to authenticated
  using (not public.utente_sola_lettura(company_id));
drop policy if exists blocco_utente_bloccato on public.sicurezza_figure;
create policy blocco_utente_bloccato on public.sicurezza_figure
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- ── POS sul modello ─────────────────────────────────────────────────────────
alter table public.pos_documents
  add column if not exists contenuto jsonb,
  add column if not exists revisione integer not null default 0,
  add column if not exists revisioni jsonb not null default '[]'::jsonb,
  add column if not exists approvato_da uuid,
  add column if not exists approvato_da_nome text,
  add column if not exists approvato_il timestamptz,
  add column if not exists iter jsonb not null default '{}'::jsonb;

comment on column public.pos_documents.contenuto is
  'POS strutturato sul modello semplificato del DI 9/9/2014 (Allegato I). Forma in supabase/functions/_shared/posModello.ts.';
comment on column public.pos_documents.iter is
  'Date di firma del datore di lavoro, consultazione RLS, consegna e verifica di impresa affidataria e CSE (art. 101 c.3).';

-- Accesso: solo con il permesso Sicurezza Cantiere (prima: chiunque dell'azienda).
drop policy if exists company_access_pos on public.pos_documents;
drop policy if exists pos_documents_lettura on public.pos_documents;
create policy pos_documents_lettura on public.pos_documents for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id));
drop policy if exists pos_documents_modifica on public.pos_documents;
create policy pos_documents_modifica on public.pos_documents for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id));
drop policy if exists sola_lettura_non_crea on public.pos_documents;
create policy sola_lettura_non_crea on public.pos_documents as restrictive for insert to authenticated
  with check (not public.utente_sola_lettura(company_id));
drop policy if exists sola_lettura_non_modifica on public.pos_documents;
create policy sola_lettura_non_modifica on public.pos_documents as restrictive for update to authenticated
  using (not public.utente_sola_lettura(company_id)) with check (not public.utente_sola_lettura(company_id));
drop policy if exists sola_lettura_non_elimina on public.pos_documents;
create policy sola_lettura_non_elimina on public.pos_documents as restrictive for delete to authenticated
  using (not public.utente_sola_lettura(company_id));

-- L'approvazione la fa il server dopo il controllo dei contenuti minimi; un
-- POS approvato non cambia contenuto: si apre una nuova revisione.
create or replace function public.pos_documents_guardia()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Solo le richieste degli utenti (PostgREST come authenticated). Il server
  -- (service_role) e le migrazioni passano.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'approvato' then
      raise exception 'Il POS si approva dal pulsante Approva, che controlla i contenuti obbligatori'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status = 'approvato' and old.status is distinct from 'approvato' then
    raise exception 'Il POS si approva dal pulsante Approva, che controlla i contenuti obbligatori'
      using errcode = '42501';
  end if;

  if old.status = 'approvato' and new.status = 'approvato'
     and (new.contenuto is distinct from old.contenuto or new.revisione is distinct from old.revisione) then
    raise exception 'Il POS è approvato: apri una nuova revisione per modificarlo'
      using errcode = '42501';
  end if;

  -- Chi e quando ha approvato lo scrive solo il server.
  if new.approvato_da is distinct from old.approvato_da and new.approvato_da is not null then
    raise exception 'L''approvazione la registra il server' using errcode = '42501';
  end if;

  return new;
end;
$$;
revoke all on function public.pos_documents_guardia() from public, anon, authenticated;

drop trigger if exists trg_pos_documents_guardia on public.pos_documents;
create trigger trg_pos_documents_guardia before insert or update on public.pos_documents
  for each row execute function public.pos_documents_guardia();

-- L'assistente creava bozze con uno stato («draft») che la pagina non conosce.
create or replace function public.silvio_tool_genera_pos_cantiere(
  p_company_id uuid,
  p_cantiere_id uuid,
  p_force_regenerate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_existing_id uuid;
  v_id uuid;
begin
  if not exists (select 1 from public.orders where id = p_cantiere_id and company_id = p_company_id) then
    return jsonb_build_object('ok', false, 'error', 'Commessa non trovata in questa azienda');
  end if;

  select id into v_existing_id
    from public.pos_documents
   where company_id = p_company_id
     and order_id = p_cantiere_id
     and coalesce(document_type, 'pos') = 'pos'
     and superseded_by is null
   order by created_at desc
   limit 1;

  if v_existing_id is not null and not p_force_regenerate then
    return jsonb_build_object('ok', true, 'already_exists', true, 'pos_id', v_existing_id,
                              'url', '/azienda/sicurezza-cantiere/pos/' || v_existing_id);
  end if;

  -- Bozza vuota: la pagina del POS la compila dai dati dell'app all'apertura.
  -- tipo_lavori e indirizzo_cantiere sono obbligatorie: prima l'insert falliva sempre.
  insert into public.pos_documents (company_id, order_id, document_type, status, version, revisione, valid_from, generated_by, tipo_lavori, indirizzo_cantiere)
  select p_company_id, p_cantiere_id, 'pos', 'bozza', 1, 0, current_date, 'app',
         coalesce(nullif(trim(coalesce(o.work_description, o.description)), ''), 'Da specificare'),
         coalesce(nullif(trim(coalesce(o.work_address, o.indirizzo_lavori)), ''), 'Da specificare')
    from public.orders o where o.id = p_cantiere_id
  returning id into v_id;

  if v_existing_id is not null and p_force_regenerate then
    update public.pos_documents set superseded_by = v_id where id = v_existing_id;
  end if;

  return jsonb_build_object('ok', true, 'pos_id', v_id, 'url', '/azienda/sicurezza-cantiere/pos/' || v_id,
                            'next_step', 'Apri il POS: si compila dai dati dell''app e va completato e approvato dal datore di lavoro');
end;
$$;
revoke all on function public.silvio_tool_genera_pos_cantiere(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.silvio_tool_genera_pos_cantiere(uuid, uuid, boolean) to service_role;

update public.pos_documents set status = 'bozza' where status = 'draft';

-- ── Allegati del POS (schede di sicurezza, valutazione del rumore) ──────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('sicurezza-documenti', 'sicurezza-documenti', false, 20971520)
on conflict (id) do nothing;

drop policy if exists sicurezza_documenti_lettura on storage.objects;
create policy sicurezza_documenti_lettura on storage.objects for select to authenticated
  using (bucket_id = 'sicurezza-documenti'
         and (storage.foldername(name))[1] = public.get_my_company_id()::text
         and public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', public.get_my_company_id()));
drop policy if exists sicurezza_documenti_invio on storage.objects;
create policy sicurezza_documenti_invio on storage.objects for insert to authenticated
  with check (bucket_id = 'sicurezza-documenti'
              and (storage.foldername(name))[1] = public.get_my_company_id()::text
              and public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', public.get_my_company_id())
              and not public.utente_sola_lettura(public.get_my_company_id()));
drop policy if exists sicurezza_documenti_elimina on storage.objects;
create policy sicurezza_documenti_elimina on storage.objects for delete to authenticated
  using (bucket_id = 'sicurezza-documenti'
         and (storage.foldername(name))[1] = public.get_my_company_id()::text
         and public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', public.get_my_company_id())
         and not public.utente_sola_lettura(public.get_my_company_id()));

notify pgrst, 'reload schema';
