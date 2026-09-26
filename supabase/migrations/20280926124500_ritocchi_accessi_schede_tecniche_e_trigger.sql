-- Tre ritocchi di igiene dal censimento del guardiano degli accessi (26/09/2026).
--
-- 1. Schede tecniche dei preventivi (bucket quote-materials).
--    Le policy qm_sel, qm_ins, qm_upd e qm_del guardavano solo la cartella
--    dell'azienda. Provato in transazioni annullate: il cliente esterno col
--    portale acceso elencava, leggeva, cancellava e caricava file nella
--    cartella della sua azienda; l'utente bloccato li leggeva finché il token
--    valeva. qm_upd leggeva auth.jwt()->'raw_app_meta_data', chiave che nel
--    token non c'è: non ha mai lasciato passare niente.
--    Nessuna pagina carica, sostituisce o cancella questi file: i materiali non
--    si creano più dall'app (qpm_ins/qpm_upd/qpm_del tolte il 26/09),
--    Contenuti multimediali li apre con un URL firmato, che passa da qm_sel, e
--    generate-quote-pdf li scarica col service role. Resta la sola lettura, per
--    chi lavora nell'azienda e non è bloccato.
--
-- 2. appuntamenti_orari_riallineati era l'unica tabella con company_id senza la
--    RESTRICTIVE blocco_utente_bloccato (profiles è esclusa di proposito). La
--    migrazione che l'ha creata (20280919120500) girava con
--    session_replication_role = replica, e in quella modalità gli event trigger
--    non scattano: check_new_table_rls() non ha potuto aggiungerla. Oggi la
--    tabella non ha GRANT né ad anon né ad authenticated: è coerenza, non un
--    buco.
--
-- 3. nota_scheda_nel_registro() e trg_update_paid_amount() sono funzioni di
--    trigger SECURITY DEFINER eseguibili da anon (in v_funzioni_aperte_ad_anon
--    come NON CLASSIFICATA). Una funzione di trigger non si chiama da sola, e
--    allo scatto il privilegio EXECUTE non si controlla: si toglie a tutti.
--
-- Cambiano solo policy e privilegi, nessuna riga. Riscrivere una policy su
-- storage.objects prende un lock esclusivo su tutto lo storage: meglio fallire
-- dopo 3 secondi e riprovare che mettere in coda ogni upload e download. Per
-- questo lo storage viene per ultimo, e il lock resta preso solo fino al commit.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- 3. Funzioni di trigger: nessuno deve poterle chiamare.
revoke all on function public.nota_scheda_nel_registro() from public, anon, authenticated;
revoke all on function public.trg_update_paid_amount() from public, anon, authenticated;

-- 2. Il blocco utente anche sugli orari riallineati, come sulle altre tabelle.
drop policy if exists blocco_utente_bloccato on public.appuntamenti_orari_riallineati;
create policy blocco_utente_bloccato on public.appuntamenti_orari_riallineati
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato()))
  with check (not (select public.utente_bloccato()));

-- 1. Schede tecniche: nessuna scrittura dal browser.
drop policy if exists qm_ins on storage.objects;
drop policy if exists qm_upd on storage.objects;
drop policy if exists qm_del on storage.objects;

-- Lettura (anche l'URL firmato di Contenuti multimediali): chi lavora
-- nell'azienda della cartella, non il cliente esterno, non l'utente bloccato.
drop policy if exists qm_sel on storage.objects;
create policy qm_sel on storage.objects
  for select to authenticated
  using (
    bucket_id = 'quote-materials'
    and (storage.foldername(name))[1] = (select public.get_my_company_id())::text
    and not (select public.utente_e_cliente_esterno())
    and not (select public.utente_bloccato())
  );
