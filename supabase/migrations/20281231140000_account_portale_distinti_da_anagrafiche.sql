-- I messaggi e il registro delle comunicazioni appartengono all'anagrafica,
-- non al login. Rimuovere un account portale non deve cancellarli.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
alter table public.customer_messages drop constraint if exists customer_messages_customer_id_fkey;
alter table public.customer_messages add constraint customer_messages_customer_id_fkey
  foreign key(customer_id) references public.profiles(id) on delete cascade;
alter table public.customer_messages drop constraint if exists customer_messages_sender_id_fkey;
alter table public.customer_messages add constraint customer_messages_sender_id_fkey
  foreign key(sender_id) references public.profiles(id) on delete cascade;
alter table public.lifecycle_email_sends drop constraint if exists lifecycle_email_sends_user_id_fkey;
alter table public.lifecycle_email_sends add constraint lifecycle_email_sends_user_id_fkey
  foreign key(user_id) references public.profiles(id) on delete cascade;

-- La directory Utenti conta gli account di login, non le anagrafiche senza Auth.
-- Preserva firma, controlli staff, ricerca, filtri, permessi e ordinamento esistenti.
do $$
declare definizione text;
begin
 select pg_get_functiondef('public.admin_search_users(text,text,uuid,text,integer,integer)'::regprocedure) into definizione;
 if position('JOIN auth.users account_login ON account_login.id = p.id' in definizione) = 0 then
   if position('FROM public.profiles p' in definizione) = 0 then
     raise exception 'Directory utenti modificata: verificare la funzione prima di migrare';
   end if;
   definizione := replace(definizione, 'FROM public.profiles p',
     'FROM public.profiles p JOIN auth.users account_login ON account_login.id = p.id');
   execute definizione;
 end if;
end $$;
