-- «Prezzi delle linee»: il prezzo al m² ricalcola solo i prezzi propri dei
-- prodotti al m² (05/10/2026).
--
-- Con 20281005235300 un prezzo al m² nuovo ricalcolava il prezzo proprio delle
-- linee di TUTTI i prodotti della tipologia, anche di quelli a pezzo o a
-- misura libera, il cui prezzo base non cambia: un prezzo proprio voluto
-- diverso (l'indipendenza fra marche del 22/09/2026) tornava a base × (1 + %)
-- senza che niente fosse cambiato. Ora il prezzo al m² conta solo dove ha
-- davvero aggiornato il prezzo base: i prodotti al m², e per l'acquisto non
-- quelli «acquisto + ricarico» con sconti fornitore (lì il costo salvato è il
-- lordo e non si scrive). Il cambio di percentuale di una linea vale come
-- prima per tutti. Oggi nessun dato cade nel caso: solo la regola.
-- Unica modifica rispetto a 20281005235300: le due condizioni qui sopra.

create or replace function public.listino_prezzi_linee(
  p_macrocategoria_id uuid,
  p_linee jsonb,
  p_prezzo_vendita_mq numeric default null::numeric,
  p_prezzo_acquisto_mq numeric default null::numeric
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  v_linea jsonb;
  v_chiave text;
  v_pct numeric;
  v_tipo text;
  v_attiva boolean;
  v_base text;
  v_attive int := 0;
  v_n int;
  v_valori int := 0;
  v_prodotti int := 0;
  v_a_ricarico int := 0;
  v_propri int := 0;
  v_senza text;
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
  if p_linee is null or jsonb_typeof(p_linee) <> 'array' or jsonb_array_length(p_linee) = 0 then
    raise exception 'Nessuna linea da aggiornare';
  end if;
  if p_prezzo_vendita_mq is not null and p_prezzo_vendita_mq <= 0 then
    raise exception 'Il prezzo di vendita al metro quadro deve essere maggiore di zero';
  end if;
  if p_prezzo_acquisto_mq is not null and p_prezzo_acquisto_mq < 0 then
    raise exception 'Il prezzo di acquisto non può essere negativo';
  end if;

  for v_linea in select * from jsonb_array_elements(p_linee) loop
    v_pct := coalesce((v_linea->>'pct')::numeric, 0);
    if v_pct <= -100 then
      raise exception 'La linea «%» azzera il prezzo', v_linea->>'nome';
    end if;
    if coalesce((v_linea->>'attiva')::boolean, true) then
      v_attive := v_attive + 1;
      if v_base is null and v_pct = 0 then
        v_base := public.listino_codice_testo(v_linea->>'nome');
      end if;
    end if;
  end loop;
  if v_attive = 0 then
    raise exception 'Serve almeno una linea attiva';
  end if;

  -- 1. Prezzo al m² dei prodotti della tipologia (prima delle linee).
  if p_prezzo_vendita_mq is not null or p_prezzo_acquisto_mq is not null then
    update public.article_families f
       set prezzo_base_vendita = case
             when f.prezzo_base_mode = 'acquisto_markup' then f.prezzo_base_vendita
             else coalesce(p_prezzo_vendita_mq, f.prezzo_base_vendita)
           end,
           prezzo_base_acquisto = case
             when f.prezzo_base_mode = 'acquisto_markup'
                  and (coalesce(f.sconto_fornitore_1, 0) > 0 or coalesce(f.sconto_fornitore_2, 0) > 0)
               then f.prezzo_base_acquisto
             else coalesce(p_prezzo_acquisto_mq, f.prezzo_base_acquisto)
           end,
           updated_at = now()
     where f.macrocategoria_id = p_macrocategoria_id
       and f.deleted_at is null
       and f.modalita_prezzo_base = 'mq';
    get diagnostics v_prodotti = row_count;
    if p_prezzo_vendita_mq is not null then
      select count(*) into v_a_ricarico
        from public.article_families f
       where f.macrocategoria_id = p_macrocategoria_id
         and f.deleted_at is null
         and f.modalita_prezzo_base = 'mq'
         and f.prezzo_base_mode = 'acquisto_markup';
    end if;
  end if;

  -- 2. Le linee.
  for v_linea in select * from jsonb_array_elements(p_linee) loop
    v_chiave := public.listino_codice_testo(v_linea->>'nome');
    v_pct := round(coalesce((v_linea->>'pct')::numeric, 0), 4);
    v_tipo := case when v_pct = 0 then 'none' else 'percentuale' end;
    v_attiva := coalesce((v_linea->>'attiva')::boolean, true);
    -- Nelle espressioni di SET, v.* è la riga com'era prima: «è cambiata» si
    -- legge lì.
    update public.article_family_axis_values v
       set maggiorazione_tipo = v_tipo,
           maggiorazione_valore = v_pct,
           maggiorazione_acquisto = case
             when v.maggiorazione_valore is distinct from v_pct or v.maggiorazione_tipo is distinct from v_tipo
               then v_pct
             else v.maggiorazione_acquisto
           end,
           prezzo_vendita = case
             when v.prezzo_vendita is not null
                  and f.modalita_prezzo_base <> 'griglia'
                  and f.prezzo_base_mode = 'vendita'
                  and coalesce(f.prezzo_base_vendita, 0) > 0
                  and (v.maggiorazione_valore is distinct from v_pct
                       or v.maggiorazione_tipo is distinct from v_tipo
                       or (p_prezzo_vendita_mq is not null and f.modalita_prezzo_base = 'mq'))
               then round(f.prezzo_base_vendita * (1 + v_pct / 100), 2)
             else v.prezzo_vendita
           end,
           prezzo_acquisto = case
             when v.prezzo_acquisto is not null
                  and f.modalita_prezzo_base <> 'griglia'
                  and coalesce(f.prezzo_base_acquisto, 0) > 0
                  and (v.maggiorazione_valore is distinct from v_pct
                       or v.maggiorazione_tipo is distinct from v_tipo
                       or (p_prezzo_acquisto_mq is not null
                           and f.modalita_prezzo_base = 'mq'
                           and not (f.prezzo_base_mode = 'acquisto_markup'
                                    and (coalesce(f.sconto_fornitore_1, 0) > 0
                                         or coalesce(f.sconto_fornitore_2, 0) > 0))))
               then round(f.prezzo_base_acquisto * (1 + (case
                      when v.maggiorazione_valore is distinct from v_pct or v.maggiorazione_tipo is distinct from v_tipo
                        then v_pct
                      else coalesce(v.maggiorazione_acquisto, 0)
                    end) / 100), 2)
             else v.prezzo_acquisto
           end,
           attivo = v_attiva,
           is_default = case
             when v_base is null then v.is_default and v_attiva
             else v_attiva and v_chiave = v_base
           end
      from public.article_family_axes a
      join public.article_families f on f.id = a.family_id
     where v.axis_id = a.id
       and f.macrocategoria_id = p_macrocategoria_id
       and f.deleted_at is null
       and (public.listino_codice_testo(a.codice) in ('linea', 'serie')
            or public.listino_codice_testo(a.nome) in ('linea', 'serie'))
       and public.listino_codice_testo(coalesce(nullif(btrim(v.label), ''), v.valore)) = v_chiave;
    get diagnostics v_n = row_count;
    v_valori := v_valori + v_n;
  end loop;

  select count(*) into v_propri
    from public.article_family_axis_values v
    join public.article_family_axes a on a.id = v.axis_id
    join public.article_families f on f.id = a.family_id
   where f.macrocategoria_id = p_macrocategoria_id
     and f.deleted_at is null
     and v.prezzo_vendita is not null
     and (public.listino_codice_testo(a.codice) in ('linea', 'serie')
          or public.listino_codice_testo(a.nome) in ('linea', 'serie'));

  -- Un prodotto non può restare con l'asse delle linee e nessuna linea accesa.
  select f.nome into v_senza
    from public.article_families f
    join public.article_family_axes a on a.family_id = f.id
   where f.macrocategoria_id = p_macrocategoria_id
     and f.deleted_at is null
     and (public.listino_codice_testo(a.codice) in ('linea', 'serie')
          or public.listino_codice_testo(a.nome) in ('linea', 'serie'))
     and exists (select 1 from public.article_family_axis_values v where v.axis_id = a.id)
     and not exists (select 1 from public.article_family_axis_values v where v.axis_id = a.id and v.attivo)
   limit 1;
  if v_senza is not null then
    raise exception '«%» resterebbe senza linee accese: lasciane accesa almeno una', v_senza;
  end if;

  return jsonb_build_object(
    'valori', v_valori,
    'prodotti_prezzo', v_prodotti,
    'prodotti_a_ricarico', v_a_ricarico,
    'linee_prezzo_proprio', v_propri
  );
end;
$function$;
