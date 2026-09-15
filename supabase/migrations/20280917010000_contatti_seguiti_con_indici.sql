-- «Quali contatti segue questo utente?» senza leggere tutte le opportunità.
--
-- contatti_seguiti_da_me() è dentro le regole di lettura di marketing_contacts
-- (vedere e modificare) e di marketing_contact_notes: la chiama ogni richiesta
-- di chi ha «vede solo i propri» (call center, venditori). Cercava l'utente con
-- `uid IN (assigned_to, call_center_id, follower_id)`: su call_center_id e
-- follower_id non c'era nessun indice, quindi ogni volta una lettura completa
-- delle ~38.000 opportunità. Il 15/09/2026, nell'ora dopo il riavvio, 627 letture
-- complete; sul database Micro erano parte del carico che lo ha bloccato.
--
-- Ora: tre indici parziali (utente, contatto) e tre ricerche unite, ognuna sul
-- suo indice. Risultato verificato identico alla versione precedente per tutti
-- gli utenti che hanno opportunità, prima di applicarla.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create index if not exists idx_mkt_opp_assegnato_contatto
  on public.marketing_opportunities (assigned_to, contact_id)
  where deleted_at is null and assigned_to is not null;

create index if not exists idx_mkt_opp_call_center_contatto
  on public.marketing_opportunities (call_center_id, contact_id)
  where deleted_at is null and call_center_id is not null;

create index if not exists idx_mkt_opp_follower_contatto
  on public.marketing_opportunities (follower_id, contact_id)
  where deleted_at is null and follower_id is not null;

create or replace function public.contatti_seguiti_da_me()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.contact_id from public.marketing_opportunities o
   where o.assigned_to = (select auth.uid()) and o.deleted_at is null and o.contact_id is not null
  union
  select o.contact_id from public.marketing_opportunities o
   where o.call_center_id = (select auth.uid()) and o.deleted_at is null and o.contact_id is not null
  union
  select o.contact_id from public.marketing_opportunities o
   where o.follower_id = (select auth.uid()) and o.deleted_at is null and o.contact_id is not null;
$$;

revoke all on function public.contatti_seguiti_da_me() from public, anon;
grant execute on function public.contatti_seguiti_da_me() to authenticated, service_role;
