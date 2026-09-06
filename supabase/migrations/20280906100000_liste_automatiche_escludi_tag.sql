-- Una regola può ora portarsi dietro un'esclusione: "questi sì, tranne quelli
-- con il tag X". Serve a tenere fuori dalle campagne i recapiti trovati per
-- somiglianza e non ancora verificati — scrivere all'azienda sbagliata costa
-- segnalazioni spam, e la reputazione del dominio non si recupera in fretta.
-- L'esclusione vale per QUALSIASI tipo di regola, non solo per le email.
create or replace function public.contatto_corrisponde_regola(
  c public.marketing_contacts, regola jsonb
) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_tipo text := regola->>'tipo';
  v_escludi text[];
begin
  if regola is null or v_tipo is null then return false; end if;
  if c.deleted_at is not null then return false; end if;

  -- Esclusione: se il contatto ha uno dei tag elencati, resta fuori comunque.
  if regola ? 'escludi_tag' then
    select array_agg(value) into v_escludi from jsonb_array_elements_text(regola->'escludi_tag');
    if v_escludi is not null and coalesce(c.tags,'{}') && v_escludi then
      return false;
    end if;
  end if;

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
        where fv.contact_id = c.id and f.company_id = c.company_id
          and f.name = regola->>'campo' and f.deleted_at is null
          and fv.value = any (select jsonb_array_elements_text(regola->'valori'))
      );
    else
      return false;
  end case;
end $$;

revoke all on function public.contatto_corrisponde_regola(public.marketing_contacts, jsonb) from public, anon, authenticated;
