-- La libreria di marche e serie di profilo, e l'import che non duplica il listino.
--
-- Oggi la libreria di piattaforma ha un solo livello: la tipologia (finestra a
-- due ante, porta finestra…). Manca il livello sopra — la marca e la serie di
-- profilo — che è proprio quello con cui un serramentista descrive il suo
-- lavoro: «io monto Aluplast Ideal 5000». Senza quel livello l'unica strada per
-- avere due serie a listino è duplicare tutte le tipologie, ed è esattamente
-- quello che è successo a chi ci è arrivato prima: cinque articoli con lo stesso
-- nome e 115 categorie per 119 articoli.
--
-- Qui la serie diventa una LINEA dentro le tipologie che l'azienda già ha:
-- importarne una seconda non crea trenta righe nuove, aggiunge una voce all'asse
-- "Linea" di ogni tipologia, con il suo scostamento in percentuale. È lo stesso
-- standard applicato a mano a Renova, reso installabile in un clic.
--
-- I dati tecnici (profondità, camere, Uw) restano VUOTI di proposito: vanno
-- ricopiati dalla scheda del fornitore, non indovinati. La libreria porta i nomi
-- veri e la struttura; i numeri li mette chi li ha sotto gli occhi.

create table if not exists public.serramenti_marche (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null,
  paese text,
  sito_url text,
  logo_url text,
  -- pvc, alluminio, legno, legno_alluminio, acciaio
  materiali text[] not null default '{}',
  descrizione text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists serramenti_marche_slug_uniq on public.serramenti_marche (slug);

create table if not exists public.serramenti_serie (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.serramenti_marche(id) on delete cascade,
  nome text not null,
  slug text not null,
  materiale text not null,
  -- Dati tecnici: si compilano dalla scheda del fornitore.
  profondita_mm integer,
  camere integer,
  guarnizioni integer,
  uw_min numeric(4,2),
  -- La fascia commerciale, come la usano i configuratori: sceglierla al posto di
  -- venti domande tecniche è ciò che rende un preventivo veloce.
  fascia text check (fascia in ('basic', 'medium', 'top')),
  -- Scostamento suggerito dal prezzo base dell'azienda, in percentuale.
  differenza_pct numeric(6,2) not null default 0,
  immagine_url text,
  descrizione text,
  -- Quali tipologie offre questa serie: vuoto = tutte quelle vetrate.
  tipologie_incluse text[] not null default '{}',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists serramenti_serie_marca_nome_uniq on public.serramenti_serie (marca_id, nome);
create index if not exists serramenti_serie_marca_idx on public.serramenti_serie (marca_id);

alter table public.serramenti_marche enable row level security;
alter table public.serramenti_serie enable row level security;

-- Catalogo di piattaforma: lo legge chiunque sia autenticato, lo scrive il superadmin.
drop policy if exists serramenti_marche_lettura on public.serramenti_marche;
create policy serramenti_marche_lettura on public.serramenti_marche
  for select to authenticated
  using (is_active or (select public.has_role((select auth.uid()), 'super_admin'::app_role)));

drop policy if exists serramenti_marche_scrittura on public.serramenti_marche;
create policy serramenti_marche_scrittura on public.serramenti_marche
  for all to authenticated
  using ((select public.has_role((select auth.uid()), 'super_admin'::app_role)))
  with check ((select public.has_role((select auth.uid()), 'super_admin'::app_role)));

drop policy if exists serramenti_serie_lettura on public.serramenti_serie;
create policy serramenti_serie_lettura on public.serramenti_serie
  for select to authenticated
  using (is_active or (select public.has_role((select auth.uid()), 'super_admin'::app_role)));

drop policy if exists serramenti_serie_scrittura on public.serramenti_serie;
create policy serramenti_serie_scrittura on public.serramenti_serie
  for all to authenticated
  using ((select public.has_role((select auth.uid()), 'super_admin'::app_role)))
  with check ((select public.has_role((select auth.uid()), 'super_admin'::app_role)));

drop trigger if exists serramenti_marche_updated on public.serramenti_marche;
create trigger serramenti_marche_updated before update on public.serramenti_marche
  for each row execute function public.update_updated_at_column();
drop trigger if exists serramenti_serie_updated on public.serramenti_serie;
create trigger serramenti_serie_updated before update on public.serramenti_serie
  for each row execute function public.update_updated_at_column();

-- --------------------------------------------------------------------------
-- L'import di una serie dentro il listino di un'azienda.
-- --------------------------------------------------------------------------
create or replace function public.importa_serie_serramenti(
  p_serie_id uuid,
  p_company_id uuid,
  p_macrocategoria_id uuid default null,
  p_prezzo_vendita_mq numeric default null,
  p_prezzo_acquisto_mq numeric default null,
  p_differenza_pct numeric default null,
  p_installa_mancanti boolean default true
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_super boolean;
  v_serie public.serramenti_serie%rowtype;
  v_marca public.serramenti_marche%rowtype;
  v_linea_nome text;
  v_linea_valore text;
  v_diff numeric;
  v_tpl record;
  v_family_id uuid;
  v_axis_id uuid;
  v_value_id uuid;
  v_create int := 0;
  v_aggiornate int := 0;
  v_ha_default boolean;
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  v_super := public.has_role(v_user, 'super_admin'::app_role);
  if not v_super and public.get_user_company_id(v_user) is distinct from p_company_id then
    raise exception 'not a member of company %', p_company_id using errcode = '42501';
  end if;

  select * into v_serie from public.serramenti_serie where id = p_serie_id and is_active;
  if not found then raise exception 'serie % non trovata', p_serie_id; end if;
  select * into v_marca from public.serramenti_marche where id = v_serie.marca_id;

  v_linea_nome := v_marca.nome || ' ' || v_serie.nome;
  v_linea_valore := v_marca.slug || '_' || v_serie.slug;
  v_diff := coalesce(p_differenza_pct, v_serie.differenza_pct, 0);

  for v_tpl in
    select t.* from public.article_family_templates t
     where t.is_active
       and t.vertical_slug = 'serramenti'
       and t.categoria_slug = 'infissi'
       and (cardinality(v_serie.tipologie_incluse) = 0
            or t.tipologia = any (v_serie.tipologie_incluse))
     order by t.sort_order, t.nome
  loop
    -- La tipologia esiste già? Allora la serie le aggiunge una linea; non la duplica.
    select id into v_family_id
      from public.article_families
     where company_id = p_company_id
       and vertical = v_tpl.vertical_slug
       and nome = v_tpl.nome
     limit 1;

    if v_family_id is null then
      if not p_installa_mancanti then continue; end if;
      v_family_id := public.import_article_family_template(
        v_tpl.id, p_company_id, p_macrocategoria_id, null);
      v_create := v_create + 1;
    else
      v_aggiornate := v_aggiornate + 1;
    end if;

    -- Prezzo al metro quadro, se l'azienda l'ha indicato.
    if p_prezzo_vendita_mq is not null then
      update public.article_families
         set modalita_prezzo_base = 'mq',
             prezzo_base_mode = 'vendita',
             prezzo_base_vendita = p_prezzo_vendita_mq,
             prezzo_base_acquisto = coalesce(p_prezzo_acquisto_mq, prezzo_base_acquisto),
             unit_of_measure = 'mq',
             updated_at = now()
       where id = v_family_id
         and (prezzo_base_vendita is null or prezzo_base_vendita = 0);
    end if;

    -- L'asse "Linea": davanti a colore e vetro, è la scelta che pesa di più.
    select id into v_axis_id from public.article_family_axes
     where family_id = v_family_id and codice = 'linea' limit 1;
    if v_axis_id is null then
      insert into public.article_family_axes
        (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
      values (v_family_id, p_company_id, 'Linea', 'linea',
              'Il modello di profilo. La prima linea è quella di base; le altre si scostano in percentuale.',
              'discrete', true, -1)
      returning id into v_axis_id;
    end if;

    select exists (
      select 1 from public.article_family_axis_values
       where axis_id = v_axis_id and attivo and is_default and valore <> 'linea_base'
    ) into v_ha_default;

    select id into v_value_id from public.article_family_axis_values
     where axis_id = v_axis_id and valore = v_linea_valore limit 1;

    if v_value_id is null then
      insert into public.article_family_axis_values
        (axis_id, company_id, valore, label, is_default, maggiorazione_tipo,
         maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo, immagine_url)
      values (v_axis_id, p_company_id, v_linea_valore, v_linea_nome,
              not v_ha_default,
              case when v_diff = 0 then 'none' else 'percentuale' end,
              v_diff, v_diff,
              coalesce((select max(sort_order) + 1 from public.article_family_axis_values
                         where axis_id = v_axis_id), 0),
              true, v_serie.immagine_url);
    else
      update public.article_family_axis_values
         set label = v_linea_nome,
             maggiorazione_tipo = case when v_diff = 0 then 'none' else 'percentuale' end,
             maggiorazione_valore = v_diff,
             maggiorazione_acquisto = v_diff,
             immagine_url = coalesce(v_serie.immagine_url, immagine_url),
             attivo = true
       where id = v_value_id;
    end if;

    -- Il segnaposto nato dal modello sparisce appena c'è una linea vera.
    update public.article_family_axis_values
       set attivo = false, is_default = false
     where axis_id = v_axis_id and valore = 'linea_base'
       and exists (select 1 from public.article_family_axis_values v2
                    where v2.axis_id = v_axis_id and v2.attivo and v2.valore <> 'linea_base');
  end loop;

  return jsonb_build_object(
    'serie', v_linea_nome,
    'linea', v_linea_valore,
    'differenza_pct', v_diff,
    'tipologie_create', v_create,
    'tipologie_aggiornate', v_aggiornate
  );
end;
$$;

revoke all on function public.importa_serie_serramenti(uuid, uuid, uuid, numeric, numeric, numeric, boolean) from public, anon;
grant execute on function public.importa_serie_serramenti(uuid, uuid, uuid, numeric, numeric, numeric, boolean) to authenticated;
