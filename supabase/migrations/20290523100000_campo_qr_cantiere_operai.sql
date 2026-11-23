-- Documenti del QR di cantiere anche nell'app dell'operaio (richiesta del founder, 23/11/2026).
-- L'ufficio sceglie quali documenti vanno sul cartello col QR (commessa_qr_cantiere). Chi lavora su quel
-- cantiere deve poterli vedere anche dall'app, senza inquadrare il cartello. Il codice del QR lo legge solo:
-- chi ha fatto l'accesso, è assegnato al cantiere (o ne è capocantiere/tecnico), nella sua azienda, non bloccato
-- e non cliente esterno. I documenti poi si aprono dalla stessa funzione della pagina pubblica del QR
-- (documenti-cantiere), con la stessa selezione: all'operaio non arriva niente che il cartello non mostri già.
create or replace function public.campo_qr_cantiere_token(p_ordine uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select q.token
  from public.commessa_qr_cantiere q
  join public.orders o on o.id = q.order_id
  where q.order_id = p_ordine
    and o.deleted_at is null
    and auth.uid() is not null
    and o.company_id = public.get_effective_company_id()
    and not public.utente_bloccato()
    and not public.utente_e_cliente_esterno()
    and (
      exists (select 1 from public.order_campo_assignments a
              where a.order_id = o.id and a.company_id = o.company_id and a.user_id = auth.uid())
      or coalesce(private.campo_scheda_visibile(o.company_id, o.id), false)
    )
  limit 1;
$$;

revoke all on function public.campo_qr_cantiere_token(uuid) from public, anon;
grant execute on function public.campo_qr_cantiere_token(uuid) to authenticated;
