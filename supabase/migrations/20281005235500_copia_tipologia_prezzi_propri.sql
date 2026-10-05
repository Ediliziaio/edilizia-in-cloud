-- «Copia tipologia» con variazione di prezzo: anche i prezzi propri delle
-- varianti si scalano (05/10/2026).
--
-- La copia moltiplicava per (1 + variazione %) il prezzo base e le celle
-- della griglia, ma copiava così com'erano i prezzi propri delle varianti
-- (article_family_axis_values.prezzo_vendita/prezzo_acquisto): una linea col
-- prezzo proprio (migrazione 20280922170000) restava al prezzo vecchio nella
-- tipologia copiata «+10%», mentre la finestra diceva «acquisto e vendita».
-- Unica modifica rispetto alla versione precedente: le due colonne dei
-- prezzi propri nella copia dei valori.

CREATE OR REPLACE FUNCTION public.listino_copia_tipologia(p_macrocategoria_id uuid, p_nome text, p_suffisso_prodotti text DEFAULT NULL::text, p_variazione_pct numeric DEFAULT 0, p_con_prodotti boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_src public.listino_macrocategorie%rowtype;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_suffisso text := nullif(btrim(coalesce(p_suffisso_prodotti, '')), '');
  v_k numeric := 1 + coalesce(p_variazione_pct, 0) / 100.0;
  v_new_macro uuid;
  v_new_cat uuid;
  v_new_fam uuid;
  v_new_ax uuid;
  v_cat record;
  v_fam public.article_families%rowtype;
  v_ax record;
  v_mappa_cat jsonb := '{}'::jsonb;
  v_conflitto text;
  v_prodotti int := 0;
  v_linee int := 0;
  v_schede int := 0;
begin
  if v_user is null then
    raise exception 'Accesso non autenticato' using errcode = '42501';
  end if;
  select * into v_src from public.listino_macrocategorie where id = p_macrocategoria_id;
  if not found then
    raise exception 'Tipologia non trovata';
  end if;
  -- Come la regola che lascia creare le tipologie: amministratore o super admin.
  if not (
    public.has_role(v_user, 'super_admin'::app_role)
    or (public.has_role(v_user, 'company_admin'::app_role)
        and public.get_user_company_id(v_user) = v_src.company_id)
    or exists (
      select 1 from public.multi_company_access mca
       where mca.user_id = v_user
         and mca.company_id = v_src.company_id
         and mca.status = 'active'
         and (mca.expires_at is null or mca.expires_at > now())
         and mca.access_role::text = 'company_admin')
  ) then
    raise exception 'Solo l''amministratore dell''azienda può copiare una tipologia' using errcode = '42501';
  end if;
  if v_nome = '' then
    raise exception 'Scrivi il nome della nuova tipologia';
  end if;
  if exists (
    select 1 from public.listino_macrocategorie
     where company_id = v_src.company_id and lower(btrim(nome)) = lower(v_nome)
  ) then
    raise exception 'Esiste già una tipologia «%»', v_nome;
  end if;
  if v_src.fv_categoria is not null then
    raise exception 'Le tipologie del fotovoltaico non si copiano: ognuna è un componente del configuratore';
  end if;
  if v_k <= 0 then
    raise exception 'La variazione di prezzo azzera i prezzi';
  end if;

  if p_con_prodotti then
    select f.nome || coalesce(' ' || v_suffisso, '') into v_conflitto
      from public.article_families f
     where f.macrocategoria_id = v_src.id
       and f.deleted_at is null
       and exists (
         select 1 from public.article_families g
          where g.company_id = f.company_id
            and g.vertical = f.vertical
            and g.deleted_at is null
            and g.attivo
            and g.categoria_id is null
            and g.nome = f.nome || coalesce(' ' || v_suffisso, ''))
     order by f.nome
     limit 1;
    if v_conflitto is not null then
      raise exception 'Esiste già un prodotto «%»: aggiungi ai nomi dei prodotti un testo che li distingua, per esempio il materiale', v_conflitto;
    end if;
  end if;

  insert into public.listino_macrocategorie
    (company_id, nome, descrizione, icona, colore, sort_order, attivo, verticali_abilitati,
     immagine_url, descrizione_estesa, mostra_pagina_dedicata_pdf, categoria_tipo, tipologia, fv_categoria)
  values
    (v_src.company_id, v_nome, v_src.descrizione, v_src.icona, v_src.colore,
     coalesce(v_src.sort_order, 0) + 1, v_src.attivo, v_src.verticali_abilitati,
     v_src.immagine_url, v_src.descrizione_estesa, v_src.mostra_pagina_dedicata_pdf,
     v_src.categoria_tipo, v_src.tipologia, null)
  returning id into v_new_macro;

  for v_cat in
    select * from public.listino_categorie where macrocategoria_id = v_src.id order by sort_order, nome
  loop
    insert into public.listino_categorie
      (company_id, nome, colore, icona, margine_target_percentuale, sort_order, macrocategoria_id,
       descrizione, immagine_url)
    values
      (v_src.company_id, v_cat.nome, v_cat.colore, v_cat.icona, v_cat.margine_target_percentuale,
       v_cat.sort_order, v_new_macro, v_cat.descrizione, v_cat.immagine_url)
    returning id into v_new_cat;
    v_mappa_cat := v_mappa_cat || jsonb_build_object(v_cat.id::text, v_new_cat::text);
    v_linee := v_linee + 1;
  end loop;

  if p_con_prodotti then
    for v_fam in
      select * from public.article_families
       where macrocategoria_id = v_src.id and deleted_at is null
       order by sort_order, nome
    loop
      insert into public.article_families
        (company_id, vertical, categoria_id, nome, descrizione, immagine_url, pdf_scheda_url,
         modalita_prezzo_base, prezzo_base_vendita, prezzo_base_acquisto, vat_rate, unit_of_measure,
         posa_tariffa_default_id, posa_quantita_default, griglia_asse_x_label, griglia_asse_y_label,
         griglia_unita, attivo, sort_order, custom_field_values, posa_linked, supplier_id,
         prezzo_base_mode, markup_tipo, markup_valore, vat_rate_acquisto, sconto_fornitore_1,
         sconto_fornitore_2, manodopera_modalita, manodopera_costo_acquisto, manodopera_prezzo_vendita,
         manodopera_unita, macrocategoria_id, codice, mostra_preventivo)
      values
        (v_src.company_id, v_fam.vertical,
         case when v_fam.categoria_id is null then null else (v_mappa_cat ->> v_fam.categoria_id::text)::uuid end,
         v_fam.nome || coalesce(' ' || v_suffisso, ''), v_fam.descrizione, v_fam.immagine_url,
         v_fam.pdf_scheda_url, v_fam.modalita_prezzo_base,
         case when v_fam.prezzo_base_vendita is null then null else round(v_fam.prezzo_base_vendita * v_k, 2) end,
         case when v_fam.prezzo_base_acquisto is null then null else round(v_fam.prezzo_base_acquisto * v_k, 2) end,
         v_fam.vat_rate, v_fam.unit_of_measure, v_fam.posa_tariffa_default_id, v_fam.posa_quantita_default,
         v_fam.griglia_asse_x_label, v_fam.griglia_asse_y_label, v_fam.griglia_unita, v_fam.attivo,
         v_fam.sort_order, v_fam.custom_field_values, v_fam.posa_linked, v_fam.supplier_id,
         v_fam.prezzo_base_mode, v_fam.markup_tipo, v_fam.markup_valore, v_fam.vat_rate_acquisto,
         v_fam.sconto_fornitore_1, v_fam.sconto_fornitore_2, v_fam.manodopera_modalita,
         v_fam.manodopera_costo_acquisto, v_fam.manodopera_prezzo_vendita, v_fam.manodopera_unita,
         v_new_macro, null, v_fam.mostra_preventivo)
      returning id into v_new_fam;

      for v_ax in
        select * from public.article_family_axes where family_id = v_fam.id order by sort_order
      loop
        insert into public.article_family_axes
          (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
        values
          (v_new_fam, v_src.company_id, v_ax.nome, v_ax.codice, v_ax.descrizione, v_ax.tipo,
           v_ax.obbligatorio, v_ax.sort_order)
        returning id into v_new_ax;

        insert into public.article_family_axis_values
          (axis_id, company_id, valore, label, descrizione, is_default, maggiorazione_tipo,
           maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo, codice,
           prezzo_vendita, prezzo_acquisto, immagine_url, opzioni)
        select v_new_ax, v_src.company_id, v.valore, v.label, v.descrizione, v.is_default,
               v.maggiorazione_tipo, v.maggiorazione_valore, v.maggiorazione_acquisto, v.sort_order,
               v.attivo, v.codice,
               -- I prezzi propri si scalano come il prezzo base e la griglia.
               case when v.prezzo_vendita is null then null else round(v.prezzo_vendita * v_k, 2) end,
               case when v.prezzo_acquisto is null then null else round(v.prezzo_acquisto * v_k, 2) end,
               v.immagine_url, v.opzioni
          from public.article_family_axis_values v
         where v.axis_id = v_ax.id;
      end loop;

      insert into public.listino_griglia
        (company_id, family_id, axis_config, valore_x, valore_y, prezzo_vendita, prezzo_acquisto,
         supplier_catalog_id, supplier_product_line_id, note)
      select v_src.company_id, v_new_fam, g.axis_config, g.valore_x, g.valore_y,
             case when g.prezzo_vendita is null then null else round(g.prezzo_vendita * v_k, 2) end,
             case when g.prezzo_acquisto is null then null else round(g.prezzo_acquisto * v_k, 2) end,
             g.supplier_catalog_id, g.supplier_product_line_id, g.note
        from public.listino_griglia g
       where g.family_id = v_fam.id;

      v_prodotti := v_prodotti + 1;
    end loop;
  end if;

  insert into public.listino_schede_linea
    (company_id, macrocategoria_id, chiave, nome, descrizione, immagine_url, profondita_mm,
     camere, guarnizioni, uw, scheda_tecnica_url, scheda_tecnica_nome)
  select s.company_id, v_new_macro, s.chiave, s.nome, s.descrizione, s.immagine_url, s.profondita_mm,
         s.camere, s.guarnizioni, s.uw, s.scheda_tecnica_url, s.scheda_tecnica_nome
    from public.listino_schede_linea s
   where s.macrocategoria_id = v_src.id;
  get diagnostics v_schede = row_count;

  return jsonb_build_object(
    'id', v_new_macro,
    'nome', v_nome,
    'prodotti', v_prodotti,
    'linee', v_linee,
    'schede', v_schede
  );
exception
  when unique_violation then
    raise exception 'Un nome è già in uso nel listino: cambia il nome della tipologia o il testo da aggiungere ai prodotti';
end;
$function$;
