-- Mezzi: chi ha caricato una foto dopo aver letto il QR la vede (e quindi la
-- può togliere) nei 30 minuti successivi.
--
-- Lo storage, per cancellare un file, deve prima poterlo leggere. Con la
-- migrazione 20281005180000 chi legge il QR di un attrezzo non suo può
-- allegare foto a una segnalazione, ma non le vedeva: se l'invio si fermava a
-- metà, la pulizia del file caricato (useInviaSegnalazione) non toglieva niente
-- e il file restava orfano. Si legge solo il proprio file, nella cartella di un
-- mezzo appena letto; i documenti del mezzo restano chiusi come prima.
drop policy if exists mezzi_file_lettura_in_carico on storage.objects;
create policy mezzi_file_lettura_in_carico on storage.objects for select to authenticated
  using (bucket_id = 'mezzi-documenti'
         and (public.file_mezzo_visibile_a_me(name)
              or (owner_id = ((select auth.uid()))::text
                  and (public.cartella_mezzo_in_carico_a_me(name) or public.cartella_mezzo_scansionata_da_me(name)))));
