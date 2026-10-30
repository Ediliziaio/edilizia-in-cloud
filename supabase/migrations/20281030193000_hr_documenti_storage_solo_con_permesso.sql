-- Documenti del personale: il FILE lo apre chi può gestire il personale, non
-- chiunque sia staff (30/10/2026).
--
-- Trovato nel collaudo del POS. La policy hr_doc_storage_admin su
-- storage.objects (bucket hr-documenti, comando ALL) dava lettura, caricamento,
-- sostituzione e CANCELLAZIONE di tutti i file della propria azienda a chi ha
-- il ruolo company_staff. È il ruolo di chiunque lavori in ufficio: venditori,
-- call center, chi segue solo i preventivi. In quel bucket stanno documenti
-- d'identità, idoneità sanitarie, attestati di formazione, certificati medici
-- delle assenze e i CV dei candidati.
--
-- Chi vede le RIGHE di hr_documenti l'aveva già deciso 20280926051500
-- (amministratore, super admin o «Personale & HR» = can_view_persone). Il
-- FILE ora segue la stessa porta, con la funzione dei permessi per azienda:
--   · amministratore dell'azienda in cui si lavora (e_amministratore_di);
--   · super admin;
--   · chi ha can_view_persone in quell'azienda (has_permission_for_company:
--     ruolo staff e riga di staff_permissions di QUELLA azienda; un utente
--     bloccato no).
-- Cambia solo la terza strada: prima bastava il ruolo company_staff.
--
-- Non cambia:
--   · hr_doc_storage_self_read: il lavoratore legge la propria cartella
--     (cartella 2 = la sua scheda HR), in sola lettura;
--   · il confine «cartella 1 = azienda in cui si lavora»;
--   · il server con la chiave di servizio, che non passa dalla policy
--     (genera-pos apre l'originale formativo per il POS; candidatura-submit
--     carica il CV);
--   · comando ALL: lettura, caricamento, sostituzione e cancellazione chiedono
--     la stessa cosa (USING e WITH CHECK identici).
--
-- Chi perde l'accesso ai file (staff senza «Personale & HR», 30/10/2026):
-- Demo Azienda 2: 1; Dimora Torino: 2; Ke Bei Serramenti: 4 (uno con Sicurezza
-- cantiere: l'app non gli mostrava già gli originali HR, le qualifiche passano
-- da sicurezza_qualifiche_quadro e il POS dal server). Nessuna schermata
-- dell'app apre questi file con un permesso diverso: le pagine Personale e HR,
-- i candidati e le assenze chiedono già canViewPersone; il Drive legge le righe
-- di hr_documenti, che la RLS dà solo a chi ha can_view_persone.
--
-- Rilanciabile: DROP POLICY IF EXISTS + CREATE POLICY. Le altre policy del
-- bucket e le RESTRICTIVE di altri bucket non si toccano.

set local lock_timeout = '3s';

-- ── Guardia: la policy è ancora quella censita e la lettura propria c'è ─────
do $guardia$
declare
  v_testo text;
begin
  select coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '#' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
    into v_testo
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relname = 'objects' and p.polname = 'hr_doc_storage_admin';
  if not found then
    raise exception 'Policy storage.objects «hr_doc_storage_admin» non trovata: la migrazione va rivista';
  end if;
  -- O è quella larga di prima (company_staff) o è già quella nuova (can_view_persone).
  if v_testo !~ 'company_staff' and v_testo !~ 'can_view_persone' then
    raise exception 'Policy storage.objects «hr_doc_storage_admin» cambiata dopo il censimento: la migrazione va rivista';
  end if;
  if not exists (
    select 1 from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'storage' and c.relname = 'objects' and p.polname = 'hr_doc_storage_self_read'
  ) then
    raise exception 'Manca «hr_doc_storage_self_read»: il lavoratore non aprirebbe più i propri documenti';
  end if;
end
$guardia$;

-- ── La policy: stessa forma di prima, senza company_staff ───────────────────
drop policy if exists hr_doc_storage_admin on storage.objects;
create policy hr_doc_storage_admin on storage.objects
  for all to authenticated
  using (
    bucket_id = 'hr-documenti'
    and (storage.foldername(name))[1] = ((select public.get_my_company_id()))::text
    and (
      (select public.e_amministratore_di((select public.get_my_company_id())))
      or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
      or (select public.has_permission_for_company((select auth.uid()), 'can_view_persone', (select public.get_my_company_id())))
    )
  )
  with check (
    bucket_id = 'hr-documenti'
    and (storage.foldername(name))[1] = ((select public.get_my_company_id()))::text
    and (
      (select public.e_amministratore_di((select public.get_my_company_id())))
      or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
      or (select public.has_permission_for_company((select auth.uid()), 'can_view_persone', (select public.get_my_company_id())))
    )
  );

-- ── Verifica: la policy scritta dal database è quella voluta ────────────────
do $verifica$
declare
  v_testo text;
begin
  select coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '#' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
    into v_testo
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relname = 'objects' and p.polname = 'hr_doc_storage_admin';
  if v_testo ~ 'company_staff'
     or v_testo !~ 'has_permission_for_company'
     or v_testo !~ 'can_view_persone'
     or v_testo !~ 'e_amministratore_di'
     or v_testo !~ 'super_admin' then
    raise exception 'hr_doc_storage_admin non è come previsto: %', v_testo;
  end if;
end
$verifica$;
