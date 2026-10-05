-- Mezzi e attrezzature: «è rotto» dal cantiere anche per chi non ha l'attrezzo in carico.
--
-- Fino a oggi un guasto (con le foto) lo segnalava solo chi aveva il mezzo in
-- carico (mezzo_in_carico_a_me). Con le etichette QR capita l'opposto: il
-- demolitore è sul cantiere, lo prende in mano chi ci lavora, è rotto. Chi ha
-- appena letto il suo QR (una riga in mezzi_scansioni negli ultimi 30 minuti:
-- la scrivono solo mezzo_da_codice e campo_attrezzo_azione, dopo aver
-- controllato che sia della sua azienda) può segnalarlo e allegare le foto.
--
-- Non si allarga la lettura: i documenti del mezzo (assicurazione, libretto…)
-- restano a chi lo ha in carico e all'ufficio; chi segnala vede le proprie
-- segnalazioni e le proprie foto.

create or replace function public.mezzo_appena_scansionato_da_me(p_mezzo uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.mezzi_scansioni s
     where s.mezzo_id = p_mezzo
       and s.user_id = auth.uid()
       and s.created_at > now() - interval '30 minutes'
  );
$$;
revoke all on function public.mezzo_appena_scansionato_da_me(uuid) from public, anon;
grant execute on function public.mezzo_appena_scansionato_da_me(uuid) to authenticated;

-- Per lo storage: la cartella {azienda}/{mezzo}/ di un mezzo appena letto.
create or replace function public.cartella_mezzo_scansionata_da_me(p_percorso text)
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
  and public.mezzo_appena_scansionato_da_me(public.mezzo_da_percorso(p_percorso));
$$;
revoke all on function public.cartella_mezzo_scansionata_da_me(text) from public, anon;
grant execute on function public.cartella_mezzo_scansionata_da_me(text) to authenticated;

-- Segnalazioni: si mandano anche dopo una scansione; si vedono le proprie.
drop policy if exists mezzi_segnalazioni_invio on public.mezzi_segnalazioni;
create policy mezzi_segnalazioni_invio on public.mezzi_segnalazioni for insert to authenticated
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id)
              or public.mezzo_in_carico_a_me(mezzo_id)
              or public.mezzo_appena_scansionato_da_me(mezzo_id));
drop policy if exists mezzi_segnalazioni_lettura on public.mezzi_segnalazioni;
create policy mezzi_segnalazioni_lettura on public.mezzi_segnalazioni for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_mezzi', company_id)
         or public.mezzo_in_carico_a_me(mezzo_id)
         or created_by = (select auth.uid()));

-- Foto della segnalazione: stessa regola; si vedono le proprie.
drop policy if exists mezzi_foto_invio on public.mezzi_foto;
create policy mezzi_foto_invio on public.mezzi_foto for insert to authenticated
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id)
              or ((public.mezzo_in_carico_a_me(mezzo_id) or public.mezzo_appena_scansionato_da_me(mezzo_id))
                  and created_by = (select auth.uid())));
drop policy if exists mezzi_foto_lettura on public.mezzi_foto;
create policy mezzi_foto_lettura on public.mezzi_foto for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_mezzi', company_id)
         or public.mezzo_in_carico_a_me(mezzo_id)
         or created_by = (select auth.uid()));

-- Il file della foto nella cartella del mezzo (e la sua pulizia se l'invio
-- non va a buon fine). La lettura dei file resta com'era.
drop policy if exists mezzi_file_invio_in_carico on storage.objects;
create policy mezzi_file_invio_in_carico on storage.objects for insert to authenticated
  with check (bucket_id = 'mezzi-documenti'
              and (public.cartella_mezzo_in_carico_a_me(name) or public.cartella_mezzo_scansionata_da_me(name)));
drop policy if exists mezzi_file_elimina_in_carico on storage.objects;
create policy mezzi_file_elimina_in_carico on storage.objects for delete to authenticated
  using (bucket_id = 'mezzi-documenti'
         and owner_id = ((select auth.uid()))::text
         and (public.cartella_mezzo_in_carico_a_me(name) or public.cartella_mezzo_scansionata_da_me(name))
         and not public.file_mezzo_visibile_a_me(name));
