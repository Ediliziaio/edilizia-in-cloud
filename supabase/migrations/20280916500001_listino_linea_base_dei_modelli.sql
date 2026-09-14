-- I modelli pronti nascono con una linea «Linea base» (valore 'linea_base').
--
-- Provato il 14/09/2026 su Renova, in una transazione annullata: un modello
-- importato dentro Serramenti aveva la sua «Linea base» accesa, e per questo
-- listino_allinea_linee lo considerava già a posto (0 prodotti allineati) e
-- listino_aggiungi_linea gli metteva la linea nuova accanto a «Linea base».
-- Nel listino compariva una linguetta «Linea base» con un prodotto solo.
--
-- Come fa già importa_serie_serramenti: 'linea_base' non conta come linea
-- quando ce ne sono di vere, e si spegne quando il prodotto riceve quelle vere.
-- Idempotente: solo CREATE OR REPLACE.

create or replace function public.listino_aggiungi_linea(
  p_macrocategoria_id uuid,
  p_nome text,
  p_scostamento_pct numeric default 0,
  p_nome_base text default null,
  p_copia_da text default null,
  p_immagine_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_nome_base text := nullif(btrim(coalesce(p_nome_base, '')), '');
  v_chiave text;
  v_chiave_base text;
  v_chiave_origine text := nullif(public.listino_codice_testo(p_copia_da), '');
  v_pct numeric := round(coalesce(p_scostamento_pct, 0), 4);
  v_con_linee int;
  v_fam record;
  v_axis_id uuid;
  v_value_id uuid;
  v_value_attivo boolean;
  v_img text;
  v_desc text;
  v_valore text;
  v_n int;
  v_aggiunte int := 0;
  v_riattivate int := 0;
  v_gia int := 0;
  v_saltati int := 0;
begin
  if v_user is null then
    raise exception 'Accesso non autenticato' using errcode = '42501';
  end if;
  select company_id into v_company from public.listino_macrocategorie where id = p_macrocategoria_id;
  if v_company is null then
    raise exception 'Tipologia non trovata';
  end if;
  if not public.has_permission_for_company(v_user, 'can_edit_settings_pricing', v_company) then
    raise exception 'Non hai il permesso di modificare il listino di questa azienda' using errcode = '42501';
  end if;

  v_chiave := public.listino_codice_testo(v_nome);
  if v_chiave = '' then
    raise exception 'Scrivi il nome della linea';
  end if;
  if v_pct <= -100 then
    raise exception 'Uno scostamento di % per cento azzera il prezzo', v_pct;
  end if;

  -- Prodotti con linee vere: la «Linea base» dei modelli pronti non conta.
  select count(*) into v_con_linee
    from public.article_families f
   where f.macrocategoria_id = p_macrocategoria_id
     and f.deleted_at is null
     and exists (
       select 1
         from public.article_family_axes a
         join public.article_family_axis_values v
           on v.axis_id = a.id and v.attivo and v.valore <> 'linea_base'
        where a.family_id = f.id
          and (public.listino_codice_testo(a.codice) in ('linea', 'serie')
               or public.listino_codice_testo(a.nome) in ('linea', 'serie')));

  if v_con_linee = 0 then
    if v_nome_base is null then
      raise exception 'Questa tipologia non ha ancora linee: scrivi anche il nome della linea che ha adesso';
    end if;
    v_chiave_base := public.listino_codice_testo(v_nome_base);
    if v_chiave_base = '' then
      raise exception 'Scrivi il nome della linea che la tipologia ha adesso';
    end if;
    if v_chiave_base = v_chiave then
      raise exception 'La linea nuova e quella che c''è già hanno lo stesso nome';
    end if;
  end if;

  for v_fam in
    select f.id
      from public.article_families f
     where f.macrocategoria_id = p_macrocategoria_id
       and f.deleted_at is null
     order by f.nome
  loop
    select a.id into v_axis_id
      from public.article_family_axes a
     where a.family_id = v_fam.id
       and (public.listino_codice_testo(a.codice) in ('linea', 'serie')
            or public.listino_codice_testo(a.nome) in ('linea', 'serie'))
     order by (public.listino_codice_testo(a.codice) = 'linea') desc, a.sort_order
     limit 1;

    if v_con_linee > 0 then
      -- La tipologia ha già le sue linee: un prodotto senza (o con la sola
      -- «Linea base») resta com'è e le riceve tutte da listino_allinea_linee.
      if v_axis_id is null or not exists (
        select 1 from public.article_family_axis_values
         where axis_id = v_axis_id and attivo and valore <> 'linea_base'
      ) then
        v_saltati := v_saltati + 1;
        continue;
      end if;
    else
      -- Prima linea della tipologia: nasce l'asse, con la linea di adesso come base.
      if v_axis_id is null then
        insert into public.article_family_axes
          (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
        values (v_fam.id, v_company, 'Linea', 'linea',
                'La linea del prodotto: quella di base e le altre, che si scostano in percentuale.',
                'discrete', true, -1)
        returning id into v_axis_id;
      end if;

      select id into v_value_id
        from public.article_family_axis_values
       where axis_id = v_axis_id
         and public.listino_codice_testo(coalesce(nullif(btrim(label), ''), valore)) = v_chiave_base
       limit 1;
      if v_value_id is null then
        v_valore := v_chiave_base;
        v_n := 1;
        while exists (select 1 from public.article_family_axis_values where axis_id = v_axis_id and valore = v_valore) loop
          v_n := v_n + 1;
          v_valore := v_chiave_base || '_' || v_n;
        end loop;
        insert into public.article_family_axis_values
          (axis_id, company_id, valore, label, is_default, maggiorazione_tipo,
           maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo)
        values (v_axis_id, v_company, v_valore, v_nome_base, true, 'none', 0, 0, 0, true)
        returning id into v_value_id;
      else
        update public.article_family_axis_values
           set attivo = true, is_default = true, label = v_nome_base,
               maggiorazione_tipo = 'none', maggiorazione_valore = 0, maggiorazione_acquisto = 0
         where id = v_value_id;
      end if;
      update public.article_family_axis_values
         set is_default = false
       where axis_id = v_axis_id and id <> v_value_id and is_default;
      -- La «Linea base» del modello pronto lascia il posto a quella con il nome vero.
      update public.article_family_axis_values
         set attivo = false
       where axis_id = v_axis_id and id <> v_value_id and valore = 'linea_base' and attivo;
    end if;

    v_value_id := null;
    v_value_attivo := null;
    select id, attivo into v_value_id, v_value_attivo
      from public.article_family_axis_values
     where axis_id = v_axis_id
       and public.listino_codice_testo(coalesce(nullif(btrim(label), ''), valore)) = v_chiave
     limit 1;

    v_img := null;
    v_desc := null;
    if v_chiave_origine is not null then
      select immagine_url, descrizione into v_img, v_desc
        from public.article_family_axis_values
       where axis_id = v_axis_id
         and public.listino_codice_testo(coalesce(nullif(btrim(label), ''), valore)) = v_chiave_origine
       limit 1;
    end if;

    if v_value_id is not null then
      if v_value_attivo then
        v_gia := v_gia + 1;
      else
        update public.article_family_axis_values
           set attivo = true,
               label = v_nome,
               maggiorazione_tipo = case when v_pct = 0 then 'none' else 'percentuale' end,
               maggiorazione_valore = v_pct,
               maggiorazione_acquisto = v_pct,
               immagine_url = coalesce(p_immagine_url, v_img, immagine_url)
         where id = v_value_id;
        v_riattivate := v_riattivate + 1;
      end if;
    else
      v_valore := v_chiave;
      v_n := 1;
      while exists (select 1 from public.article_family_axis_values where axis_id = v_axis_id and valore = v_valore) loop
        v_n := v_n + 1;
        v_valore := v_chiave || '_' || v_n;
      end loop;
      insert into public.article_family_axis_values
        (axis_id, company_id, valore, label, descrizione, is_default, maggiorazione_tipo,
         maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo, immagine_url)
      values (v_axis_id, v_company, v_valore, v_nome, v_desc, false,
              case when v_pct = 0 then 'none' else 'percentuale' end,
              v_pct, v_pct,
              coalesce((select max(sort_order) + 1 from public.article_family_axis_values where axis_id = v_axis_id), 0),
              true, coalesce(p_immagine_url, v_img));
      v_aggiunte := v_aggiunte + 1;
    end if;
  end loop;

  if v_aggiunte + v_riattivate + v_gia = 0 then
    raise exception 'Nessun prodotto a cui dare la linea: la tipologia è vuota';
  end if;

  return jsonb_build_object(
    'linea', v_nome,
    'aggiunte', v_aggiunte,
    'riattivate', v_riattivate,
    'gia_presenti', v_gia,
    'saltati', v_saltati
  );
end;
$$;

create or replace function public.listino_allinea_linee(p_macrocategoria_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  v_rif_axis uuid;
  v_fam record;
  v_axis_id uuid;
  v_val record;
  v_chiave text;
  v_valore text;
  v_n int;
  v_prodotti int := 0;
  v_linee int := 0;
begin
  if v_user is null then
    raise exception 'Accesso non autenticato' using errcode = '42501';
  end if;
  select company_id into v_company from public.listino_macrocategorie where id = p_macrocategoria_id;
  if v_company is null then
    raise exception 'Tipologia non trovata';
  end if;
  if not public.has_permission_for_company(v_user, 'can_edit_settings_pricing', v_company) then
    raise exception 'Non hai il permesso di modificare il listino di questa azienda' using errcode = '42501';
  end if;

  -- Il modello: il prodotto con più linee vere accese.
  select a.id into v_rif_axis
    from public.article_family_axes a
    join public.article_families f on f.id = a.family_id
    join public.article_family_axis_values v
      on v.axis_id = a.id and v.attivo and v.valore <> 'linea_base'
   where f.macrocategoria_id = p_macrocategoria_id
     and f.deleted_at is null
     and (public.listino_codice_testo(a.codice) in ('linea', 'serie')
          or public.listino_codice_testo(a.nome) in ('linea', 'serie'))
   group by a.id, f.nome
   order by count(*) desc, f.nome
   limit 1;
  if v_rif_axis is null then
    raise exception 'Nessun prodotto di questa tipologia ha delle linee da copiare';
  end if;
  select count(*) into v_linee
    from public.article_family_axis_values
   where axis_id = v_rif_axis and attivo and valore <> 'linea_base';

  for v_fam in
    select f.id
      from public.article_families f
     where f.macrocategoria_id = p_macrocategoria_id
       and f.deleted_at is null
       and not exists (
         select 1
           from public.article_family_axes a
           join public.article_family_axis_values v
             on v.axis_id = a.id and v.attivo and v.valore <> 'linea_base'
          where a.family_id = f.id
            and (public.listino_codice_testo(a.codice) in ('linea', 'serie')
                 or public.listino_codice_testo(a.nome) in ('linea', 'serie')))
  loop
    select a.id into v_axis_id
      from public.article_family_axes a
     where a.family_id = v_fam.id
       and (public.listino_codice_testo(a.codice) in ('linea', 'serie')
            or public.listino_codice_testo(a.nome) in ('linea', 'serie'))
     limit 1;
    if v_axis_id is null then
      insert into public.article_family_axes
        (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
      select v_fam.id, v_company, a.nome, a.codice, a.descrizione, a.tipo, a.obbligatorio, a.sort_order
        from public.article_family_axes a
       where a.id = v_rif_axis
      returning id into v_axis_id;
    end if;

    for v_val in
      select * from public.article_family_axis_values
       where axis_id = v_rif_axis and attivo and valore <> 'linea_base'
       order by sort_order
    loop
      v_chiave := public.listino_codice_testo(coalesce(nullif(btrim(v_val.label), ''), v_val.valore));
      if exists (
        select 1 from public.article_family_axis_values
         where axis_id = v_axis_id
           and public.listino_codice_testo(coalesce(nullif(btrim(label), ''), valore)) = v_chiave
      ) then
        update public.article_family_axis_values
           set attivo = true,
               is_default = v_val.is_default,
               maggiorazione_tipo = v_val.maggiorazione_tipo,
               maggiorazione_valore = v_val.maggiorazione_valore,
               maggiorazione_acquisto = v_val.maggiorazione_acquisto
         where axis_id = v_axis_id
           and public.listino_codice_testo(coalesce(nullif(btrim(label), ''), valore)) = v_chiave;
      else
        v_valore := v_val.valore;
        v_n := 1;
        while exists (select 1 from public.article_family_axis_values where axis_id = v_axis_id and valore = v_valore) loop
          v_n := v_n + 1;
          v_valore := v_val.valore || '_' || v_n;
        end loop;
        insert into public.article_family_axis_values
          (axis_id, company_id, valore, label, descrizione, is_default, maggiorazione_tipo,
           maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo, prezzo_vendita,
           prezzo_acquisto, immagine_url)
        values (v_axis_id, v_company, v_valore, v_val.label, v_val.descrizione, v_val.is_default,
                v_val.maggiorazione_tipo, v_val.maggiorazione_valore, v_val.maggiorazione_acquisto,
                v_val.sort_order, true, v_val.prezzo_vendita, v_val.prezzo_acquisto, v_val.immagine_url);
      end if;
    end loop;

    -- La «Linea base» del modello pronto non serve più: il prodotto ha le linee vere.
    update public.article_family_axis_values
       set attivo = false, is_default = false
     where axis_id = v_axis_id and valore = 'linea_base' and attivo;

    v_prodotti := v_prodotti + 1;
  end loop;

  return jsonb_build_object('prodotti', v_prodotti, 'linee', v_linee);
end;
$$;
