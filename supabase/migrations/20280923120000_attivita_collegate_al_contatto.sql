-- Un'attività legata a un'opportunità porta SEMPRE con sé il suo contatto.
--
-- 23/09/2026 — Elena (Ener Italia) ha creato «RICHIAMARE» per l'opportunità di
-- un cliente e se l'è ritrovata senza cliente: nell'app il collegamento veniva
-- buttato via quando non combaciava con la categoria. Quello è stato sistemato
-- nel frontend, ma le attività le scrivono anche le automazioni, l'assistente
-- AI, l'API della piattaforma e le importazioni: la regola sta qui, così vale
-- per tutti quanti, oggi e per chi arriverà dopo.
--
-- Solo in questa direzione: un'opportunità ha UN contatto, mentre un contatto
-- può avere più opportunità e indovinare quale sarebbe inventare un dato.

create or replace function public.attivita_contatto_dell_opportunita()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.opportunity_id is not null and new.contact_id is null then
    select o.contact_id into new.contact_id
      from public.marketing_opportunities o
     where o.id = new.opportunity_id;
  end if;
  return new;
end;
$$;

comment on function public.attivita_contatto_dell_opportunita() is
  'Riempie tasks.contact_id con il contatto dell''opportunità collegata quando manca (23/09/2026).';

-- Le funzioni di trigger non hanno bisogno di EXECUTE: il privilegio non viene
-- controllato allo scatto.
revoke all on function public.attivita_contatto_dell_opportunita() from public, anon;

drop trigger if exists trg_attivita_contatto_dell_opportunita on public.tasks;
create trigger trg_attivita_contatto_dell_opportunita
  before insert or update of opportunity_id, contact_id on public.tasks
  for each row execute function public.attivita_contatto_dell_opportunita();

-- Bonifica delle attività già nate senza contatto (23 al momento della stesura):
-- meglio fallire in fretta che tenere un lock sulla tabella.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

update public.tasks t
   set contact_id = o.contact_id
  from public.marketing_opportunities o
 where t.opportunity_id = o.id
   and t.contact_id is null
   and o.contact_id is not null;
