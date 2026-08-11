-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

create or replace function public.get_contact_tracking(p_contact_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_email text;
  v_phone_digits text;
  v_meta_lead_id text;
  v_contact jsonb;
  v_submissions jsonb;
  v_events jsonb;
begin
  select company_id,
         lower(nullif(trim(email), '')),
         nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), ''),
         nullif(trim(meta_lead_id), '')
    into v_company, v_email, v_phone_digits, v_meta_lead_id
  from marketing_contacts
  where id = p_contact_id;

  if v_company is null then
    return null;
  end if;

  -- authorization: caller must belong to the contact's effective company
  if v_company <> public.get_effective_company_id() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- attribution snapshot from the contact record
  select to_jsonb(c) into v_contact
  from (
    select
      mc.source, mc.attr_source, mc.attr_medium, mc.attr_campaign,
      mc.attr_content, mc.attr_model,
      mc.meta_campaign_id, mc.meta_adset_id, mc.meta_ad_id, mc.meta_lead_id,
      mc.source_campaign_id,
      mc.google_campaign_id, mc.google_ad_group_id, mc.google_ad_id, mc.google_customer_id,
      mc.gclid, mc.wbraid, mc.gbraid, mc.fbc, mc.fbp,
      mc.created_at, mc.first_name, mc.last_name, mc.email, mc.phone
    from marketing_contacts mc
    where mc.id = p_contact_id
  ) c;

  -- every raw lead submission tied to this person (multiple submissions kept)
  select coalesce(jsonb_agg(s.sub order by s.sub_ts desc), '[]'::jsonb)
    into v_submissions
  from (
    select
      jsonb_build_object(
        'event_id', e.event_id,
        'provider', e.provider,
        'received_at', e.received_at,
        'created_time', e.payload->>'created_time',
        'campaign_id', e.payload->>'campaign_id',
        'campaign_name', e.payload->>'campaign_name',
        'adset_id', e.payload->>'adset_id',
        'adset_name', e.payload->>'adset_name',
        'ad_id', e.payload->>'ad_id',
        'ad_name', e.payload->>'ad_name',
        'form_id', e.payload->>'form_id',
        'page_id', e.payload->>'page_id',
        'fields', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'name', fd->>'name',
            'value', (select string_agg(val, ', ') from jsonb_array_elements_text(fd->'values') val)
          )), '[]'::jsonb)
          from jsonb_array_elements(coalesce(e.payload->'field_data', '[]'::jsonb)) fd
        )
      ) as sub,
      coalesce((e.payload->>'created_time')::timestamptz, e.received_at) as sub_ts
    from integration_webhook_events e
    where e.company_id = v_company
      and e.provider = 'meta'
      and (
        (v_meta_lead_id is not null and e.event_id = v_meta_lead_id)
        or (v_email is not null and exists (
              select 1
              from jsonb_array_elements(coalesce(e.payload->'field_data', '[]'::jsonb)) fd,
                   jsonb_array_elements_text(fd->'values') vv
              where position('@' in vv) > 0 and lower(vv) = v_email
        ))
        or (v_phone_digits is not null and length(v_phone_digits) >= 6 and exists (
              select 1
              from jsonb_array_elements(coalesce(e.payload->'field_data', '[]'::jsonb)) fd,
                   jsonb_array_elements_text(fd->'values') vv
              where regexp_replace(vv, '\D', '', 'g') <> ''
                and right(regexp_replace(vv, '\D', '', 'g'), 9) = right(v_phone_digits, 9)
        ))
      )
  ) s;

  -- lightweight activity timeline (creation shown separately from the snapshot)
  select coalesce(jsonb_agg(jsonb_build_object(
      'activity_type', a.activity_type,
      'description', a.description,
      'metadata', a.metadata,
      'created_at', a.created_at
    ) order by a.created_at desc), '[]'::jsonb)
    into v_events
  from marketing_contact_activities a
  where a.contact_id = p_contact_id
    and a.company_id = v_company
    and a.activity_type <> 'contact_created';

  return jsonb_build_object(
    'contact', v_contact,
    'submissions', v_submissions,
    'events', v_events
  );
end;
$$;

grant execute on function public.get_contact_tracking(uuid) to authenticated;
