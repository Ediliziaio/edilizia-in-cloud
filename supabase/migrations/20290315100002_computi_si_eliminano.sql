-- I computi si possono eliminare (12/11/2026).
--
-- computo_preventivo_drafts aveva le regole per leggere, creare e modificare, ma nessuna per
-- eliminare: dall'elenco dei preventivi un computo non si toglieva, nemmeno da un amministratore,
-- e chi ne creava uno per sbaglio se lo teneva. Ora lo elimina chi può modificare i preventivi e
-- vede quel computo: la stessa regola della modifica.
-- permesso computo_preventivo_drafts: has_permission via aziende_con_permesso('can_edit_preventivi')
set local lock_timeout = '3s';
set local statement_timeout = '60s';

drop policy if exists computo_drafts_delete on public.computo_preventivo_drafts;
create policy computo_drafts_delete on public.computo_preventivo_drafts for delete to authenticated
using (
  not (select public.utente_bloccato())
  and (
    (select public.has_role(auth.uid(), 'super_admin'::public.app_role))
    or (company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi')))
        and public.check_staff_visibility(auth.uid(), created_by))
  )
);
grant delete on public.computo_preventivo_drafts to authenticated;
