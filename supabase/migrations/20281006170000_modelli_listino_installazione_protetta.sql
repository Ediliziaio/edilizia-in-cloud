-- ════════════════════════════════════════════════════════════════════════════
-- Modelli di listino: l'installazione non fa danni in silenzio (06/10/2026).
--
-- Renova Solution, 05/10: il modello «Infissi con disegno automatico» è stato installato con due chiamate nella stessa
-- transazione (due nomi di linea) e tutte le varianti sono arrivate a maggiorazione «none»: il modello è la fotografia
-- di Demo Azienda 2 e non porta le regole di prezzo dell'azienda che lo installa, mentre i prodotti di Renova avevano
-- maggiorazioni % su colore, vetro, telaio. Nessuno se n'è accorto finché non l'ha visto un preventivo.
--
--  1. Protezione: lock per (modello, azienda) — una seconda chiamata contemporanea si ferma subito con un messaggio —
--     e rifiuto di una installazione identica (stesso modello, stessi nomi di linea) entro 60 secondi.
--  2. Maggiorazioni: se l'azienda ha già prodotti nella stessa tipologia con una maggiorazione sulla stessa variante
--     (stesso asse + stesso valore), l'installazione chiede di scegliere: copiarla sui prodotti nuovi o lasciarli a
--     «nessuna». Senza scelta (p_copia_maggiorazioni null) si ferma PRIMA di scrivere qualsiasi cosa.
--     La regola copiata è la più frequente fra i prodotti dell'azienda nella tipologia, ignorando le varianti a zero.
--     Solo il lato vendita: l'acquisto resta fuori dai modelli, come prima.
--  3. listino_modello_anteprima: dice cosa succederebbe (prodotti nuovi, varianti con regola, installazione recente)
--     senza scrivere niente. Usa lo stesso codice dell'installazione, quindi non può dire una cosa e farne un'altra.
--
-- Solo funzioni: istantanea. Idempotente: CREATE OR REPLACE e DROP della vecchia firma a 3 argomenti.
-- Il corpo di installazione parte da quello in produzione (con la patch visibile_se di 20281005120000).
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

-- I nomi dei modelli («PVC Salamander 72», «PVC Aluplast»): la tipologia «Serramenti», che il modello fotografa con
-- UNA linea di esempio, diventa una linea per ogni nome con tutti i prodotti della linea di esempio. Le altre
-- tipologie (persiane, accessori) restano come sono. Era dentro listino_modello_installa: ora lo usano anche
-- l'anteprima e l'installazione, quindi non possono divergere.
create or replace function public.listino_modello_contenuto_con_nomi(p_contenuto jsonb, p_modelli text[])
returns jsonb
language sql
stable
set search_path = public
as $$
  select case
    when p_modelli is null or cardinality(p_modelli) = 0 then p_contenuto
    else (
      select jsonb_set(p_contenuto, '{tipologie}', coalesce(jsonb_agg(
        case
          when lower(btrim(t.tip ->> 'nome')) = 'serramenti' then
            jsonb_set(jsonb_set(t.tip, '{linee}', coalesce((
              select jsonb_agg(
                jsonb_build_object('chiave', 'm' || n.i, 'nome', btrim(n.nome), 'sort_order', n.i,
                  'colore', t.tip -> 'linee' -> 0 -> 'colore', 'icona', t.tip -> 'linee' -> 0 -> 'icona',
                  'descrizione', t.tip -> 'linee' -> 0 -> 'descrizione') order by n.i)
                from unnest(p_modelli) with ordinality as n(nome, i)
               where btrim(n.nome) <> ''), '[]'::jsonb)),
              '{prodotti}', coalesce((
                select jsonb_agg(jsonb_set(p.prod, '{linea}', to_jsonb('m' || n.i)) order by n.i, p.ord)
                  from unnest(p_modelli) with ordinality as n(nome, i)
                  cross join lateral (
                    select value as prod, ord
                      from jsonb_array_elements(t.tip -> 'prodotti') with ordinality as e(value, ord)
                     where e.value ->> 'linea' = t.tip -> 'linee' -> 0 ->> 'chiave') p
                 where btrim(n.nome) <> ''), '[]'::jsonb))
          else t.tip end order by t.ord), '[]'::jsonb))
        from jsonb_array_elements(p_contenuto -> 'tipologie') with ordinality as t(tip, ord))
  end
$$;

revoke all on function public.listino_modello_contenuto_con_nomi(jsonb, text[]) from public, anon, authenticated;

-- Le maggiorazioni che l'azienda ha già, per variante: chiave «codice asse|valore» (minuscolo, senza spazi ai bordi)
-- → {tipo, valore}. Solo i prodotti attivi della tipologia, solo le varianti attive e con una maggiorazione vera:
-- le «none» non dicono niente (sono il valore di partenza). Se per la stessa variante i prodotti non concordano,
-- vince la regola usata più spesso; a parità, la prima per tipo e valore, così il risultato non cambia da una volta
-- all'altra.
create or replace function public.listino_modello_regole_maggiorazione(p_company_id uuid, p_macro uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(k.chiave, jsonb_build_object('tipo', k.tipo, 'valore', k.numero)), '{}'::jsonb)
    from (
      select distinct on (r.chiave) r.chiave, r.tipo, r.numero
        from (
          select lower(btrim(a.codice)) || '|' || lower(btrim(v.valore)) as chiave,
                 v.maggiorazione_tipo as tipo,
                 coalesce(v.maggiorazione_valore, 0) as numero,
                 count(*) as n
            from public.article_families f
            join public.article_family_axes a on a.family_id = f.id
            join public.article_family_axis_values v on v.axis_id = a.id
           where f.company_id = p_company_id
             and f.macrocategoria_id = p_macro
             and f.attivo
             and f.deleted_at is null
             and coalesce(v.attivo, true)
             and v.maggiorazione_tipo <> 'none'
           group by 1, 2, 3
        ) r
       order by r.chiave, r.n desc, r.tipo, r.numero
    ) k
$$;

revoke all on function public.listino_modello_regole_maggiorazione(uuid, uuid) from public, anon, authenticated;

-- Il lavoro vero, uguale per l'anteprima e per l'installazione. Con p_anteprima non scrive niente: stessi controlli,
-- stesso giro su tipologie, linee e prodotti, ma conta soltanto. Con p_copia le varianti dei prodotti nuovi prendono
-- la regola dell'azienda quando ce n'è una.
create or replace function public.listino_modello_installa_core(
  p_modello_id uuid,
  p_company_id uuid,
  p_modelli text[],
  p_copia boolean,
  p_anteprima boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
set lock_timeout = '5s'
as $$
declare
  v_uid uuid := auth.uid();
  v_super boolean;
  v_mod public.listino_modelli_area%rowtype;
  v_t jsonb;
  v_l jsonb;
  v_p jsonb;
  v_a jsonb;
  v_macro uuid;
  v_cat uuid;
  v_fam uuid;
  v_ax uuid;
  v_mappa_linee jsonb;
  v_linee_da_creare jsonb;
  v_mappa_valori jsonb;
  v_mappa_asse jsonb;
  v_verticali text[];
  v_n int;
  v_n_copiate int;
  v_tip_nuove int := 0;
  v_tip_esistenti int := 0;
  v_linee_nuove int := 0;
  v_schede int := 0;
  v_prod_nuovi int := 0;
  v_prod_presenti int := 0;
  v_varianti int := 0;
  v_celle int := 0;
  v_documenti int := 0;
  v_copiate int := 0;
  v_copiabili int := 0;
  v_assi jsonb := '{}'::jsonb;
  v_regole jsonb := '{}'::jsonb;
  v_nomi jsonb;
  v_recente timestamptz;
  v_esito jsonb;
  v_contenuto jsonb;
begin
  if v_uid is null then
    raise exception 'Accesso non autorizzato' using errcode = '42501';
  end if;
  v_super := public.has_role(v_uid, 'super_admin'::public.app_role);

  select * into v_mod from public.listino_modelli_area where id = p_modello_id;
  if not found or (not v_super and not v_mod.pubblicato) then
    raise exception 'Modello non disponibile' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Azienda non trovata' using errcode = 'P0002';
  end if;
  -- Come la regola che lascia creare le tipologie (listino_copia_tipologia):
  -- l'amministratore dell'azienda, anche da accesso multi-azienda, o il super admin.
  if not v_super and (
       public.utente_bloccato()
       or not (
         (public.has_role(v_uid, 'company_admin'::public.app_role)
          and public.get_user_company_id(v_uid) = p_company_id)
         or exists (
           select 1 from public.multi_company_access mca
            where mca.user_id = v_uid
              and mca.company_id = p_company_id
              and mca.status = 'active'
              and (mca.expires_at is null or mca.expires_at > now())
              and mca.access_role::text = 'company_admin'))) then
    raise exception 'Solo l''amministratore dell''azienda può aggiungere un''area da un modello' using errcode = '42501';
  end if;

  -- I nomi richiesti, ripuliti e in ordine: servono a riconoscere una richiesta identica a una appena fatta.
  v_nomi := to_jsonb(array(
    select distinct lower(btrim(n.nome)) as nome
      from unnest(coalesce(p_modelli, '{}'::text[])) as n(nome)
     where btrim(n.nome) <> ''
     order by 1));

  -- Una sola installazione alla volta per (modello, azienda). Chi arriva mentre l'altra lavora non aspetta e non
  -- riprova da solo: si ferma con un messaggio. Il lock cade da solo alla fine della transazione.
  if not p_anteprima
     and not pg_try_advisory_xact_lock(hashtextextended(
           'listino_modello_installa:' || p_modello_id::text || ':' || p_company_id::text, 0)) then
    raise exception 'Questo modello si sta già aggiungendo: aspetta qualche secondo e guarda il listino.'
      using errcode = 'P0001', hint = 'installazione_in_corso';
  end if;

  -- Una richiesta identica (stesso modello, stessi nomi di linea) nell'ultimo minuto è un doppio click o una doppia
  -- chiamata: non si rifà. Dopo un minuto si può ripetere, e i prodotti già presenti restano com'erano.
  select i.installato_il into v_recente
    from public.listino_modelli_installazioni i
   where i.modello_id = p_modello_id
     and i.company_id = p_company_id
     and i.installato_il > now() - interval '60 seconds'
     and coalesce(i.esito -> 'modelli_richiesti', '[]'::jsonb) = v_nomi
   order by i.installato_il desc
   limit 1;
  if v_recente is not null and not p_anteprima then
    raise exception 'Questo modello è già stato aggiunto alle %: non lo aggiungo di nuovo.',
      to_char(v_recente at time zone 'Europe/Rome', 'HH24:MI')
      using errcode = 'P0001', hint = 'installazione_recente';
  end if;

  v_contenuto := public.listino_modello_contenuto_con_nomi(v_mod.contenuto, p_modelli);

  for v_t in select value from jsonb_array_elements(coalesce(v_contenuto -> 'tipologie', '[]'::jsonb)) loop
    v_verticali := array(select jsonb_array_elements_text(coalesce(v_t -> 'verticali_abilitati', '[]'::jsonb)));

    -- La tipologia: quella con lo stesso nome se l'azienda ce l'ha già.
    select id into v_macro
      from public.listino_macrocategorie
     where company_id = p_company_id and lower(btrim(nome)) = lower(btrim(v_t ->> 'nome'))
     limit 1;
    if v_macro is null then
      if not p_anteprima then
        insert into public.listino_macrocategorie
          (company_id, nome, descrizione, icona, colore, sort_order, attivo, verticali_abilitati,
           immagine_url, descrizione_estesa, mostra_pagina_dedicata_pdf, categoria_tipo, tipologia, fv_categoria)
        values
          (p_company_id, btrim(v_t ->> 'nome'), v_t ->> 'descrizione', v_t ->> 'icona', v_t ->> 'colore',
           coalesce((v_t ->> 'sort_order')::int, 0), coalesce((v_t ->> 'attivo')::boolean, true), v_verticali,
           v_t ->> 'immagine_url', v_t ->> 'descrizione_estesa',
           coalesce((v_t ->> 'mostra_pagina_dedicata_pdf')::boolean, false),
           coalesce(v_t ->> 'categoria_tipo', 'principale'), v_t ->> 'tipologia', v_t ->> 'fv_categoria')
        returning id into v_macro;
      end if;
      v_tip_nuove := v_tip_nuove + 1;
    else
      if not p_anteprima then
        -- Si riempiono solo i buchi: il collegamento al preventivatore e al
        -- configuratore fotovoltaico, se la tipologia dell'azienda non l'ha.
        update public.listino_macrocategorie
           set verticali_abilitati = case when coalesce(cardinality(verticali_abilitati), 0) = 0
                                          then v_verticali else verticali_abilitati end,
               tipologia = coalesce(tipologia, v_t ->> 'tipologia'),
               fv_categoria = coalesce(fv_categoria, v_t ->> 'fv_categoria')
         where id = v_macro
           and ((coalesce(cardinality(verticali_abilitati), 0) = 0 and cardinality(v_verticali) > 0)
                or (tipologia is null and v_t ->> 'tipologia' is not null)
                or (fv_categoria is null and v_t ->> 'fv_categoria' is not null));
      end if;
      v_tip_esistenti := v_tip_esistenti + 1;
    end if;

    if not p_anteprima then
      insert into public.listino_macrocategoria_fields
        (macrocategoria_id, field_key, field_label, field_type, field_unit, field_options, field_placeholder,
         field_help, required, show_in_picker, show_in_pdf, sort_order)
      select v_macro, c ->> 'field_key', coalesce(c ->> 'field_label', c ->> 'field_key'),
             coalesce(c ->> 'field_type', 'text'), c ->> 'field_unit',
             case when jsonb_typeof(c -> 'field_options') = 'null' then null else c -> 'field_options' end,
             c ->> 'field_placeholder', c ->> 'field_help',
             coalesce((c ->> 'required')::boolean, false), coalesce((c ->> 'show_in_picker')::boolean, true),
             coalesce((c ->> 'show_in_pdf')::boolean, true), coalesce((c ->> 'sort_order')::int, 0)
        from jsonb_array_elements(coalesce(v_t -> 'campi', '[]'::jsonb)) c
       where nullif(c ->> 'field_key', '') is not null
      on conflict (macrocategoria_id, field_key) do nothing;
    end if;

    -- Le maggiorazioni che l'azienda ha già in questa tipologia, lette PRIMA di aggiungere qualsiasi cosa: i prodotti
    -- che stiamo per creare non devono contare come «esistenti».
    v_regole := case
      when v_macro is not null and (p_anteprima or coalesce(p_copia, false))
        then public.listino_modello_regole_maggiorazione(p_company_id, v_macro)
      else '{}'::jsonb end;

    -- Le linee: quelle con lo stesso nome dentro la tipologia si riusano.
    v_mappa_linee := '{}'::jsonb;
    v_linee_da_creare := '{}'::jsonb;
    for v_l in select value from jsonb_array_elements(coalesce(v_t -> 'linee', '[]'::jsonb)) loop
      select id into v_cat
        from public.listino_categorie
       where company_id = p_company_id and macrocategoria_id = v_macro
         and lower(btrim(nome)) = lower(btrim(v_l ->> 'nome'))
       limit 1;
      if v_cat is null then
        if p_anteprima then
          -- Una linea che non c'è: tutti i suoi prodotti sarebbero nuovi.
          v_linee_da_creare := v_linee_da_creare || jsonb_build_object(v_l ->> 'chiave', true);
        else
          insert into public.listino_categorie
            (company_id, nome, colore, icona, margine_target_percentuale, sort_order, macrocategoria_id,
             descrizione, immagine_url)
          values
            (p_company_id, btrim(v_l ->> 'nome'), v_l ->> 'colore', v_l ->> 'icona',
             (v_l ->> 'margine_target_percentuale')::numeric, coalesce((v_l ->> 'sort_order')::int, 0), v_macro,
             v_l ->> 'descrizione', v_l ->> 'immagine_url')
          returning id into v_cat;
        end if;
        v_linee_nuove := v_linee_nuove + 1;
      end if;
      v_mappa_linee := v_mappa_linee || jsonb_build_object(v_l ->> 'chiave', v_cat);
    end loop;

    if not p_anteprima then
      insert into public.listino_schede_linea
        (company_id, macrocategoria_id, chiave, nome, descrizione, immagine_url, profondita_mm, camere,
         guarnizioni, uw, scheda_tecnica_url, scheda_tecnica_nome)
      select p_company_id, v_macro, s ->> 'chiave', s ->> 'nome', s ->> 'descrizione', s ->> 'immagine_url',
             (s ->> 'profondita_mm')::int, (s ->> 'camere')::smallint, (s ->> 'guarnizioni')::smallint,
             (s ->> 'uw')::numeric, s ->> 'scheda_tecnica_url', s ->> 'scheda_tecnica_nome'
        from jsonb_array_elements(coalesce(v_t -> 'schede_linea', '[]'::jsonb)) s
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_schede := v_schede + v_n;
    end if;

    -- I prodotti: uno già presente con lo stesso nome, nella stessa linea, si salta.
    for v_p in select value from jsonb_array_elements(coalesce(v_t -> 'prodotti', '[]'::jsonb)) loop
      v_cat := case when v_p ->> 'linea' is null then null else (v_mappa_linee ->> (v_p ->> 'linea'))::uuid end;
      if not coalesce(v_linee_da_creare ? (v_p ->> 'linea'), false)
         and exists (
           select 1 from public.article_families g
            where g.company_id = p_company_id
              and g.vertical = v_p ->> 'vertical'
              and g.nome = v_p ->> 'nome'
              and g.attivo and g.deleted_at is null
              and g.categoria_id is not distinct from v_cat) then
        v_prod_presenti := v_prod_presenti + 1;
        continue;
      end if;

      if p_anteprima then
        v_prod_nuovi := v_prod_nuovi + 1;
        -- Le varianti del prodotto nuovo dove l'azienda ha già una maggiorazione diversa da quella del modello.
        if v_regole <> '{}'::jsonb then
          for v_a in select value from jsonb_array_elements(coalesce(v_p -> 'assi', '[]'::jsonb)) loop
            select count(*) into v_n
              from jsonb_array_elements(coalesce(v_a -> 'valori', '[]'::jsonb)) v
              cross join lateral (
                select v_regole -> (lower(btrim(v_a ->> 'codice')) || '|' || lower(btrim(v ->> 'valore'))) as r) x
             where x.r is not null
               and (x.r ->> 'tipo' is distinct from coalesce(v ->> 'maggiorazione_tipo', 'none')
                    or (x.r ->> 'valore')::numeric is distinct from coalesce((v ->> 'maggiorazione_valore')::numeric, 0));
            if v_n > 0 then
              v_copiabili := v_copiabili + v_n;
              v_assi := v_assi || jsonb_build_object(
                coalesce(v_a ->> 'nome', v_a ->> 'codice'),
                coalesce((v_assi ->> coalesce(v_a ->> 'nome', v_a ->> 'codice'))::int, 0) + v_n);
            end if;
          end loop;
        end if;
        continue;
      end if;

      insert into public.article_families
        (company_id, vertical, categoria_id, nome, descrizione, immagine_url, pdf_scheda_url,
         modalita_prezzo_base, prezzo_base_vendita, prezzo_base_acquisto, vat_rate, unit_of_measure,
         griglia_asse_x_label, griglia_asse_y_label, griglia_unita, attivo, sort_order, custom_field_values,
         posa_linked, prezzo_base_mode, markup_tipo, markup_valore, manodopera_modalita,
         manodopera_prezzo_vendita, manodopera_unita, macrocategoria_id, codice, mostra_preventivo,
         disegno_tipologia, disegno_definizione)
      values
        (p_company_id, v_p ->> 'vertical', v_cat, v_p ->> 'nome', v_p ->> 'descrizione',
         v_p ->> 'immagine_url', v_p ->> 'pdf_scheda_url',
         coalesce(v_p ->> 'modalita_prezzo_base', 'pz'),
         coalesce((v_p ->> 'prezzo_base_vendita')::numeric, 0), null,
         coalesce((v_p ->> 'vat_rate')::numeric, 22), coalesce(v_p ->> 'unit_of_measure', 'pz'),
         v_p ->> 'griglia_asse_x_label', v_p ->> 'griglia_asse_y_label', v_p ->> 'griglia_unita',
         true, (v_p ->> 'sort_order')::int, coalesce(v_p -> 'campi', '{}'::jsonb),
         false, 'vendita', 'none', 0, coalesce(v_p ->> 'manodopera_modalita', 'nessuna'),
         coalesce((v_p ->> 'manodopera_prezzo_vendita')::numeric, 0), coalesce(v_p ->> 'manodopera_unita', 'pz'),
         v_macro, v_p ->> 'codice',
         -- Senza i prezzi del modello il prodotto aspetta il prezzo dell'azienda
         -- fuori dai preventivi, come gli «Esempio» del listino.
         case when v_mod.con_prezzi_vendita then coalesce((v_p ->> 'mostra_preventivo')::boolean, true) else false end,
         v_p ->> 'disegno_tipologia',
         case when jsonb_typeof(v_p -> 'disegno_definizione') = 'object' then v_p -> 'disegno_definizione' else null end)
      returning id into v_fam;
      v_prod_nuovi := v_prod_nuovi + 1;

      v_mappa_valori := '{}'::jsonb;
      for v_a in select value from jsonb_array_elements(coalesce(v_p -> 'assi', '[]'::jsonb)) loop
        insert into public.article_family_axes
          (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order, visibile_se)
        values
          (v_fam, p_company_id, v_a ->> 'nome', v_a ->> 'codice', v_a ->> 'descrizione',
           coalesce(v_a ->> 'tipo', 'discrete'), coalesce((v_a ->> 'obbligatorio')::boolean, true),
           coalesce((v_a ->> 'sort_order')::int, 0),
           case when jsonb_typeof(v_a -> 'visibile_se') = 'object' then v_a -> 'visibile_se' else null end)
        returning id into v_ax;

        -- La maggiorazione di ogni variante: quella dell'azienda se si è scelto di copiarla e ne ha una per lo
        -- stesso asse e valore, altrimenti quella del modello.
        with nuovi as (
          insert into public.article_family_axis_values
            (axis_id, company_id, valore, label, descrizione, is_default, maggiorazione_tipo,
             maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo, codice, prezzo_vendita,
             prezzo_acquisto, immagine_url, opzioni)
          select v_ax, p_company_id, v ->> 'valore', coalesce(v ->> 'label', v ->> 'valore'), v ->> 'descrizione',
                 coalesce((v ->> 'is_default')::boolean, false),
                 case when x.r is not null then x.r ->> 'tipo' else coalesce(v ->> 'maggiorazione_tipo', 'none') end,
                 case when x.r is not null then (x.r ->> 'valore')::numeric
                      else coalesce((v ->> 'maggiorazione_valore')::numeric, 0) end,
                 0,
                 coalesce((v ->> 'sort_order')::int, 0), coalesce((v ->> 'attivo')::boolean, true),
                 v ->> 'codice', (v ->> 'prezzo_vendita')::numeric, null, v ->> 'immagine_url',
                 case when jsonb_typeof(v -> 'opzioni') in ('array', 'object') then v -> 'opzioni' else '[]'::jsonb end
            from jsonb_array_elements(coalesce(v_a -> 'valori', '[]'::jsonb)) v
            cross join lateral (
              select case when coalesce(p_copia, false) and v_regole <> '{}'::jsonb
                          then v_regole -> (lower(btrim(v_a ->> 'codice')) || '|' || lower(btrim(v ->> 'valore')))
                     end as r) x
          returning id, valore, maggiorazione_tipo, maggiorazione_valore
        )
        select coalesce(jsonb_object_agg(v ->> 'chiave', n.id), '{}'::jsonb), count(*),
               count(*) filter (
                 where n.maggiorazione_tipo is distinct from coalesce(v ->> 'maggiorazione_tipo', 'none')
                    or n.maggiorazione_valore is distinct from coalesce((v ->> 'maggiorazione_valore')::numeric, 0))
          into v_mappa_asse, v_n, v_n_copiate
          from jsonb_array_elements(coalesce(v_a -> 'valori', '[]'::jsonb)) v
          join nuovi n on n.valore = v ->> 'valore';
        v_mappa_valori := v_mappa_valori || v_mappa_asse;
        v_varianti := v_varianti + v_n;
        v_copiate := v_copiate + v_n_copiate;
      end loop;

      insert into public.listino_griglia
        (company_id, family_id, axis_config, valore_x, valore_y, prezzo_vendita, prezzo_acquisto, note)
      select p_company_id, v_fam,
             case when jsonb_typeof(g -> 'axis_config') = 'null' then null else g -> 'axis_config' end,
             -- Senza i prezzi del modello la griglia arriva con le misure e
             -- le caselle a zero, da riempire.
             (g ->> 'x')::int, (g ->> 'y')::int, coalesce((g ->> 'pv')::numeric, 0), null, g ->> 'note'
        from jsonb_array_elements(coalesce(v_p -> 'griglia', '[]'::jsonb)) g;
      get diagnostics v_n = row_count;
      v_celle := v_celle + v_n;

      insert into public.article_family_documents
        (company_id, family_id, nome, url, tipo, file_size, created_by, axis_value_id)
      select p_company_id, v_fam, d ->> 'nome', d ->> 'url', coalesce(d ->> 'tipo', 'scheda_tecnica'),
             (d ->> 'file_size')::int, v_uid,
             case when d ->> 'valore' is null then null else (v_mappa_valori ->> (d ->> 'valore'))::uuid end
        from jsonb_array_elements(coalesce(v_p -> 'documenti', '[]'::jsonb)) d
       where d ->> 'valore' is null or v_mappa_valori ? (d ->> 'valore');
      get diagnostics v_n = row_count;
      v_documenti := v_documenti + v_n;
    end loop;
  end loop;

  if p_anteprima then
    return jsonb_build_object(
      'modello', v_mod.nome,
      'prodotti_nuovi', v_prod_nuovi,
      'prodotti_gia_presenti', v_prod_presenti,
      'maggiorazioni_copiabili', v_copiabili,
      'assi', coalesce((
        select jsonb_agg(jsonb_build_object('asse', e.key, 'varianti', e.value::int) order by e.value::int desc, e.key)
          from jsonb_each_text(v_assi) e), '[]'::jsonb),
      'installazione_recente', v_recente);
  end if;

  v_esito := jsonb_build_object(
    'modello', v_mod.nome,
    'area', v_mod.area,
    'tipologie_nuove', v_tip_nuove,
    'tipologie_gia_presenti', v_tip_esistenti,
    'linee_nuove', v_linee_nuove,
    'schede_linea', v_schede,
    'prodotti_nuovi', v_prod_nuovi,
    'prodotti_gia_presenti', v_prod_presenti,
    'varianti', v_varianti,
    'celle_griglia', v_celle,
    'documenti', v_documenti,
    'con_prezzi', v_mod.con_prezzi_vendita,
    'maggiorazioni_copiate', v_copiate,
    'copia_maggiorazioni', coalesce(p_copia, false),
    'modelli_richiesti', v_nomi);

  insert into public.listino_modelli_installazioni (modello_id, company_id, installato_da, esito)
  values (p_modello_id, p_company_id, v_uid, v_esito);

  return v_esito;
end;
$$;

revoke all on function public.listino_modello_installa_core(uuid, uuid, text[], boolean, boolean) from public, anon, authenticated;

-- Cosa succederebbe installando: prodotti nuovi e già presenti, quante varianti prenderebbero una maggiorazione già
-- dell'azienda (e su quali assi), e se lo stesso modello è appena stato aggiunto. Non scrive niente.
create or replace function public.listino_modello_anteprima(
  p_modello_id uuid,
  p_company_id uuid,
  p_modelli text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.listino_modello_installa_core(p_modello_id, p_company_id, p_modelli, false, true);
end;
$$;

revoke all on function public.listino_modello_anteprima(uuid, uuid, text[]) from public, anon;
grant execute on function public.listino_modello_anteprima(uuid, uuid, text[]) to authenticated;

-- L'installazione. p_copia_maggiorazioni: true = i prodotti nuovi prendono le maggiorazioni che l'azienda ha già
-- sulle stesse varianti; false = restano quelle del modello; null = «non ho scelto»: se ce ne sono da copiare ci si
-- ferma prima di scrivere, altrimenti si va avanti come sempre.
drop function if exists public.listino_modello_installa(uuid, uuid, text[]);

create or replace function public.listino_modello_installa(
  p_modello_id uuid,
  p_company_id uuid,
  p_modelli text[] default null,
  p_copia_maggiorazioni boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prima jsonb;
  v_assi text;
begin
  if p_copia_maggiorazioni is null then
    v_prima := public.listino_modello_installa_core(p_modello_id, p_company_id, p_modelli, false, true);
    if coalesce((v_prima ->> 'maggiorazioni_copiabili')::int, 0) > 0 then
      select string_agg(a ->> 'asse', ', ') into v_assi from jsonb_array_elements(v_prima -> 'assi') a;
      raise exception 'Hai già prodotti con maggiorazioni sulle stesse varianti (%): scegli se copiarle sui prodotti nuovi o lasciarli senza.', v_assi
        using errcode = 'P0001', hint = 'maggiorazioni_da_scegliere';
    end if;
  end if;
  return public.listino_modello_installa_core(p_modello_id, p_company_id, p_modelli,
                                              coalesce(p_copia_maggiorazioni, false), false);
end;
$$;

revoke all on function public.listino_modello_installa(uuid, uuid, text[], boolean) from public, anon;
grant execute on function public.listino_modello_installa(uuid, uuid, text[], boolean) to authenticated;
