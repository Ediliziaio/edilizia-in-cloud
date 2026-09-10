-- Le liste che si popolano da sole sapevano dire «tag = serramenti» oppure
-- «ha una email contattabile», ma non «serramentisti IN Lombardia CON email»:
-- il vocabolario non aveva né la geografia né il settore, e soprattutto non
-- sapeva mettere in AND due condizioni. Ogni segmento di questo tipo andava
-- quindi rifatto a mano a ogni import — che è esattamente il lavoro che non
-- si vuole più fare.
--
-- Si aggiungono quattro voci al vocabolario chiuso:
--   tutte / qualsiasi  → AND e OR ricorsivi su una lista di sotto-regole
--   regione / provincia → geografia (valori esatti come in marketing_contacts)
--   ateco              → per prefisso di codice (es. "25.1" prende 25.11 e 25.12)
--   tag_uno_di         → basta UNO dei tag elencati (l'esistente 'tag' ne vuole uno solo)
-- Il resto del vocabolario e l'esclusione per tag restano identici.
create or replace function public.contatto_corrisponde_regola(c marketing_contacts, regola jsonb)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_tipo text := regola->>'tipo';
  v_escludi text[];
  v_valori text[];
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
    -- ── combinazioni ────────────────────────────────────────────────────────
    when 'tutte' then
      return not exists (
        select 1 from jsonb_array_elements(coalesce(regola->'regole','[]'::jsonb)) r
        where not public.contatto_corrisponde_regola(c, r.value)
      );

    when 'qualsiasi' then
      return exists (
        select 1 from jsonb_array_elements(coalesce(regola->'regole','[]'::jsonb)) r
        where public.contatto_corrisponde_regola(c, r.value)
      );

    -- ── geografia ───────────────────────────────────────────────────────────
    when 'regione' then
      return c.region is not null
         and c.region = any (select jsonb_array_elements_text(regola->'valori'));

    when 'provincia' then
      return c.province is not null
         and upper(btrim(c.province)) = any (
               select upper(btrim(value)) from jsonb_array_elements_text(regola->'valori'));

    -- ── settore ─────────────────────────────────────────────────────────────
    when 'ateco' then
      return c.ateco_code is not null and exists (
        select 1 from jsonb_array_elements_text(regola->'prefissi') p
        where c.ateco_code like p.value || '%'
      );

    when 'tag_uno_di' then
      select array_agg(value) into v_valori from jsonb_array_elements_text(regola->'valori');
      return v_valori is not null and coalesce(c.tags,'{}') && v_valori;

    -- ── vocabolario preesistente ────────────────────────────────────────────
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
end $function$;
