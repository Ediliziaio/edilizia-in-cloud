-- Extend the shared catalogue without rewriting earlier migrations or existing prices.
do $migration$
declare
  definition text;
  payload text;
  configurations jsonb;
  cfg jsonb;
  source_cfg jsonb;
  target record;
  family uuid;
  axis uuid;
  axis_cfg jsonb;
  val jsonb;
  position integer;
begin
  select value into source_cfg
    from jsonb_array_elements(public.listino_configurazioni_infissi_standard())
    where value->>'id' = 'finestra_scorrevole_2_ante';
  if source_cfg is null then raise exception 'Configurazione scorrevole di base mancante'; end if;
  cfg := jsonb_build_object(
    'id', 'porta_finestra_scorrevole_2_ante',
    'nome', 'Porta finestra scorrevole 2 ante',
    'assi', jsonb_build_array(source_cfg->'assi'->0,
      '{"codice":"soglia","nome":"Soglia","valori":[{"codice":"con","nome":"Con soglia"},{"codice":"senza","nome":"Senza soglia"}]}'::jsonb)
      || ((source_cfg->'assi') - 0));
  select pg_get_functiondef('public.listino_configurazioni_infissi_standard()'::regprocedure) into definition;
  payload := split_part(definition, '$configurazioni$', 2);
  if payload = '' then raise exception 'Formato catalogo standard non riconosciuto'; end if;
  configurations := payload::jsonb;
  if not exists(select 1 from jsonb_array_elements(configurations) where value->>'id' = cfg->>'id') then
    execute replace(definition, '$configurazioni$' || payload || '$configurazioni$',
      '$configurazioni$' || (configurations || jsonb_build_array(cfg))::text || '$configurazioni$');
  end if;

  -- All existing company/line scopes with the window model. No company names hardcoded.
  for target in
    select distinct company_id, macrocategoria_id, categoria_id from public.article_families
    where (disegno_tipologia = 'finestra_scorrevole_2_ante'
      or public.listino_codice_testo(nome) = 'finestra_scorrevole_2_ante')
      and deleted_at is null and attivo and mostra_preventivo
  loop
    perform pg_advisory_xact_lock(hashtextextended('configurazioni_infissi:' || target.macrocategoria_id::text, 0));
    if exists(select 1 from public.article_families f
      where f.company_id = target.company_id
        and f.macrocategoria_id = target.macrocategoria_id
        and f.categoria_id is not distinct from target.categoria_id
        and f.deleted_at is null
        and (f.disegno_tipologia = cfg->>'id'
          or public.listino_codice_testo(f.nome) in ('porta_finestra_scorrevole_2_ante', 'portafinestra_scorrevole_2_ante'))) then continue; end if;
    insert into public.article_families(
      company_id, macrocategoria_id, categoria_id, vertical, nome, descrizione,
      modalita_prezzo_base, prezzo_base_mode, prezzo_base_vendita, prezzo_base_acquisto,
      unit_of_measure, vat_rate, attivo, mostra_preventivo, disegno_tipologia, custom_field_values)
    values(target.company_id, target.macrocategoria_id, target.categoria_id, 'serramenti', cfg->>'nome',
      'Configurazione standard: verificare fattibilità e prezzi con il fornitore della linea.',
      'mq', 'vendita', 0, null, 'pz', 22, true, true, cfg->>'id',
      '{"configurazione_standard":true,"prezzo_da_definire":true,"compatibilita_fornitore":"da_verificare"}'::jsonb)
    returning id into family;
    position := 0;
    for axis_cfg in select value from jsonb_array_elements(cfg->'assi') loop
      insert into public.article_family_axes(family_id, company_id, codice, nome, obbligatorio, sort_order)
      values(family, target.company_id, axis_cfg->>'codice', axis_cfg->>'nome', true, position)
      returning id into axis;
      position := position + 1;
      for val in select value from jsonb_array_elements(axis_cfg->'valori') loop
        insert into public.article_family_axis_values(axis_id, company_id, valore, label, is_default,
          sort_order, maggiorazione_tipo, maggiorazione_valore, maggiorazione_acquisto)
        values(axis, target.company_id, val->>'codice', val->>'nome',
          not exists(select 1 from public.article_family_axis_values where axis_id = axis),
          (select count(*) from public.article_family_axis_values where axis_id = axis), 'none', 0, 0);
      end loop;
    end loop;
  end loop;
end;
$migration$;
