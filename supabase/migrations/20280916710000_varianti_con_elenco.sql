-- Dentro una variante, l'elenco di cosa comprende (14/09/2026).
--
-- «Colore Standard +10%» è una fascia di prezzo: il cliente sceglie un colore
-- preciso (Grigio antracite RAL 7016, effetto legno noce). Il listino non
-- aveva dove scrivere quali colori stanno in quale fascia, e nel preventivo il
-- colore vero si scriveva a mano, senza sapere a che prezzo stava.
--
--  - article_family_axis_values.opzioni: i colori (o i vetri, le maniglie…)
--    che il valore comprende. Vuoto = il valore è già una scelta sola.
--  - sr_serramenti_progetto / sr_accessori_progetto.scelte_assi: nel
--    preventivo, per ogni variante, la voce scelta dentro il valore
--    ({"colore": "Grigio antracite RAL 7016"}). Il prezzo resta del valore.
--  - listino_varianti_tipologia scrive l'elenco in tutti i prodotti della
--    tipologia; listino_copia_tipologia lo copia con i prodotti.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, vincoli ricreati, CREATE OR REPLACE.
-- Le tre tabelle sono piccole (2.646 valori, poche decine di righe di
-- preventivo): la colonna col default costante non riscrive le righe.

set local lock_timeout = '3s';

alter table public.article_family_axis_values
  add column if not exists opzioni jsonb not null default '[]'::jsonb;
alter table public.article_family_axis_values
  drop constraint if exists article_family_axis_values_opzioni_elenco;
alter table public.article_family_axis_values
  add constraint article_family_axis_values_opzioni_elenco check (jsonb_typeof(opzioni) = 'array');
comment on column public.article_family_axis_values.opzioni is
  'Cosa comprende il valore: i colori di «Colore Standard», i vetri di «Vetro Antisonoro». Nel preventivo se ne sceglie uno, al prezzo del valore.';

alter table public.sr_serramenti_progetto
  add column if not exists scelte_assi jsonb not null default '{}'::jsonb;
alter table public.sr_serramenti_progetto
  drop constraint if exists sr_serramenti_progetto_scelte_assi_oggetto;
alter table public.sr_serramenti_progetto
  add constraint sr_serramenti_progetto_scelte_assi_oggetto check (jsonb_typeof(scelte_assi) = 'object');
comment on column public.sr_serramenti_progetto.scelte_assi is
  'Per ogni variante (codice asse) la voce scelta dentro il valore di valori_assi, es. {"colore": "Grigio antracite RAL 7016"}.';

alter table public.sr_accessori_progetto
  add column if not exists scelte_assi jsonb not null default '{}'::jsonb;
alter table public.sr_accessori_progetto
  drop constraint if exists sr_accessori_progetto_scelte_assi_oggetto;
alter table public.sr_accessori_progetto
  add constraint sr_accessori_progetto_scelte_assi_oggetto check (jsonb_typeof(scelte_assi) = 'object');
comment on column public.sr_accessori_progetto.scelte_assi is
  'Per ogni variante (codice asse) la voce scelta dentro il valore di valori_assi, es. {"colore": "Grigio antracite RAL 7016"}.';

-- ─────────────────────────────────────────────────────────────────────────
-- Colori e varianti di una tipologia: ora anche l'elenco di ogni valore.
-- Per valore: "opzioni" (la lista) e "aggiorna_opzioni" (riscriverla dove il
-- valore c'è già). Chi aggiunge un valore dove manca lo aggiunge con la lista.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.listino_varianti_tipologia(
  p_macrocategoria_id uuid,
  p_assi jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  v_fv text;
  v_asse jsonb;
  v_chiave text;
  v_nome_asse text;
  v_base text;
  v_allinea boolean;
  v_completa boolean;
  v_obbligatorio boolean;
  v_valore jsonb;
  v_nome text;
  v_k text;
  v_tipo text;
  v_vendita numeric;
  v_acquisto numeric;
  v_attivo boolean;
  v_opzioni jsonb;
  v_voce jsonb;
  v_chiavi text[];
  v_n int;
  v_valori int := 0;
  v_elenchi int := 0;
  v_aggiunti int := 0;
  v_assi_creati int := 0;
  v_senza text;
begin
  if v_user is null then
    raise exception 'Accesso non autenticato' using errcode = '42501';
  end if;
  select company_id, fv_categoria into v_company, v_fv
    from public.listino_macrocategorie where id = p_macrocategoria_id;
  if v_company is null then
    raise exception 'Tipologia non trovata';
  end if;
  if not public.has_permission_for_company(v_user, 'can_edit_settings_pricing', v_company) then
    raise exception 'Non hai il permesso di modificare il listino di questa azienda' using errcode = '42501';
  end if;
  if p_assi is null or jsonb_typeof(p_assi) <> 'array' or jsonb_array_length(p_assi) = 0 then
    raise exception 'Nessuna variante da aggiornare';
  end if;

  for v_asse in select * from jsonb_array_elements(p_assi) loop
    v_chiave := public.listino_codice_testo(coalesce(nullif(btrim(v_asse->>'chiave'), ''), v_asse->>'nome'));
    v_nome_asse := coalesce(nullif(btrim(v_asse->>'nome'), ''), v_chiave);
    v_base := nullif(public.listino_codice_testo(v_asse->>'base'), '');
    v_allinea := coalesce((v_asse->>'allinea_base')::boolean, false);
    v_completa := coalesce((v_asse->>'completa')::boolean, false);
    if v_chiave = '' then
      raise exception 'Una variabile senza nome';
    end if;
    if v_chiave in ('linea', 'serie') then
      raise exception 'Le linee si cambiano da «Prezzi delle linee»';
    end if;
    if v_completa and v_fv is not null then
      raise exception 'Nel fotovoltaico le varianti si aggiungono prodotto per prodotto';
    end if;
    if jsonb_typeof(v_asse->'valori') is distinct from 'array' then
      raise exception '«%»: mancano i valori', v_nome_asse;
    end if;

    -- Controlli prima di scrivere.
    v_chiavi := array[]::text[];
    for v_valore in select * from jsonb_array_elements(v_asse->'valori') loop
      v_nome := btrim(coalesce(v_valore->>'nome', ''));
      v_k := public.listino_codice_testo(v_nome);
      if v_k = '' then
        raise exception '«%»: un valore senza nome', v_nome_asse;
      end if;
      if v_k = any(v_chiavi) then
        raise exception '«%»: «%» c''è due volte', v_nome_asse, v_nome;
      end if;
      v_chiavi := v_chiavi || v_k;
      v_tipo := coalesce(v_valore->>'tipo', 'none');
      if v_tipo not in ('none', 'percentuale', 'fisso_pz', 'fisso_mq', 'fisso_ml', 'fisso_mc') then
        raise exception '«%»: maggiorazione «%» non valida', v_nome, v_tipo;
      end if;
      v_vendita := coalesce((v_valore->>'vendita')::numeric, 0);
      v_acquisto := coalesce((v_valore->>'acquisto')::numeric, 0);
      if v_tipo = 'none' and (v_vendita <> 0 or v_acquisto <> 0) then
        raise exception '«%»: scegli come si applica la maggiorazione', v_nome;
      end if;
      if v_tipo = 'percentuale' and (v_vendita <= -100 or v_acquisto <= -100) then
        raise exception '«%» azzererebbe il prezzo', v_nome;
      end if;
      v_opzioni := coalesce(v_valore->'opzioni', '[]'::jsonb);
      if jsonb_typeof(v_opzioni) <> 'array' then
        raise exception '«%»: l''elenco di cosa comprende va scritto come lista', v_nome;
      end if;
      if jsonb_array_length(v_opzioni) > 300 then
        raise exception '«%»: al massimo 300 voci nell''elenco', v_nome;
      end if;
      for v_voce in select * from jsonb_array_elements(v_opzioni) loop
        if jsonb_typeof(v_voce) <> 'string'
           or btrim(v_voce #>> '{}') = ''
           or length(v_voce #>> '{}') > 120 then
          raise exception '«%»: nell''elenco c''è una voce vuota o più lunga di 120 caratteri', v_nome;
        end if;
      end loop;
    end loop;

    -- 1. La variabile nei prodotti che non ce l'hanno.
    if v_completa then
      select coalesce(bool_or(a.obbligatorio), v_base is not null) into v_obbligatorio
        from public.article_family_axes a
        join public.article_families f on f.id = a.family_id
       where f.macrocategoria_id = p_macrocategoria_id
         and f.deleted_at is null
         and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave;

      insert into public.article_family_axes (family_id, company_id, nome, codice, tipo, obbligatorio, sort_order)
      select f.id, f.company_id, v_nome_asse, v_chiave, 'discrete', v_obbligatorio,
             coalesce((select max(a2.sort_order) + 1 from public.article_family_axes a2 where a2.family_id = f.id), 0)
        from public.article_families f
       where f.macrocategoria_id = p_macrocategoria_id
         and f.deleted_at is null
         and not exists (
           select 1 from public.article_family_axes a
            where a.family_id = f.id
              and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave
         )
      on conflict (family_id, codice) do nothing;
      get diagnostics v_n = row_count;
      v_assi_creati := v_assi_creati + v_n;
    end if;

    -- 2. I valori, uno per uno: aggiornati dove ci sono, aggiunti dove mancano.
    for v_valore in select * from jsonb_array_elements(v_asse->'valori') loop
      v_nome := btrim(v_valore->>'nome');
      v_k := public.listino_codice_testo(v_nome);
      v_vendita := round(coalesce((v_valore->>'vendita')::numeric, 0), 4);
      v_acquisto := round(coalesce((v_valore->>'acquisto')::numeric, 0), 4);
      v_tipo := case when v_vendita = 0 and v_acquisto = 0 then 'none' else coalesce(v_valore->>'tipo', 'percentuale') end;
      v_attivo := coalesce((v_valore->>'attivo')::boolean, true);
      v_opzioni := coalesce(v_valore->'opzioni', '[]'::jsonb);

      if coalesce((v_valore->>'aggiorna')::boolean, true) then
        update public.article_family_axis_values v
           set maggiorazione_tipo = v_tipo,
               maggiorazione_valore = v_vendita,
               maggiorazione_acquisto = v_acquisto,
               attivo = v_attivo,
               is_default = v.is_default and v_attivo
          from public.article_family_axes a
          join public.article_families f on f.id = a.family_id
         where v.axis_id = a.id
           and f.macrocategoria_id = p_macrocategoria_id
           and f.deleted_at is null
           and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave
           and public.listino_codice_testo(coalesce(nullif(btrim(v.label), ''), v.valore)) = v_k;
        get diagnostics v_n = row_count;
        v_valori := v_valori + v_n;
      end if;

      if coalesce((v_valore->>'aggiorna_opzioni')::boolean, false) then
        update public.article_family_axis_values v
           set opzioni = v_opzioni
          from public.article_family_axes a
          join public.article_families f on f.id = a.family_id
         where v.axis_id = a.id
           and f.macrocategoria_id = p_macrocategoria_id
           and f.deleted_at is null
           and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave
           and public.listino_codice_testo(coalesce(nullif(btrim(v.label), ''), v.valore)) = v_k
           and v.opzioni is distinct from v_opzioni;
        get diagnostics v_n = row_count;
        v_elenchi := v_elenchi + v_n;
      end if;

      if v_completa then
        insert into public.article_family_axis_values (
          axis_id, company_id, valore, label, is_default,
          maggiorazione_tipo, maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo, opzioni
        )
        select a.id, a.company_id, v_k, v_nome, v_attivo and v_k = v_base,
               v_tipo, v_vendita, v_acquisto,
               coalesce((select max(v2.sort_order) + 1 from public.article_family_axis_values v2 where v2.axis_id = a.id), 0),
               v_attivo, v_opzioni
          from public.article_family_axes a
          join public.article_families f on f.id = a.family_id
         where f.macrocategoria_id = p_macrocategoria_id
           and f.deleted_at is null
           and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave
           and not exists (
             select 1 from public.article_family_axis_values v
              where v.axis_id = a.id
                and public.listino_codice_testo(coalesce(nullif(btrim(v.label), ''), v.valore)) = v_k
           )
        on conflict (axis_id, valore) do nothing;
        get diagnostics v_n = row_count;
        v_aggiunti := v_aggiunti + v_n;
      end if;
    end loop;

    -- 3. Lo stesso valore di serie in tutti i prodotti, se è cambiato.
    if v_allinea and v_base is not null then
      update public.article_family_axis_values v
         set is_default = (public.listino_codice_testo(coalesce(nullif(btrim(v.label), ''), v.valore)) = v_base and v.attivo)
        from public.article_family_axes a
        join public.article_families f on f.id = a.family_id
       where v.axis_id = a.id
         and f.macrocategoria_id = p_macrocategoria_id
         and f.deleted_at is null
         and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave
         and v.is_default is distinct from
             (public.listino_codice_testo(coalesce(nullif(btrim(v.label), ''), v.valore)) = v_base and v.attivo);

      select f.nome into v_senza
        from public.article_families f
        join public.article_family_axes a on a.family_id = f.id
       where f.macrocategoria_id = p_macrocategoria_id
         and f.deleted_at is null
         and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave
         and not exists (select 1 from public.article_family_axis_values v where v.axis_id = a.id and v.is_default)
       limit 1;
      if v_senza is not null then
        raise exception '«%» non ha «%» acceso: non può essere il valore di serie di «%»', v_senza, btrim(v_asse->>'base'), v_nome_asse;
      end if;
    end if;

    -- 4. Nessun prodotto con la variabile e tutti i valori spenti.
    select f.nome into v_senza
      from public.article_families f
      join public.article_family_axes a on a.family_id = f.id
     where f.macrocategoria_id = p_macrocategoria_id
       and f.deleted_at is null
       and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave
       and exists (select 1 from public.article_family_axis_values v where v.axis_id = a.id)
       and not exists (select 1 from public.article_family_axis_values v where v.axis_id = a.id and v.attivo)
     limit 1;
    if v_senza is not null then
      raise exception '«%» resterebbe senza valori accesi in «%»: lasciane acceso almeno uno', v_senza, v_nome_asse;
    end if;
  end loop;

  return jsonb_build_object('valori', v_valori, 'elenchi', v_elenchi, 'aggiunti', v_aggiunti, 'assi', v_assi_creati);
end;
$$;

revoke all on function public.listino_varianti_tipologia(uuid, jsonb) from public, anon;
grant execute on function public.listino_varianti_tipologia(uuid, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Copia di una tipologia: la copia dei valori porta anche l'elenco.
-- Il resto è la funzione di 20280916500000.
-- ─────────────────────────────────────────────────────────────────────────
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
               v.attivo, v.codice, v.prezzo_vendita, v.prezzo_acquisto, v.immagine_url, v.opzioni
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

revoke all on function public.listino_copia_tipologia(uuid, text, text, numeric, boolean) from public, anon;
grant execute on function public.listino_copia_tipologia(uuid, text, text, numeric, boolean) to authenticated;
