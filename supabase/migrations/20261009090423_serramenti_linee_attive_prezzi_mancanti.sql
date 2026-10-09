-- Completa solo prezzi di vendita mancanti di schemi geometrici attivi nella stessa linea.
-- Non cambia griglie, acquisto+ricarico, costi, maggiorazioni, archivi o preventivi.
create or replace function public.listino_completa_prezzi_infissi(
  p_macrocategoria_id uuid, p_categoria_id uuid, p_prezzo_vendita_mq numeric
) returns jsonb language plpgsql security definer set search_path = public
set lock_timeout = '5s' as $fn$
declare
  v_company uuid;
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then raise exception 'Accesso non autenticato' using errcode = '42501'; end if;
  select company_id into v_company from public.listino_macrocategorie
   where id = p_macrocategoria_id and attivo and public.listino_codice_testo(nome) = 'serramenti';
  if v_company is null or not public.has_permission_for_company(v_uid, 'can_edit_settings_pricing', v_company) then
    raise exception 'Non puoi modificare il listino di questa azienda' using errcode = '42501';
  end if;
  if not exists(select 1 from public.listino_categorie
     where id = p_categoria_id and company_id = v_company and macrocategoria_id = p_macrocategoria_id) then
    raise exception 'La linea non appartiene alla tipologia di questa azienda' using errcode = '42501';
  end if;
  if p_prezzo_vendita_mq is null or p_prezzo_vendita_mq <= 0 or p_prezzo_vendita_mq > 1000000
     or p_prezzo_vendita_mq::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Inserisci un prezzo al metro quadro positivo e valido';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('configurazioni_infissi:' || p_macrocategoria_id::text, 0));
  update public.article_families f
   set prezzo_base_vendita = round(p_prezzo_vendita_mq, 4),
       custom_field_values = coalesce(f.custom_field_values, '{}'::jsonb) ||
         '{"prezzo_da_definire":false,"prezzo_vendita_origine":"completamento_linea"}'::jsonb,
       updated_at = now()
   where f.company_id = v_company and f.macrocategoria_id = p_macrocategoria_id
     and f.categoria_id = p_categoria_id
     and f.deleted_at is null and f.attivo and f.mostra_preventivo
     and f.modalita_prezzo_base = 'mq' and f.prezzo_base_mode = 'vendita'
     and coalesce(f.prezzo_base_vendita, 0) = 0
     and f.disegno_tipologia in (select value ->> 'id' from jsonb_array_elements(public.listino_configurazioni_infissi_standard()));
  get diagnostics v_count = row_count;
  return jsonb_build_object('prodotti_prezzo', v_count, 'prezzo_vendita_mq', p_prezzo_vendita_mq);
end;
$fn$;
revoke all on function public.listino_completa_prezzi_infissi(uuid, uuid, numeric) from public, anon;
grant execute on function public.listino_completa_prezzi_infissi(uuid, uuid, numeric) to authenticated;

create or replace function public.listino_completa_configurazioni_infissi(
  p_macrocategoria_id uuid, p_categoria_id uuid default null, p_nome_linea text default null
)
returns jsonb language plpgsql security definer set search_path = public
set lock_timeout = '5s' as $fn$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_macro_nome text;
  v_categoria uuid;
  v_target record;
  v_cfg jsonb;
  v_asse jsonb;
  v_val jsonb;
  v_family uuid;
  v_axis uuid;
  v_created boolean;
  v_new int := 0;
  v_axes int := 0;
  v_values int := 0;
  v_order int;
  v_i int;
  v_prezzo numeric;
  v_prezzati int;
  v_frequenza int;
  v_prezzi int := 0;
  v_esito jsonb;
  v_nome text := nullif(btrim(p_nome_linea), '');
begin
  if v_uid is null then raise exception 'Accesso non autenticato' using errcode = '42501'; end if;
  select company_id, nome into v_company, v_macro_nome from public.listino_macrocategorie
   where id = p_macrocategoria_id and attivo;
  if v_company is null then raise exception 'Tipologia non trovata'; end if;
  if not public.has_permission_for_company(v_uid, 'can_edit_settings_pricing', v_company) then
    raise exception 'Non puoi modificare il listino di questa azienda' using errcode = '42501';
  end if;
  if public.listino_codice_testo(v_macro_nome) <> 'serramenti' then
    raise exception 'Il catalogo geometrico si completa nella tipologia Serramenti';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('configurazioni_infissi:' || p_macrocategoria_id::text, 0));
  if p_categoria_id is not null and v_nome is not null then raise exception 'Scegli una linea esistente oppure un nome nuovo'; end if;
  if p_categoria_id is not null then
    select id into v_categoria from public.listino_categorie
     where id = p_categoria_id and company_id = v_company and macrocategoria_id = p_macrocategoria_id;
    if v_categoria is null then raise exception 'La linea non appartiene alla tipologia di questa azienda' using errcode = '42501'; end if;
  elsif v_nome is not null then
    if length(v_nome) > 160 then raise exception 'Nome linea troppo lungo'; end if;
    select id into v_categoria from public.listino_categorie
     where company_id = v_company and macrocategoria_id = p_macrocategoria_id
       and public.listino_codice_testo(nome) = public.listino_codice_testo(v_nome) limit 1;
    if v_categoria is null then
      insert into public.listino_categorie(company_id, macrocategoria_id, nome, sort_order)
      select v_company, p_macrocategoria_id, v_nome, coalesce(max(sort_order), -1) + 1
       from public.listino_categorie where company_id = v_company and macrocategoria_id = p_macrocategoria_id
      returning id into v_categoria;
    end if;
  end if;

  -- Una linea interamente disattivata/archiviata non si riaccende aggiungendo nuovi schemi.
  if v_categoria is not null and exists(select 1 from public.article_families
       where company_id = v_company and categoria_id = v_categoria)
     and not exists(select 1 from public.article_families where company_id = v_company and categoria_id = v_categoria
       and deleted_at is null and attivo and mostra_preventivo) then
    raise exception 'Linea disattivata: riattiva prima un prodotto oppure scegli una linea attiva';
  end if;

  for v_target in
    select v_categoria as id where v_categoria is not null
    union all
    select c.id from public.listino_categorie c
     where v_categoria is null and c.company_id = v_company and c.macrocategoria_id = p_macrocategoria_id
       and (not exists(select 1 from public.article_families f where f.company_id = v_company and f.categoria_id = c.id)
            or exists(select 1 from public.article_families f where f.company_id = v_company and f.categoria_id = c.id
               and f.deleted_at is null and f.attivo and f.mostra_preventivo))
    union all
    select null::uuid where v_categoria is null and not exists
      (select 1 from public.listino_categorie where company_id = v_company and macrocategoria_id = p_macrocategoria_id)
  loop
    -- Usa solo una base già presente nella stessa linea: deve essere il prezzo
    -- della maggioranza assoluta dei prodotti già prezzati (nessuna eredità tra aziende).
    v_prezzo := null;
    select count(*) into v_prezzati from public.article_families f
     where f.company_id = v_company and f.macrocategoria_id = p_macrocategoria_id
       and f.categoria_id is not distinct from v_target.id and f.deleted_at is null
       and f.attivo and f.mostra_preventivo and f.modalita_prezzo_base = 'mq'
       and f.prezzo_base_mode = 'vendita' and f.prezzo_base_vendita > 0 and f.disegno_tipologia is not null;
    select prezzo_base_vendita, count(*) into v_prezzo, v_frequenza
     from public.article_families f
     where f.company_id = v_company and f.macrocategoria_id = p_macrocategoria_id
       and f.categoria_id is not distinct from v_target.id and f.deleted_at is null
       and f.attivo and f.mostra_preventivo and f.modalita_prezzo_base = 'mq'
       and f.prezzo_base_mode = 'vendita' and f.prezzo_base_vendita > 0 and f.disegno_tipologia is not null
     group by prezzo_base_vendita order by count(*) desc, prezzo_base_vendita limit 1;
    if coalesce(v_frequenza, 0) * 2 <= v_prezzati then v_prezzo := null; end if;

    for v_cfg in select value from jsonb_array_elements(public.listino_configurazioni_infissi_standard()) loop
      v_created := false;
      v_family := null;
      -- Rispetta i prodotti nascosti/disattivati. Quelli archiviati restano intatti,
      -- ma non impediscono di preparare un nuovo schema senza ereditarne il prezzo.
      select id into v_family from public.article_families f
       where f.company_id = v_company and f.macrocategoria_id = p_macrocategoria_id
         and f.categoria_id is not distinct from v_target.id
         and f.deleted_at is null
         and (case when f.disegno_tipologia = 'fisso' and public.listino_codice_testo(f.nome) = 'fisso_nell_anta'
                   then 'fisso_anta' else f.disegno_tipologia end = v_cfg ->> 'id'
              or public.listino_codice_testo(f.nome) = public.listino_codice_testo(v_cfg ->> 'nome'))
       order by (f.deleted_at is null) desc, f.attivo desc, f.id limit 1;
      if v_family is null then
        insert into public.article_families(
          company_id, macrocategoria_id, categoria_id, vertical, nome, descrizione,
          modalita_prezzo_base, prezzo_base_mode, prezzo_base_vendita, prezzo_base_acquisto,
          unit_of_measure, vat_rate, attivo, mostra_preventivo, disegno_tipologia, custom_field_values)
        values(v_company, p_macrocategoria_id, v_target.id, 'serramenti', v_cfg ->> 'nome',
          'Configurazione standard: verificare fattibilità, gamma e prezzi con il fornitore della linea.',
          'mq', 'vendita', 0, null, 'pz', 22, true, true, v_cfg ->> 'id',
          '{"configurazione_standard":true,"prezzo_da_definire":true,"compatibilita_fornitore":"da_verificare"}'::jsonb)
        returning id into v_family;
        v_new := v_new + 1;
        v_created := true;
      elsif not exists(select 1 from public.article_families where id = v_family and attivo and mostra_preventivo and deleted_at is null) then
        continue;
      end if;

      for v_asse in select value from jsonb_array_elements(v_cfg -> 'assi') loop
        -- Nei prodotti esistenti completa solo le scelte geometriche: non tocca colori/vetri/telai.
        if not v_created and v_asse ->> 'codice' not in ('apertura', 'apertura_sopraluce') then continue; end if;
        select id into v_axis from public.article_family_axes
         where family_id = v_family and company_id = v_company and codice = v_asse ->> 'codice';
        if v_axis is null then
          select coalesce(max(sort_order), -1) + 1 into v_order from public.article_family_axes where family_id = v_family;
          insert into public.article_family_axes(family_id, company_id, codice, nome, obbligatorio, sort_order)
          values(v_family, v_company, v_asse ->> 'codice', v_asse ->> 'nome', true, v_order)
          returning id into v_axis;
          v_axes := v_axes + 1;
        end if;
        v_i := 0;
        for v_val in select value from jsonb_array_elements(v_asse -> 'valori') loop
          if not exists(select 1 from public.article_family_axis_values where axis_id = v_axis and valore = v_val ->> 'codice') then
            insert into public.article_family_axis_values(
              axis_id, company_id, valore, label, is_default, sort_order,
              maggiorazione_tipo, maggiorazione_valore, maggiorazione_acquisto, descrizione)
            select v_axis, v_company, v_val ->> 'codice', v_val ->> 'nome',
              not exists(select 1 from public.article_family_axis_values where axis_id = v_axis and attivo),
              v_i + coalesce((select max(sort_order) from public.article_family_axis_values where axis_id = v_axis), -1) + 1,
              'none', 0, 0, 'Verificare fattibilità e maggiorazione con il fornitore.'
            ;
            v_values := v_values + 1;
          end if;
          v_i := v_i + 1;
        end loop;
      end loop;
    end loop;
    if v_prezzo is not null and v_target.id is not null then
      v_esito := public.listino_completa_prezzi_infissi(p_macrocategoria_id, v_target.id, v_prezzo);
      v_prezzi := v_prezzi + (v_esito ->> 'prodotti_prezzo')::int;
    end if;
  end loop;
  return jsonb_build_object('categoria_id', v_categoria, 'prodotti_nuovi', v_new,
    'prezzi_completati', v_prezzi, 'assi_aggiunti', v_axes, 'valori_aggiunti', v_values,
    'configurazioni_standard', jsonb_array_length(public.listino_configurazioni_infissi_standard()));
end;
$fn$;
revoke all on function public.listino_completa_configurazioni_infissi(uuid, uuid, text) from public, anon;
grant execute on function public.listino_completa_configurazioni_infissi(uuid, uuid, text) to authenticated;
