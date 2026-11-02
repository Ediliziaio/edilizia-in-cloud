-- Autore delle commesse già esistenti, su richiesta di Florin (02/11/2026): chi ha registrato il primo
-- stato, se è avvenuto entro un giorno dalla creazione. Un cambio più tardi dice chi l'ha toccata, non
-- chi l'ha creata: quelle restano vuote, come le commesse senza storico.
-- A trigger spenti: su orders ce ne sono 21, tra automazioni, notifiche e sincronia col calendario.
-- Si scrive solo dove manca, quindi rilanciarla non cambia niente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
set local session_replication_role = replica;

with autori as (
  select v.id, h.changed_by
    from public.orders v
    cross join lateral (
      select s.changed_by, s.changed_at
        from public.order_status_history s
       where s.order_id = v.id and s.changed_by is not null
       order by s.changed_at asc nulls last, s.id asc
       limit 1
    ) h
   where v.created_by is null
     and abs(extract(epoch from h.changed_at - v.created_at)) < 86400
     and exists (select 1 from auth.users u where u.id = h.changed_by)
)
update public.orders o
   set created_by = a.changed_by
  from autori a
 where o.id = a.id and o.created_by is null;
