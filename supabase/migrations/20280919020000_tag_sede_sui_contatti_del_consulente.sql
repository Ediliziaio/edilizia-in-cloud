-- Il contatto creato a mano da chi lavora in uno showroom nasce col tag della
-- sede: «showroom lissone», «showroom inverigo», e così via.
--
-- Richiesta di Il Bagno Group (18/09/2026): i clienti che passano in showroom
-- li inserisce il consulente, e devono restare riconoscibili — uno per sede,
-- non un unico «showroom», così si può guardare l'andamento di ogni negozio.
--
-- Vale solo per chi una sede ce l'ha: Vincenzo lavora a domicilio, i suoi
-- contatti restano senza tag. E non tocca chi arriva da import, automazioni o
-- form del sito: lì `created_by` è vuoto o è un altro utente.

alter table public.companies
  add column if not exists contatti_tag_sede boolean not null default false;

comment on column public.companies.contatti_tag_sede is
  'I contatti creati a mano da chi lavora in una sede prendono il tag showroom <sede>.';

create or replace function public.tag_sede_del_contatto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_attivo boolean;
  v_autore uuid;
  v_sede   text;
  v_tag    text;
begin
  select c.contatti_tag_sede into v_attivo from companies c where c.id = new.company_id;
  if not coalesce(v_attivo, false) then
    return new;
  end if;

  v_autore := coalesce(new.created_by, auth.uid());
  if v_autore is null then
    return new;
  end if;

  select s.nome into v_sede
  from company_sedi_utenti u
  join company_sedi s on s.id = u.sede_id
  where u.company_id = new.company_id and u.user_id = v_autore and s.attiva;

  if v_sede is null then
    return new;
  end if;

  v_tag := 'showroom ' || lower(btrim(v_sede));

  -- Se un tag showroom c'è già (import, unione, scelta a mano) non si tocca.
  if exists (select 1 from unnest(coalesce(new.tags, '{}'::text[])) t where lower(t) like 'showroom%') then
    return new;
  end if;

  new.tags := array_append(coalesce(new.tags, '{}'::text[]), v_tag);
  return new;
end
$$;

drop trigger if exists trg_tag_sede_contatto on public.marketing_contacts;
create trigger trg_tag_sede_contatto
  before insert on public.marketing_contacts
  for each row execute function public.tag_sede_del_contatto();

do $$
declare v_az uuid;
begin
  select id into v_az from companies where lower(name) = 'il bagno group' limit 1;
  if v_az is not null then
    update companies set contatti_tag_sede = true where id = v_az;
  end if;
end
$$;
