-- Chi segnala un problema dal cantiere può allegare la foto al suo ticket.
-- Vale solo per il ticket aperto da lui dal campo: i messaggi degli altri ticket restano chiusi.
drop policy if exists tickets_campo_messaggio_autore on public.ticket_messages;
create policy tickets_campo_messaggio_autore on public.ticket_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.tickets t
       where t.id = ticket_messages.ticket_id
         and t.created_by = (select auth.uid())
         and t.fonte = 'campo'
    )
  );
