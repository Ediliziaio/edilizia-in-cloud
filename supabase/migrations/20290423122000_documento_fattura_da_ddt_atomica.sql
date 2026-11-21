-- Il blocco sul DDT serializza anche due browser o un nuovo invio dopo un timeout.
create or replace function public.documento_fattura_da_ddt(
  p_company_id uuid, p_ddt_id uuid, p_dati jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ddt public.documenti_fiscali%rowtype;
  v_fattura uuid;
  v_candidate uuid[];
  v_riferimenti jsonb;
  v_creato jsonb;
begin
  if public.user_can_access_company(p_company_id) is not true
     or public.puo_gestire_documento_fiscale(p_company_id, 'fattura') is not true then
    raise exception 'Non hai il permesso di creare fatture.' using errcode = '42501';
  end if;

  select * into v_ddt from public.documenti_fiscali
   where id = p_ddt_id and company_id = p_company_id and tipo = 'ddt'
     and deleted_at is null and stato is distinct from 'annullata'
   for update;
  if not found then
    raise exception 'DDT non disponibile.' using errcode = 'P0002';
  end if;

  select id into v_fattura from public.documenti_fiscali
   where id = v_ddt.ddt_fattura_id and company_id = p_company_id
     and tipo in ('fattura', 'fattura_pa', 'fattura_riepilogativa')
     and deleted_at is null and stato <> 'annullata';
  if found then
    return jsonb_build_object('id', v_fattura, 'riutilizzata', true);
  end if;

  v_riferimenti := jsonb_build_array(jsonb_build_object('numero', v_ddt.numero, 'data', v_ddt.data_emissione));
  -- Le vecchie bozze potevano avere solo il numero e la data del DDT nell'XML.
  select array_agg(id) into v_candidate from (
    select f.id from public.documenti_fiscali f
     where f.company_id = p_company_id
       and f.tipo in ('fattura', 'fattura_pa', 'fattura_riepilogativa')
       and f.deleted_at is null and f.stato <> 'annullata'
       and (f.documento_correlato_id = v_ddt.id
         or (v_ddt.numero is not null and v_ddt.data_emissione is not null and f.riferimenti_ddt @> v_riferimenti))
     limit 2
  ) candidate;
  if cardinality(v_candidate) > 1 then
    raise exception 'Più fatture riportano questo DDT. Verifica i collegamenti prima di procedere.' using errcode = 'P0001';
  end if;

  if v_candidate[1] is not null then
    v_fattura := v_candidate[1];
    v_creato := jsonb_build_object('id', v_fattura, 'riutilizzata', true);
  else
    if v_ddt.ddt_fatturato then
      raise exception 'Il DDT risulta già fatturato. Verifica la fattura collegata.' using errcode = 'P0001';
    end if;
    if jsonb_typeof(p_dati) is distinct from 'object' then
      raise exception 'Dati della fattura mancanti.' using errcode = '22023';
    end if;
    v_creato := public.documento_crea(p_company_id,
      (p_dati - 'ddt_fattura_id' - 'ddt_fatturato') ||
      jsonb_build_object('tipo', 'fattura', 'documento_correlato_id', v_ddt.id, 'riferimenti_ddt', v_riferimenti));
    v_fattura := (v_creato->>'id')::uuid;
  end if;

  update public.documenti_fiscali set ddt_fattura_id = v_fattura, updated_at = now()
   where id = v_ddt.id and company_id = p_company_id;
  if not found then
    raise exception 'Collegamento al DDT non confermato.';
  end if;
  return v_creato;
end;
$$;
revoke all on function public.documento_fattura_da_ddt(uuid, uuid, jsonb) from public, anon;
grant execute on function public.documento_fattura_da_ddt(uuid, uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
