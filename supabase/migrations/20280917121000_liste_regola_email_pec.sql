-- Liste automatiche: nuovo tipo di regola «email_pec», per tenere fuori le PEC.
--
-- Una PEC è posta certificata: le email normali spesso non le accetta, e un
-- cold che ci arriva finisce rifiutato. Il 15/09/2026 il titolare ha chiesto
-- di togliere le PEC dalle liste di Marketing Edile ed Edilizia in Cloud: le
-- regole si scrivono come {"tipo":"non","regola":{"tipo":"email_pec"}}.
--
-- Il riconoscimento segue PEC_RE di _shared/outreach-email-check.ts e aggiunge
-- i provider trovati nei contatti veri (registerpec, lamiapec, pecsicura,
-- casellapec, cert.cna…). Non basta cercare «pec» nel dominio: prenderebbe
-- anche specialvetro.com o mapecostruzioni.it.
--
-- Solo CREATE OR REPLACE: i permessi della funzione restano quelli di prima.

CREATE OR REPLACE FUNCTION public.contatto_corrisponde_regola(c marketing_contacts, regola jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    when 'non' then
      return not public.contatto_corrisponde_regola(c, regola->'regola');

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
    when 'campo_valorizzato' then
      return case regola->>'campo'
        when 'website'      then coalesce(c.website,'') <> ''
        when 'region'       then coalesce(c.region,'') <> ''
        when 'province'     then coalesce(c.province,'') <> ''
        when 'city'         then coalesce(c.city,'') <> ''
        when 'phone'        then coalesce(c.phone,'') <> ''
        when 'email'        then coalesce(c.email,'') <> ''
        when 'vat_number'   then coalesce(c.vat_number,'') <> ''
        when 'ateco_code'   then coalesce(c.ateco_code,'') <> ''
        when 'company_name' then coalesce(c.company_name,'') <> ''
        else false end;

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

    when 'email_pec' then
      return coalesce(c.email,'') <> ''
         and lower(split_part(btrim(c.email),'@',2)) ~ '(^|[.-])(pec|cert)([.-]|$)|legalmail|arubapec|postacert|sicurezzapostale|mypec|pecimprese|ingpec|geopec|legalpec|pec-?legal|postecert|actaliscertymail|pecmail|registerpec|lamiapec|pecsicura|ticertifica|interfreepec|casellapec|infopec|pacertificata|pecpdcna|[a-z0-9]pec\.(it|com|net|eu|info)$';

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
