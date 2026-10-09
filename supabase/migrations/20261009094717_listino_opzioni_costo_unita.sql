-- Atomic option edits: tenant + permission checks, row locks and rollback on failure.
create or replace function public.listino_salva_opzioni(
  p_family_id uuid, p_axis_id uuid, p_value_id uuid, p_patch jsonb,
  p_value_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path = public
set lock_timeout = '5s' as $fn$
declare
  v_company uuid; v_axis public.article_family_axes%rowtype;
  v_row public.article_family_axis_values%rowtype; v_id uuid; v_count int := 0;
  v_ids uuid[]; v_bulk boolean := p_value_ids is not null;
begin
  select company_id into v_company from public.article_families
    where id=p_family_id and deleted_at is null;
  if auth.uid() is null or v_company is null or
    not public.has_permission_for_company(auth.uid(), 'can_edit_settings_pricing', v_company) then
    raise exception 'Non puoi modificare le opzioni di questa azienda' using errcode='42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then
    raise exception 'Modifica vuota o non valida';
  end if;
  if exists(select 1 from jsonb_object_keys(p_patch) k where k not in
    ('valore','label','descrizione','is_default','maggiorazione_tipo','maggiorazione_valore',
     'maggiorazione_acquisto','sort_order','attivo','codice','prezzo_vendita','prezzo_acquisto','opzioni')) then
    raise exception 'Campo opzione non ammesso';
  end if;
  if v_bulk then
    if cardinality(p_value_ids) not between 1 and 300 or p_axis_id is not null or p_value_id is not null or
      exists(select 1 from jsonb_object_keys(p_patch) k where k not in
        ('attivo','maggiorazione_tipo','maggiorazione_valore','maggiorazione_acquisto')) then
      raise exception 'Modifica multipla non valida';
    end if;
    select array_agg(distinct x) into v_ids from unnest(p_value_ids) x;
    if (select count(*) from public.article_family_axis_values v
      join public.article_family_axes a on a.id=v.axis_id
      where v.id=any(v_ids) and a.family_id=p_family_id and a.company_id=v_company and v.company_id=v_company)
      <> cardinality(v_ids) then raise exception 'Selezione estranea al prodotto' using errcode='42501'; end if;
    perform 1 from public.article_family_axes a where a.id in
      (select axis_id from public.article_family_axis_values where id=any(v_ids)) order by a.id for update;
  else
    select * into v_axis from public.article_family_axes
      where id=p_axis_id and family_id=p_family_id and company_id=v_company for update;
    if not found then raise exception 'Opzione estranea al prodotto' using errcode='42501'; end if;
    v_ids:=array[coalesce(p_value_id,gen_random_uuid())];
  end if;
  foreach v_id in array v_ids loop
    if v_bulk or p_value_id is not null then
      select * into v_row from public.article_family_axis_values
        where id=v_id and company_id=v_company for update;
      if not found or (not v_bulk and v_row.axis_id<>p_axis_id) then
        raise exception 'Scelta estranea al prodotto' using errcode='42501';
      end if;
    else
      v_row:=null; v_row.id:=v_id; v_row.axis_id:=p_axis_id; v_row.company_id:=v_company;
      v_row.is_default:=false; v_row.attivo:=true; v_row.sort_order:=0;
      v_row.maggiorazione_tipo:='none'; v_row.maggiorazione_valore:=0;
      v_row.maggiorazione_acquisto:=0; v_row.opzioni:='[]'::jsonb; v_row.created_at:=now();
    end if;
    if v_bulk and p_patch ? 'maggiorazione_tipo' and not (p_patch ? 'maggiorazione_acquisto')
      and p_patch->>'maggiorazione_tipo' <> v_row.maggiorazione_tipo
      and v_row.maggiorazione_acquisto <> 0 then
      raise exception 'Cambio di unità: specifica il nuovo costo fornitore';
    end if;
    v_row:=jsonb_populate_record(v_row,p_patch);
    if coalesce(btrim(v_row.label),'')='' or coalesce(btrim(v_row.valore),'')='' or
      v_row.attivo is null or v_row.is_default is null or
      (v_row.is_default and not v_row.attivo) then raise exception 'La scelta predefinita deve essere attiva e avere un nome'; end if;
    if v_row.maggiorazione_tipo not in ('none','percentuale','fisso_pz','fisso_mq','fisso_ml','fisso_mc') or
      v_row.maggiorazione_tipo is null or v_row.maggiorazione_valore is null or v_row.maggiorazione_acquisto is null or
      v_row.maggiorazione_valore::text in ('NaN','Infinity','-Infinity') or
      v_row.maggiorazione_acquisto::text in ('NaN','Infinity','-Infinity') or
      (v_row.maggiorazione_tipo='percentuale' and least(v_row.maggiorazione_valore,v_row.maggiorazione_acquisto)<-100) or
      (v_row.maggiorazione_tipo='none' and (v_row.maggiorazione_valore<>0 or v_row.maggiorazione_acquisto<>0)) then
      raise exception 'Supplemento non valido';
    end if;
    if v_row.prezzo_vendita<0 or v_row.prezzo_acquisto<0 or
      v_row.prezzo_vendita::text in ('NaN','Infinity','-Infinity') or
      v_row.prezzo_acquisto::text in ('NaN','Infinity','-Infinity') then raise exception 'Prezzo non valido'; end if;
    if v_row.is_default and not v_bulk then
      update public.article_family_axis_values set is_default=false
        where axis_id=v_row.axis_id and company_id=v_company and id<>v_row.id and is_default;
    end if;
    insert into public.article_family_axis_values select (v_row).*
      on conflict(id) do update set
        valore=excluded.valore,label=excluded.label,descrizione=excluded.descrizione,
        is_default=excluded.is_default,attivo=excluded.attivo,sort_order=excluded.sort_order,
        maggiorazione_tipo=excluded.maggiorazione_tipo,maggiorazione_valore=excluded.maggiorazione_valore,
        maggiorazione_acquisto=excluded.maggiorazione_acquisto,codice=excluded.codice,
        prezzo_vendita=excluded.prezzo_vendita,prezzo_acquisto=excluded.prezzo_acquisto,opzioni=excluded.opzioni;
    v_count:=v_count+1;
  end loop;
  if exists(select 1 from public.article_family_axes a where a.family_id=p_family_id
      and a.id in (select axis_id from public.article_family_axis_values where id=any(v_ids))
      and a.obbligatorio and not exists(select 1 from public.article_family_axis_values v
        where v.axis_id=a.id and v.attivo and v.is_default)) then
    raise exception 'Mantieni una scelta predefinita attiva per ogni opzione obbligatoria';
  end if;
  return jsonb_build_object('aggiornati',v_count);
end;
$fn$;
revoke all on function public.listino_salva_opzioni(uuid,uuid,uuid,jsonb,uuid[]) from public,anon;
grant execute on function public.listino_salva_opzioni(uuid,uuid,uuid,jsonb,uuid[]) to authenticated;

