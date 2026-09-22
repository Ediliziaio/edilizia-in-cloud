-- Bug segnalato da Fabio (Renova Solution, 22/09/2026): modificando il prezzo
-- di una tipologia per Aluplast, cambiava "automaticamente" anche Salamander.
-- Causa: ogni tipologia serramenti ha UN SOLO prezzo_base_vendita condiviso;
-- marca/serie ("Linea") è solo un ricarico % sopra quel prezzo. Con ricarico
-- 0% (fascia "medium" per entrambe le marche in questo caso), il prezzo
-- mostrato per marche diverse coincide per costruzione — cambiare il prezzo
-- base della tipologia le muove entrambe.
--
-- Il motore di calcolo preventivi ora onora il "prezzo proprio" per valore
-- d'asse (article_family_axis_values.prezzo_vendita/prezzo_acquisto) già
-- usato da ordini/commesse (ArticleCombobox) ma finora ignorato nei
-- preventivi — vedi modifiche applicative a useFamilyPricing.ts e
-- src/lib/serramenti/pricing.ts. Questa migrazione:
--  1. dà a ogni valore "Linea" esistente il proprio prezzo indipendente,
--     calcolato dal prezzo/ricarico ATTUALE — a preventivo invariato finché
--     non lo si tocca esplicitamente;
--  2. aggiorna importa_serie_serramenti così che marche importate da oggi
--     in poi nascano già indipendenti, invece di dover scoprire il problema
--     una tipologia alla volta come ieri.
--
-- Esclusa la modalità "griglia" (prezzo per cella L×H: un numero fisso per
-- marca non la rappresenterebbe) e le famiglie con prezzo_base_mode diverso
-- da 'vendita' (prezzo_base_vendita lì non è il prezzo live, lo è il calcolo
-- da acquisto+markup — al 22/09/2026 nessuna famiglia con asse "linea" è in
-- questo caso, ma il filtro resta come guardia).
--
-- Idempotente: tocca solo prezzo_vendita ancora null.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

update public.article_family_axis_values av
   set prezzo_vendita = round(
         af.prezzo_base_vendita * (1 + case when av.maggiorazione_tipo = 'percentuale'
                                             then av.maggiorazione_valore / 100 else 0 end),
         2),
       prezzo_acquisto = case
         when af.prezzo_base_acquisto is not null and af.prezzo_base_acquisto > 0 then round(
           af.prezzo_base_acquisto * (1 + case when av.maggiorazione_tipo = 'percentuale'
                                               then av.maggiorazione_acquisto / 100 else 0 end),
           2)
         else av.prezzo_acquisto
       end
  from public.article_family_axes ax
  join public.article_families af on af.id = ax.family_id
 where ax.id = av.axis_id
   and ax.codice = 'linea'
   and av.prezzo_vendita is null
   and af.modalita_prezzo_base <> 'griglia'
   and af.prezzo_base_mode = 'vendita';

create or replace function public.importa_serie_serramenti(p_serie_id uuid, p_company_id uuid, p_macrocategoria_id uuid DEFAULT NULL::uuid, p_prezzo_vendita_mq numeric DEFAULT NULL::numeric, p_prezzo_acquisto_mq numeric DEFAULT NULL::numeric, p_differenza_pct numeric DEFAULT NULL::numeric, p_installa_mancanti boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Prezzo base ATTUALE della famiglia (dopo l'eventuale update sopra), per
  -- dare a una marca/serie il proprio prezzo indipendente invece di un
  -- ricarico % sul base condiviso — vedi nota in cima al file di migrazione.
  v_base_vendita numeric;
  v_base_acquisto numeric;
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  v_super := public.has_role(v_user, 'super_admin'::app_role);
  if not v_super and public.get_user_company_id(v_user) is distinct from p_company_id then
    raise exception 'not a member of company %', p_company_id using errcode = '42501';
  end if;
  if p_macrocategoria_id is not null and not exists (
    select 1 from public.listino_macrocategorie
     where id = p_macrocategoria_id and company_id = p_company_id
  ) then
    raise exception 'La tipologia scelta non è di questa azienda' using errcode = '42501';
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
    -- Il prodotto dell'azienda con lo stesso nome del modello: non quello nel
    -- cestino, e con il verticale scritto in uno dei modi in cui compare.
    select id into v_family_id
      from public.article_families
     where company_id = p_company_id
       and vertical in ('serramenti', 'serramentista', 'serramentisti', 'infissi')
       and nome = v_tpl.nome
       and deleted_at is null
     order by attivo desc, created_at
     limit 1;

    if v_family_id is null then
      if not p_installa_mancanti then continue; end if;
      v_family_id := public.import_article_family_template(
        v_tpl.id, p_company_id, p_macrocategoria_id, null);
      v_create := v_create + 1;
    else
      v_aggiornate := v_aggiornate + 1;
    end if;

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

    select prezzo_base_vendita, prezzo_base_acquisto
      into v_base_vendita, v_base_acquisto
      from public.article_families
     where id = v_family_id;

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

    -- Stesso codice, oppure stesso nome scritto in un altro modo: una linea
    -- sola, non due linguette uguali.
    select id into v_value_id from public.article_family_axis_values
     where axis_id = v_axis_id
       and (valore = v_linea_valore
            or public.listino_codice_testo(coalesce(nullif(btrim(label), ''), valore))
               = public.listino_codice_testo(v_linea_nome))
     order by (valore = v_linea_valore) desc
     limit 1;

    if v_value_id is null then
      insert into public.article_family_axis_values
        (axis_id, company_id, valore, label, is_default, maggiorazione_tipo,
         maggiorazione_valore, maggiorazione_acquisto, prezzo_vendita, prezzo_acquisto,
         sort_order, attivo, immagine_url)
      values (v_axis_id, p_company_id, v_linea_valore, v_linea_nome,
              not v_ha_default,
              case when v_diff = 0 then 'none' else 'percentuale' end,
              v_diff, v_diff,
              round(coalesce(v_base_vendita, 0) * (1 + v_diff / 100), 2),
              case when v_base_acquisto is not null and v_base_acquisto > 0
                   then round(v_base_acquisto * (1 + v_diff / 100), 2) else null end,
              coalesce((select max(sort_order) + 1 from public.article_family_axis_values
                         where axis_id = v_axis_id), 0),
              true, v_serie.immagine_url);
    else
      -- prezzo_vendita/acquisto: coalesce, mai sovrascritti se già impostati
      -- (un re-import non deve cancellare un prezzo indipendente già scelto
      -- dall'azienda per questa marca/serie).
      update public.article_family_axis_values
         set label = v_linea_nome,
             maggiorazione_tipo = case when v_diff = 0 then 'none' else 'percentuale' end,
             maggiorazione_valore = v_diff,
             maggiorazione_acquisto = v_diff,
             immagine_url = coalesce(v_serie.immagine_url, immagine_url),
             prezzo_vendita = coalesce(prezzo_vendita,
               round(coalesce(v_base_vendita, 0) * (1 + v_diff / 100), 2)),
             prezzo_acquisto = coalesce(prezzo_acquisto,
               case when v_base_acquisto is not null and v_base_acquisto > 0
                    then round(v_base_acquisto * (1 + v_diff / 100), 2) else null end),
             attivo = true
       where id = v_value_id;
    end if;

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
$function$;
