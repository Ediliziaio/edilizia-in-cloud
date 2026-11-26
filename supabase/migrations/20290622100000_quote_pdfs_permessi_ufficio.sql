set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- I PDF dei preventivi sono riservati all'ufficio. Le regole qp_* limitavano
-- solo il prefisso azienda: un operaio della stessa azienda poteva leggere
-- e riscrivere un PDF conoscendone il percorso. Queste guardie si aggiungono
-- alle regole esistenti, senza ampliare aziende, ruoli o copie firmate.
drop policy if exists quote_pdf_ufficio_lettura on storage.objects;
create policy quote_pdf_ufficio_lettura on storage.objects
as restrictive for select to authenticated
using (
  bucket_id <> 'quote-pdfs'
  or (
    not (select public.utente_bloccato())
    and not (select public.e_solo_campo())
    and not (select public.utente_e_cliente_esterno())
    and (
      (select public.utente_super_admin())
      or (select public.get_my_company_id()) in (
        select unnest(public.aziende_con_uno_dei_permessi(array['can_view_preventivi','can_view_orders']))
      )
    )
  )
);

drop policy if exists quote_pdf_ufficio_caricamento on storage.objects;
create policy quote_pdf_ufficio_caricamento on storage.objects
as restrictive for insert to authenticated
with check (
  bucket_id <> 'quote-pdfs'
  or (
    not (select public.utente_bloccato())
    and not (select public.e_solo_campo())
    and not (select public.utente_e_cliente_esterno())
    and not public.utente_sola_lettura((select public.get_my_company_id()))
    and (select public.get_my_company_id()) in (
      select unnest(public.aziende_con_permesso('can_edit_preventivi'))
    )
  )
);

drop policy if exists quote_pdf_ufficio_modifica on storage.objects;
create policy quote_pdf_ufficio_modifica on storage.objects
as restrictive for update to authenticated
using (
  bucket_id <> 'quote-pdfs'
  or (
    not (select public.utente_bloccato())
    and not (select public.e_solo_campo())
    and not (select public.utente_e_cliente_esterno())
    and not public.utente_sola_lettura((select public.get_my_company_id()))
    and (select public.get_my_company_id()) in (
      select unnest(public.aziende_con_permesso('can_edit_preventivi'))
    )
  )
)
with check (
  bucket_id <> 'quote-pdfs'
  or (
    not (select public.utente_bloccato())
    and not (select public.e_solo_campo())
    and not (select public.utente_e_cliente_esterno())
    and not public.utente_sola_lettura((select public.get_my_company_id()))
    and (select public.get_my_company_id()) in (
      select unnest(public.aziende_con_permesso('can_edit_preventivi'))
    )
  )
);

drop policy if exists quote_pdf_ufficio_eliminazione on storage.objects;
create policy quote_pdf_ufficio_eliminazione on storage.objects
as restrictive for delete to authenticated
using (
  bucket_id <> 'quote-pdfs'
  or (
    not (select public.utente_bloccato())
    and not (select public.e_solo_campo())
    and not (select public.utente_e_cliente_esterno())
    and not public.utente_sola_lettura((select public.get_my_company_id()))
    and (select public.get_my_company_id()) in (
      select unnest(public.aziende_con_permesso('can_edit_preventivi'))
    )
  )
);
