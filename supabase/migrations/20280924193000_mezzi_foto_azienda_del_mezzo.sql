-- Mezzi dal telefono: foto e cartelle seguono l'azienda del mezzo (24/09/2026).
--
-- Chi lavora per due aziende (otto utenti oggi: profili del personale in più di
-- un'azienda) vede dal telefono i mezzi di entrambe. Le foto di un guasto però
-- si caricavano nella cartella dell'azienda ATTIVA sul telefono, non in quella
-- del mezzo: lo storage le rifiutava (la regola voleva la cartella dell'azienda
-- attiva) e, se fossero passate, l'ufficio del mezzo non le avrebbe viste.
-- Allo stesso modo la riga della foto prendeva l'azienda che mandava il
-- telefono. Ora:
--   · mezzi_in_carico() dice di che azienda è ogni mezzo, e il telefono carica lì;
--   · la riga della foto prende l'azienda dal mezzo (come già le segnalazioni),
--     e una foto legata a una segnalazione deve essere dello stesso mezzo;
--   · lo storage accetta da chi ha il mezzo in carico solo la cartella
--     <azienda del mezzo>/<mezzo>/, e gli lascia rileggere e togliere i file che
--     ha caricato lui (per ripulire se il resto dell'invio non va).
--
-- Idempotente.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── I mezzi che ho in carico, con la loro azienda ───────────────────────────
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
           'id', m.id, 'company_id', m.company_id, 'nome', m.nome, 'tipo', m.tipo, 'targa', m.targa,
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

-- ── La foto prende l'azienda dal mezzo ──────────────────────────────────────
create or replace function public.mezzi_foto_prepara()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  select company_id into new.company_id from public.mezzi where id = new.mezzo_id;
  if new.company_id is null then
    raise exception 'Mezzo non trovato' using errcode = '23503';
  end if;
  if new.segnalazione_id is not null
     and not exists (select 1 from public.mezzi_segnalazioni s
                      where s.id = new.segnalazione_id and s.mezzo_id = new.mezzo_id) then
    raise exception 'La segnalazione è di un altro mezzo' using errcode = '23514';
  end if;
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end;
$$;
revoke all on function public.mezzi_foto_prepara() from public, anon, authenticated;

drop trigger if exists trg_mezzi_foto_prepara on public.mezzi_foto;
create trigger trg_mezzi_foto_prepara before insert on public.mezzi_foto
  for each row execute function public.mezzi_foto_prepara();

-- ── Storage: la cartella del mio mezzo ──────────────────────────────────────
-- true se il percorso è <azienda del mezzo>/<mezzo>/… e il mezzo è in carico a
-- me (o è un attrezzo su un mezzo in carico a me). Security definer: chi ha il
-- mezzo in carico non legge la tabella dei mezzi.
create or replace function public.cartella_mezzo_in_carico_a_me(p_percorso text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select m.company_id::text = split_part(p_percorso, '/', 1)
      from public.mezzi m
     where m.id = public.mezzo_da_percorso(p_percorso)
  ), false)
  and public.mezzo_in_carico_a_me(public.mezzo_da_percorso(p_percorso));
$$;
revoke all on function public.cartella_mezzo_in_carico_a_me(text) from public, anon;
grant execute on function public.cartella_mezzo_in_carico_a_me(text) to authenticated;

drop policy if exists mezzi_file_invio_in_carico on storage.objects;
create policy mezzi_file_invio_in_carico on storage.objects for insert to authenticated
  with check (bucket_id = 'mezzi-documenti' and public.cartella_mezzo_in_carico_a_me(name));

drop policy if exists mezzi_file_lettura_in_carico on storage.objects;
create policy mezzi_file_lettura_in_carico on storage.objects for select to authenticated
  using (bucket_id = 'mezzi-documenti'
         and (public.file_mezzo_visibile_a_me(name)
              or (owner_id = (select auth.uid())::text and public.cartella_mezzo_in_carico_a_me(name))));

-- Togliere: solo i propri file rimasti orfani (caricati ma mai legati a una
-- foto o a un documento). Quelli già arrivati all'ufficio restano.
drop policy if exists mezzi_file_elimina_in_carico on storage.objects;
create policy mezzi_file_elimina_in_carico on storage.objects for delete to authenticated
  using (bucket_id = 'mezzi-documenti'
         and owner_id = (select auth.uid())::text
         and public.cartella_mezzo_in_carico_a_me(name)
         and not public.file_mezzo_visibile_a_me(name));

notify pgrst, 'reload schema';
