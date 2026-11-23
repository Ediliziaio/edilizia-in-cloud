-- Scontrino del pasto fotografato dall'operaio (23/11/2026).
--
-- Con i buoni pasto in modalità «ricevuta» o «entrambi» l'operaio registrava lo scontrino solo passando
-- dall'ufficio. hr_buoni_pasto accetta già l'inserimento da parte dell'interessato (tipo «ricevuta», stato
-- «maturato», solo se abilitato: hbp_insert_ricevuta + private.hr_benefit_valida); mancava dove tenere la foto.
-- Cartella privata `buoni-pasto-ricevute`, percorso <azienda>/<scheda del personale>/<file>:
-- - carica solo nella propria cartella (scheda scelta da hr_profilo_da_user, come le regole sui buoni);
-- - legge chi ha caricato e l'amministratore dell'azienda (che gestisce le paghe);
-- - nessuno sostituisce o cancella dal browser: è un giustificativo.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('buoni-pasto-ricevute', 'buoni-pasto-ricevute', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists buoni_pasto_ricevute_carica on storage.objects;
create policy buoni_pasto_ricevute_carica on storage.objects for insert to authenticated
  with check (
    bucket_id = 'buoni-pasto-ricevute'
    and not (select public.utente_bloccato())
    and not (select public.utente_e_cliente_esterno())
    and (storage.foldername(name))[1] = (select public.get_effective_company_id())::text
    and (storage.foldername(name))[2] = (select public.hr_profilo_da_user(auth.uid(), public.get_effective_company_id()))::text
  );

drop policy if exists buoni_pasto_ricevute_leggi on storage.objects;
create policy buoni_pasto_ricevute_leggi on storage.objects for select to authenticated
  using (
    bucket_id = 'buoni-pasto-ricevute'
    and not (select public.utente_bloccato())
    and (
      owner_id = (select auth.uid())::text
      or case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then public.e_amministratore_di(((storage.foldername(name))[1])::uuid)
           else false end
    )
  );

drop policy if exists buoni_pasto_ricevute_immutabili on storage.objects;
create policy buoni_pasto_ricevute_immutabili on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'buoni-pasto-ricevute');
drop policy if exists buoni_pasto_ricevute_conserva on storage.objects;
create policy buoni_pasto_ricevute_conserva on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'buoni-pasto-ricevute');
drop policy if exists buoni_pasto_ricevute_anon on storage.objects;
create policy buoni_pasto_ricevute_anon on storage.objects as restrictive for all to anon
  using (bucket_id <> 'buoni-pasto-ricevute') with check (bucket_id <> 'buoni-pasto-ricevute');
