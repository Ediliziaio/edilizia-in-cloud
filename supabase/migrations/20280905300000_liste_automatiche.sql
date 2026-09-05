-- Liste che si popolano da sole.
--
-- Prima d'ora una lista era una fotografia: la riempivi una volta e da lì in poi
-- invecchiava. Un contatto nuovo non ci entrava, uno che si disiscriveva non ne
-- usciva. Qui una lista puo' avere una REGOLA: da quel momento l'appartenenza
-- non si gestisce piu' a mano, la decide la regola ogni volta che il contatto
-- cambia.

alter table public.marketing_contact_lists
  add column if not exists regola jsonb,
  add column if not exists regola_aggiornata_il timestamptz;

comment on column public.marketing_contact_lists.regola is
  'Se valorizzata la lista e'' automatica: gli iscritti li decide questa regola, non le aggiunte a mano.';

-- ── La regola, letta su un contatto ────────────────────────────────────────
-- Vocabolario chiuso: nessuna SQL scritta a mano finisce qui dentro.
create or replace function public.contatto_corrisponde_regola(
  c public.marketing_contacts, regola jsonb
) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_tipo text := regola->>'tipo';
begin
  if regola is null or v_tipo is null then return false; end if;
  if c.deleted_at is not null then return false; end if;

  case v_tipo
    when 'tag' then
      return c.tags @> array[regola->>'tag'];

    when 'fonte' then
      return c.source = any (select jsonb_array_elements_text(regola->'valori'));

    when 'fatturato_minimo' then
      return c.fatturato is not null and c.fatturato >= (regola->>'euro')::numeric;

    when 'email_contattabile' then
      return coalesce(c.email,'') <> ''
         and not coalesce(c.unsubscribed,false)
         and not coalesce(c.optout_email,false);

    when 'solo_telefono' then
      return coalesce(c.email,'') = '' and coalesce(c.phone,'') <> '';

    when 'senza_contatti' then
      return coalesce(c.email,'') = '' and coalesce(c.phone,'') = ''
         and (not coalesce((regola->>'con_piva')::boolean, false) or c.vat_number is not null)
         and (not coalesce((regola->>'con_sito')::boolean, false) or coalesce(c.website,'') <> '');

    when 'campo_personalizzato' then
      return exists (
        select 1 from marketing_contact_field_values fv
        join marketing_custom_fields f on f.id = fv.field_id
        where fv.contact_id = c.id
          and f.company_id = c.company_id
          and f.name = regola->>'campo'
          and f.deleted_at is null
          and fv.value = any (select jsonb_array_elements_text(regola->'valori'))
      );

    else
      return false;
  end case;
end $$;

revoke all on function public.contatto_corrisponde_regola(public.marketing_contacts, jsonb) from public, anon, authenticated;

-- ── Rifare da capo una lista automatica ────────────────────────────────────
create or replace function public.sincronizza_lista(p_lista uuid)
returns table (aggiunti integer, rimossi integer)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_regola jsonb; v_azienda uuid; v_agg integer := 0; v_rim integer := 0;
begin
  select regola, company_id into v_regola, v_azienda
  from marketing_contact_lists where id = p_lista;
  if v_regola is null then return query select 0, 0; return; end if;

  with candidati as (
    select c.id from marketing_contacts c
    where c.company_id = v_azienda and c.deleted_at is null
      and public.contatto_corrisponde_regola(c, v_regola)
  ),
  nuovi as (
    insert into marketing_contact_list_members (list_id, contact_id)
    select p_lista, id from candidati
    on conflict do nothing
    returning 1
  )
  select count(*) into v_agg from nuovi;

  with fuori as (
    delete from marketing_contact_list_members m
    using marketing_contacts c
    where m.list_id = p_lista and c.id = m.contact_id
      and not public.contatto_corrisponde_regola(c, v_regola)
    returning 1
  )
  select count(*) into v_rim from fuori;

  -- iscritti rimasti orfani (contatto cancellato del tutto)
  delete from marketing_contact_list_members m
  where m.list_id = p_lista
    and not exists (select 1 from marketing_contacts c where c.id = m.contact_id);

  update marketing_contact_lists set regola_aggiornata_il = now(), updated_at = now() where id = p_lista;
  return query select v_agg, v_rim;
end $$;

revoke all on function public.sincronizza_lista(uuid) from public, anon, authenticated;

-- Versione richiamabile dall'app: solo per chi ha accesso a quell'azienda.
create or replace function public.risincronizza_liste_azienda(p_azienda uuid)
returns table (lista text, aggiunti integer, rimossi integer)
language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.assert_company_access(p_azienda);
  return query
    select l.name, s.aggiunti, s.rimossi
    from marketing_contact_lists l
    cross join lateral public.sincronizza_lista(l.id) s
    where l.company_id = p_azienda and l.regola is not null
    order by l.name;
end $$;

revoke all on function public.risincronizza_liste_azienda(uuid) from public, anon;
grant execute on function public.risincronizza_liste_azienda(uuid) to authenticated, service_role;

-- ── Il contatto entra ed esce da solo ──────────────────────────────────────
create or replace function public.aggiorna_liste_del_contatto()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  r record; v_dentro boolean;
begin
  for r in
    select id, regola from marketing_contact_lists
    where company_id = NEW.company_id and regola is not null
  loop
    v_dentro := public.contatto_corrisponde_regola(NEW, r.regola);
    if v_dentro then
      insert into marketing_contact_list_members (list_id, contact_id)
      values (r.id, NEW.id) on conflict do nothing;
    else
      delete from marketing_contact_list_members
      where list_id = r.id and contact_id = NEW.id;
    end if;
  end loop;
  return NEW;
end $$;

drop trigger if exists trg_liste_automatiche on public.marketing_contacts;
create trigger trg_liste_automatiche
  after insert or update of tags, email, phone, website, vat_number, fatturato,
                            source, unsubscribed, optout_email, deleted_at, company_id
  on public.marketing_contacts
  for each row execute function public.aggiorna_liste_del_contatto();

-- Anche i campi personalizzati muovono le liste (es. "WhatsApp verificato").
create or replace function public.aggiorna_liste_da_campo_personalizzato()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  -- Su DELETE la riga NEW non esiste proprio: leggerla solleverebbe un errore
  -- e il trigger farebbe fallire ogni cancellazione di un valore.
  v_contatto uuid := case when TG_OP = 'DELETE' then OLD.contact_id else NEW.contact_id end;
  c public.marketing_contacts%rowtype;
  r record;
begin
  select * into c from marketing_contacts where id = v_contatto;
  if not found then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  for r in
    select id, regola from marketing_contact_lists
    where company_id = c.company_id and regola->>'tipo' = 'campo_personalizzato'
  loop
    if public.contatto_corrisponde_regola(c, r.regola) then
      insert into marketing_contact_list_members (list_id, contact_id)
      values (r.id, c.id) on conflict do nothing;
    else
      delete from marketing_contact_list_members where list_id = r.id and contact_id = c.id;
    end if;
  end loop;
  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end $$;

drop trigger if exists trg_liste_automatiche_campi on public.marketing_contact_field_values;
create trigger trg_liste_automatiche_campi
  after insert or update or delete on public.marketing_contact_field_values
  for each row execute function public.aggiorna_liste_da_campo_personalizzato();

-- Il trigger interroga le liste dell'azienda a ogni riga: senza indice
-- diventerebbe una scansione per ogni contatto salvato.
create index if not exists idx_liste_con_regola
  on public.marketing_contact_lists (company_id) where regola is not null;
