-- Giornale dei lavori, lotto 3: la pagina diventa un documento.
--   bozza   → si modifica e si cancella (solo chi ha can_edit_giornale_lavori);
--   firmata → immutabile: si aggiungono solo annotazioni (giornale_annotazioni).
-- La firma la mette il trigger (data, autore, impronta sha256 di contenuto + foto),
-- così vale anche per chi aggiorna la riga senza passare dalla RPC.
--
-- Una pagina per cantiere e per giorno: c'è già l'indice unico
-- giornale_lavori_order_id_data_lavori_key (order_id, data_lavori), niente da aggiungere.
--
-- Breve e senza lavoro pesante: ogni CREATE/DROP POLICY tiene un lock fino alla fine.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1. Stato e firmatario -------------------------------------------------------
alter table public.giornale_lavori
  add column if not exists stato text not null default 'bozza',
  add column if not exists pm_signed_by uuid;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.giornale_lavori'::regclass
                    and conname = 'giornale_lavori_stato_check') then
    alter table public.giornale_lavori
      add constraint giornale_lavori_stato_check check (stato in ('bozza', 'firmata'));
  end if;
end $$;

-- 2. Testo canonico della pagina: tutto il contenuto + le foto, senza i campi di servizio.
--    jsonb ha le chiavi in ordine fisso: lo stesso contenuto dà sempre la stessa impronta.
create or replace function public.giornale_testo_canonico(g public.giornale_lavori)
returns text
language sql
stable
set search_path = ''
as $$
  select (
    (to_jsonb(g) - array[
      'stato', 'pm_signed_at', 'pm_signed_by', 'pm_signature_hash', 'created_by',
      'visibile_cliente', 'archived_storage_path', 'archived_at',
      'dl_notified_at', 'dl_notification_method'
    ])
    || jsonb_build_object('foto', coalesce((
         select jsonb_agg(jsonb_build_array(f.id, f.storage_path) order by f.id)
           from public.giornale_foto f
          where f.giornale_id = g.id), '[]'::jsonb))
  )::text;
$$;

revoke all on function public.giornale_testo_canonico(public.giornale_lavori) from public, anon;
grant execute on function public.giornale_testo_canonico(public.giornale_lavori) to authenticated, service_role;

-- 3. Travaso: chi aveva già una firma è firmata, il resto resta bozza (prima del trigger).
update public.giornale_lavori g
   set stato = 'firmata',
       pm_signed_at = coalesce(g.pm_signed_at, g.firmato_il, g.created_at),
       pm_signature_hash = coalesce(g.pm_signature_hash,
         encode(sha256(convert_to(public.giornale_testo_canonico(g), 'UTF8')), 'hex'))
 where g.stato = 'bozza'
   and (g.firmato_il is not null or g.firma_capocantiere is not null or g.pm_signed_at is not null);

-- 4. Chi può modificare il giornale: azienda in cui lavora, non cliente, non bloccato,
--    col permesso (amministratore e super admin sempre, lo dice has_permission_for_company).
create or replace function public.puo_modificare_giornale(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_company_id is not null
     and p_company_id = public.get_my_company_id()
     and not public.utente_e_cliente_esterno()
     and not public.utente_bloccato()
     and coalesce(public.has_permission_for_company((select auth.uid()), 'can_edit_giornale_lavori', p_company_id), false);
$$;

revoke all on function public.puo_modificare_giornale(uuid) from public, anon;
grant execute on function public.puo_modificare_giornale(uuid) to authenticated, service_role;

-- 5. Guardia della pagina firmata (vale per tutti, service role compreso).
create or replace function public.giornale_lavori_guardia_firma()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  servizio constant text[] := array['visibile_cliente', 'archived_storage_path', 'archived_at',
                                    'dl_notified_at', 'dl_notification_method', 'created_by'];
begin
  if tg_op = 'DELETE' then
    -- La purga dell'azienda cancella a cascata: l'azienda non c'è più, si lascia fare.
    if old.stato = 'firmata'
       and exists (select 1 from public.companies c where c.id = old.company_id) then
      raise exception 'Questa pagina del giornale è firmata: non si può eliminare. Si possono solo aggiungere annotazioni.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.stato = 'firmata' then
    if new.stato is distinct from 'firmata' then
      raise exception 'Una pagina firmata non torna in bozza.' using errcode = '42501';
    end if;
    -- created_by può solo diventare NULL (utente cancellato: FK ON DELETE SET NULL).
    if new.created_by is not null and new.created_by is distinct from old.created_by then
      raise exception 'Questa pagina del giornale è firmata: non si può modificare. Aggiungi un''annotazione.'
        using errcode = '42501';
    end if;
    if (to_jsonb(new) - servizio) is distinct from (to_jsonb(old) - servizio) then
      raise exception 'Questa pagina del giornale è firmata: non si può modificare. Aggiungi un''annotazione.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.stato = 'firmata' then
    -- Passaggio a firmata: la firma la scrive il database, non chi chiama.
    new.pm_signed_at := now();
    new.pm_signed_by := coalesce((select auth.uid()), new.pm_signed_by);
    new.pm_signature_hash := encode(sha256(convert_to(public.giornale_testo_canonico(new), 'UTF8')), 'hex');
  else
    -- In bozza non c'è firma: pm_signed_at valorizzato vuol dire sempre «firmata».
    new.pm_signed_at := null;
    new.pm_signed_by := null;
    new.pm_signature_hash := null;
  end if;
  return new;
end;
$$;

revoke all on function public.giornale_lavori_guardia_firma() from public, anon, authenticated;

drop trigger if exists trg_giornale_lavori_guardia_firma on public.giornale_lavori;
create trigger trg_giornale_lavori_guardia_firma
  before insert or update or delete on public.giornale_lavori
  for each row execute function public.giornale_lavori_guardia_firma();

-- 6. Le foto di una pagina firmata fanno parte dell'impronta: niente aggiunte, cambi o cancellazioni.
create or replace function public.giornale_foto_guardia_firma()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_giornale uuid := case when tg_op = 'DELETE' then old.giornale_id else new.giornale_id end;
begin
  -- Purga dell'azienda a cascata: l'azienda non c'è più, si lascia fare.
  if tg_op = 'DELETE' and not exists (select 1 from public.companies c where c.id = old.company_id) then
    return old;
  end if;
  if exists (select 1 from public.giornale_lavori g
              where g.stato = 'firmata'
                and (g.id = v_giornale or (tg_op = 'UPDATE' and g.id = old.giornale_id))) then
    raise exception 'Le foto di una pagina firmata del giornale non si possono aggiungere, cambiare o togliere.'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.giornale_foto_guardia_firma() from public, anon, authenticated;

drop trigger if exists trg_giornale_foto_guardia_firma on public.giornale_foto;
create trigger trg_giornale_foto_guardia_firma
  before insert or update or delete on public.giornale_foto
  for each row execute function public.giornale_foto_guardia_firma();

-- 7. Annotazioni: solo aggiunta, solo su pagine firmate. Il cliente non le vede (per ora).
--    giornale_id senza ON DELETE: NO ACTION blocca la cancellazione diretta ma, a
--    differenza di RESTRICT, lascia passare la purga a cascata dell'azienda.
create table if not exists public.giornale_annotazioni (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  giornale_id uuid not null references public.giornale_lavori(id),
  testo text not null check (length(btrim(testo)) between 1 and 5000),
  autore_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_giornale_annotazioni_giornale
  on public.giornale_annotazioni (giornale_id, created_at);

alter table public.giornale_annotazioni enable row level security;

revoke all on table public.giornale_annotazioni from public, anon;
revoke update, delete, truncate on table public.giornale_annotazioni from authenticated;
grant select, insert on table public.giornale_annotazioni to authenticated;
grant all on table public.giornale_annotazioni to service_role;

drop policy if exists giornale_annotazioni_select on public.giornale_annotazioni;
create policy giornale_annotazioni_select on public.giornale_annotazioni
  for select to authenticated
  using (company_id = (select public.get_my_company_id())
         and not (select public.utente_e_cliente_esterno())
         and not (select public.utente_bloccato()));

drop policy if exists giornale_annotazioni_insert on public.giornale_annotazioni;
create policy giornale_annotazioni_insert on public.giornale_annotazioni
  for insert to authenticated
  with check (public.puo_modificare_giornale(company_id)
              and autore_id = (select auth.uid())
              and exists (select 1 from public.giornale_lavori g
                           where g.id = giornale_id
                             and g.company_id = giornale_annotazioni.company_id
                             and g.stato = 'firmata'));

-- 8. Scrittura del giornale solo col permesso (prima: chiunque dell'azienda, anche un operaio).
--    Lettura come prima. Le policy del commercialista e il blocco utente restano.
drop policy if exists company_access_giornale on public.giornale_lavori;
create policy company_access_giornale on public.giornale_lavori
  for select to authenticated
  using (company_id = get_my_company_id() and not utente_e_cliente_esterno());

drop policy if exists giornale_lavori_modifica_insert on public.giornale_lavori;
create policy giornale_lavori_modifica_insert on public.giornale_lavori
  for insert to authenticated
  with check (public.puo_modificare_giornale(company_id));

drop policy if exists giornale_lavori_modifica_update on public.giornale_lavori;
create policy giornale_lavori_modifica_update on public.giornale_lavori
  for update to authenticated
  using (public.puo_modificare_giornale(company_id))
  with check (public.puo_modificare_giornale(company_id));

drop policy if exists giornale_lavori_modifica_delete on public.giornale_lavori;
create policy giornale_lavori_modifica_delete on public.giornale_lavori
  for delete to authenticated
  using (public.puo_modificare_giornale(company_id));

-- 9. Firma dalla pagina.
create or replace function public.giornale_firma(p_giornale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.giornale_lavori;
begin
  select * into g from public.giornale_lavori where id = p_giornale_id for update;
  if not found or g.company_id is distinct from public.get_my_company_id() then
    raise exception 'Pagina del giornale non trovata.' using errcode = 'P0002';
  end if;
  if not public.puo_modificare_giornale(g.company_id) then
    raise exception 'Non hai il permesso di firmare il giornale dei lavori.' using errcode = '42501';
  end if;
  if g.stato = 'firmata' then
    raise exception 'Questa pagina del giornale è già firmata.' using errcode = '22023';
  end if;
  if coalesce(btrim(g.lavorazioni_eseguite), '') = '' then
    raise exception 'Scrivi le lavorazioni eseguite prima di firmare.' using errcode = '22023';
  end if;

  update public.giornale_lavori set stato = 'firmata' where id = g.id returning * into g;

  return jsonb_build_object('id', g.id, 'stato', g.stato, 'pm_signed_at', g.pm_signed_at,
                            'pm_signed_by', g.pm_signed_by, 'pm_signature_hash', g.pm_signature_hash);
end;
$$;

revoke all on function public.giornale_firma(uuid) from public, anon;
grant execute on function public.giornale_firma(uuid) to authenticated;

-- 10. Silvio firmava scrivendo pm_signed_at a mano: ora passa dallo stato, la firma la scrive il trigger.
create or replace function public.silvio_tool_approva_giornale(p_company_id uuid, p_user_id uuid, p_giornale_id uuid, p_observations text default null::text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_giornale record;
  v_firmata public.giornale_lavori;
begin
  select id, company_id, data_lavori, stato, pm_signed_at into v_giornale
    from public.giornale_lavori where id = p_giornale_id for update;

  if v_giornale is null or v_giornale.company_id <> p_company_id then
    return jsonb_build_object('error', 'Giornale non trovato');
  end if;
  if v_giornale.stato = 'firmata' then
    return jsonb_build_object('error', 'Giornale già firmato', 'signed_at', v_giornale.pm_signed_at);
  end if;

  -- Le osservazioni entrano nella pagina PRIMA della firma, così fanno parte dell'impronta.
  if p_observations is not null then
    update public.giornale_lavori
       set note = coalesce(note, '') || E'\n\n[Osservazioni firma]: ' || p_observations
     where id = p_giornale_id;
  end if;

  update public.giornale_lavori
     set stato = 'firmata', pm_signed_by = p_user_id
   where id = p_giornale_id
   returning * into v_firmata;

  return jsonb_build_object(
    'success', true,
    'giornale_id', p_giornale_id,
    'signature_hash', v_firmata.pm_signature_hash,
    'signed_at', v_firmata.pm_signed_at,
    'message', format('Giornale del %s firmato digitalmente', v_giornale.data_lavori)
  );
end;
$$;

revoke all on function public.silvio_tool_approva_giornale(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.silvio_tool_approva_giornale(uuid, uuid, uuid, text) to service_role;
