-- I computi della commessa si vedono come la commessa (14/11/2026).
--
-- Le regole di computo_uploads, computo_voci_estratte e computo_voci_misure
-- guardavano solo l'azienda del profilo. Due difetti, trovati provando «Genera
-- dal computo» su Demo Azienda 2:
--   1. un dipendente con «solo commesse assegnate» non vedeva la commessa né le
--      sue fasi, ma ne vedeva il computo, con importi e prezzi;
--   2. il super admin in «Vista come» non vedeva i computi, mentre vede commesse
--      e fasi (le loro regole hanno il super admin, queste no).
--
-- Regola restrittiva: un computo con order_id si vede e si scrive solo se la
-- commessa è visibile a chi chiede, cioè passa le regole di orders (assegnazione,
-- diritti sugli importi, super admin): una sottoquery sola per query, non una
-- funzione per riga. I computi senza commessa (preventivi, libreria) restano come
-- prima. Voci e misure seguono il loro computo. Più una regola permissiva per il
-- super admin, come su orders e order_work_phases.
--
-- Idempotente; lock_timeout corto: tabelle piccole, meglio fallire che aspettare.
set local lock_timeout = '3s';

-- computo_uploads
drop policy if exists computo_uploads_commessa_visibile on public.computo_uploads;
create policy computo_uploads_commessa_visibile on public.computo_uploads
  as restrictive for all to authenticated
  using (order_id is null or order_id in (select o.id from public.orders o))
  with check (order_id is null or order_id in (select o.id from public.orders o));

drop policy if exists computo_uploads_super_admin on public.computo_uploads;
create policy computo_uploads_super_admin on public.computo_uploads
  for all to authenticated
  using ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)))
  with check ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)));

-- computo_voci_estratte: si vede la voce se si vede il suo computo
drop policy if exists computo_voci_computo_visibile on public.computo_voci_estratte;
create policy computo_voci_computo_visibile on public.computo_voci_estratte
  as restrictive for all to authenticated
  using (computo_upload_id in (select u.id from public.computo_uploads u))
  with check (computo_upload_id in (select u.id from public.computo_uploads u));

drop policy if exists computo_voci_super_admin on public.computo_voci_estratte;
create policy computo_voci_super_admin on public.computo_voci_estratte
  for all to authenticated
  using ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)))
  with check ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)));

-- computo_voci_misure: si vede la misura se si vede la sua voce
drop policy if exists computo_voci_misure_voce_visibile on public.computo_voci_misure;
create policy computo_voci_misure_voce_visibile on public.computo_voci_misure
  as restrictive for all to authenticated
  using (voce_id in (select v.id from public.computo_voci_estratte v))
  with check (voce_id in (select v.id from public.computo_voci_estratte v));

drop policy if exists computo_voci_misure_super_admin on public.computo_voci_misure;
create policy computo_voci_misure_super_admin on public.computo_voci_misure
  for all to authenticated
  using ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)))
  with check ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)));
