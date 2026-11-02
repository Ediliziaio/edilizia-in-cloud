-- Chi segnala un problema dal cantiere può allegare la foto al suo ticket.
-- Vale solo per il ticket aperto da lui dal campo: i messaggi degli altri ticket restano chiusi.
-- L'operaio non può rileggere i ticket: la verifica passa da una funzione, non dalla sua lettura.
create or replace function public.campo_ticket_mio(p_ticket_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.tickets t
                  where t.id = p_ticket_id and t.created_by = auth.uid() and t.fonte = 'campo')
$$;
revoke all on function public.campo_ticket_mio(uuid) from public, anon;
grant execute on function public.campo_ticket_mio(uuid) to authenticated;

drop policy if exists tickets_campo_messaggio_autore on public.ticket_messages;
create policy tickets_campo_messaggio_autore on public.ticket_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.campo_ticket_mio(ticket_messages.ticket_id)
  );
