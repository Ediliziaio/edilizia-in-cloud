-- Versamenti fiscali e contributivi: quello che spetta, quello che è uscito dalla banca (15/11/2026)
--
-- Lo Stato patrimoniale considera versati alla scadenza ritenute, contributi, IVA e imposte: gli F24
-- quasi nessuno li registra. Adesso:
--
-- 1. public.cg_get_versamenti_fiscali(azienda, anno): per ogni scadenza dell'anno quello che spetta
--    (ritenute e contributi dei cedolini il 16 del mese dopo, TFR al Fondo Tesoreria INPS, IVA delle
--    liquidazioni, imposta sostitutiva sul TFR il 16/12 e il 16/2, saldo e acconti di IRES e IRAP il
--    30/6 e il 30/11 col metodo storico, F24 registrati) e quello che è uscito dalla banca: movimenti
--    con una voce di cassa di tributi o contributi, o con «F24» nella descrizione, assegnati alla
--    scadenza più vicina entro 20 giorni. Stato: pagato, parziale, non trovato, da venire, non
--    verificabile (nessun conto collegato). Le imposte sono stime dal conto economico.
-- 2. Stato patrimoniale, imposte dell'esercizio: meno gli acconti IRES e IRAP usciti dalla banca
--    (voci 12.03 e 12.05); se superano le imposte, la differenza è un credito tributario. Fino al
--    30/6 c'è anche il saldo delle imposte dell'anno prima (conto economico dell'anno prima meno
--    acconti e saldi usciti dalla banca): l'utile dell'anno prima è già nelle riserve al netto delle
--    imposte, il debito non c'era.
-- 3. Stato patrimoniale, F24 registrati: contano solo dal mese a cui si riferiscono (un F24 di
--    dicembre registrato in anticipo non è un debito a novembre) e finché non sono pagati alla data.
--    Le ritenute dei cedolini di un mese che ha l'F24 delle ritenute (1001) registrato non si
--    contano due volte: vale l'F24.

-- Uscite dalla banca con certe voci di cassa (codice del catalogo), o con «F24» nella descrizione.
create or replace function private.cg_uscite_voci(p_company uuid, p_dal date, p_al date, p_codici text[], p_anche_f24 boolean)
returns numeric language sql stable security definer set search_path to '' as $$
  select coalesce(sum(-t.amount), 0)
    from public.bank_transactions t
    left join public.cassa_voci v on v.id = t.cassa_voce_id
   where t.company_id = p_company and t.amount < 0
     and coalesce(t.status, 'booked') = 'booked'
     and coalesce(t.value_date, t.booking_date) between p_dal and p_al
     and (v.codice_base = any (p_codici)
          or (p_anche_f24 and t.cassa_voce_id is null
              and (coalesce(t.description, '') ilike '%f24%' or coalesce(t.reference, '') ilike '%f24%')))
$$;
revoke all on function private.cg_uscite_voci(uuid, date, date, text[], boolean) from public, anon, authenticated;

-- Voci di cassa dei versamenti con F24: contributi e ritenute del personale e degli amministratori,
-- IVA, imposte sui redditi, tributi, ritenute sugli autonomi, rateizzazioni.
create or replace function private.cg_codici_f24()
returns text[] language sql immutable set search_path to '' as $$
  select array['06.11', '06.12', '06.13', '07.02', '07.03', '12.01', '12.03', '12.04', '12.05', '12.06',
               '12.07', '12.08', '12.09', '12.10', '12.14', '12.15', '12.16']
$$;
revoke all on function private.cg_codici_f24() from public, anon, authenticated;

-- IVA da versare per periodo, con il credito riportato (come private.cg_posizione_iva_al).
create or replace function private.cg_iva_periodi(p_company uuid, p_anno integer)
returns table(anno integer, periodo integer, periodicita text, scadenza date, da_versare numeric)
language plpgsql stable security definer set search_path to '' as $$
declare
  v_per text;
  v_cred_prec numeric;
  v_volume numeric;
  v_cred numeric := 0;
  v_saldo numeric;
  v_r jsonb;
  y integer;
  p integer;
begin
  select lower(i.periodicita), i.credito_anno_precedente into v_per, v_cred_prec
    from public.fiscalita_impostazioni_iva i
   where i.company_id = p_company and i.anno = p_anno;
  if v_per is null or v_per not in ('mensile', 'trimestrale') then
    select coalesce(sum(case when v.tipo = 'nota_credito' then -abs(coalesce(v.imponibile_totale, 0))
                             else coalesce(v.imponibile_totale, 0) end), 0)
      into v_volume
      from public.fatture_vendite_iva v
     where v.company_id = p_company and v.deleted_at is null
       and v.stato not in ('bozza', 'annullata')
       and extract(year from v.data_emissione) = p_anno - 1;
    v_per := case when v_volume > 800000 then 'mensile' else 'trimestrale' end;
  end if;

  -- L'ultimo periodo dell'anno prima si versa nell'anno.
  for y in p_anno - 1 .. p_anno loop
    if y = p_anno and v_cred_prec is not null then
      v_cred := v_cred_prec;
    end if;
    for p in 1 .. (case when v_per = 'mensile' then 12 else 4 end) loop
      begin
        v_r := public.liquidazione_iva_periodo(p_company, v_per, y,
                 case when v_per = 'mensile' then p end, case when v_per = 'trimestrale' then p end);
      exception when others then
        v_r := null;
      end;
      v_saldo := coalesce((v_r ->> 'saldo')::numeric, 0) - v_cred;
      anno := y;
      periodo := p;
      periodicita := v_per;
      scadenza := case
        when v_per = 'mensile' then (make_date(y, p, 16) + interval '1 month')::date
        when p = 1 then make_date(y, 5, 16)
        when p = 2 then make_date(y, 8, 20)
        when p = 3 then make_date(y, 11, 16)
        else make_date(y + 1, 3, 16) end;
      if v_saldo <= 0 then
        v_cred := -v_saldo;
        da_versare := 0;
      else
        v_cred := 0;
        da_versare := round(v_saldo, 2);
      end if;
      if extract(year from scadenza) = p_anno then
        return next;
      end if;
    end loop;
  end loop;
end $$;
revoke all on function private.cg_iva_periodi(uuid, integer) from public, anon, authenticated;

create or replace function public.cg_get_versamenti_fiscali(p_company_id uuid default null, p_anno integer default extract(year from current_date)::integer)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  v_company_id uuid;
  v_imposte_prec numeric := 0;
  v_acconti_prec numeric := 0;
  v_imp_tfr numeric := 0;
  v_imp_tfr_prec numeric := 0;
  v_conti boolean;
  v_non_classificati integer;
  v_scadenze jsonb;
begin
  perform public._cg_assert_lettura(p_company_id);
  v_company_id := coalesce(p_company_id, public.get_my_company_id());
  if v_company_id is null then
    raise exception 'company_id non risolvibile';
  end if;
  if v_company_id is distinct from public.get_my_company_id()
     and not public.has_role(auth.uid(), 'super_admin'::public.app_role) then
    raise exception 'Accesso negato';
  end if;

  -- Imposte dell'anno prima, stimate dal conto economico, e acconti usciti dalla banca quell'anno.
  select coalesce((v ->> 'valore')::numeric, 0) into v_imposte_prec
    from jsonb_array_elements(public.cg_get_conto_economico_riclassificato(v_company_id, p_anno - 1, 1, 12) -> 'voci') v
   where v ->> 'codice' = '15';
  v_imposte_prec := coalesce(v_imposte_prec, 0);
  v_acconti_prec := private.cg_uscite_voci(v_company_id, make_date(p_anno - 1, 1, 1), make_date(p_anno - 1, 12, 31),
                                           array['12.03', '12.05'], false);

  select coalesce(max(r.imposta) filter (where r.anno = p_anno), 0),
         coalesce(max(r.imposta) filter (where r.anno = p_anno - 1), 0)
    into v_imp_tfr, v_imp_tfr_prec
    from private.cg_tfr_rivalutazione_anni(v_company_id, p_anno) r;

  select exists (select 1 from public.bank_accounts a where a.company_id = v_company_id and coalesce(a.is_active, true))
    into v_conti;

  with attesi as (
    -- Ritenute e contributi dei cedolini: F24 del 16 del mese dopo. Le ritenute di un mese con
    -- l'F24 1001 registrato le dà l'F24.
    select (make_date(c.anno, c.mese, 16) + interval '1 month')::date as scadenza,
           'Ritenute IRPEF dei dipendenti' as voce, sum(coalesce(c.ritenute_irpef, 0)) as importo, 'cedolini' as fonte
      from public.cedolini c
     where c.company_id = v_company_id and c.stato in ('emesso', 'pagato')
       and not exists (select 1 from public.f24_entries f
                        where f.company_id = v_company_id and f.anno = c.anno and f.mese = c.mese and f.tributo_code = '1001')
     group by 1
    union all
    select (make_date(c.anno, c.mese, 16) + interval '1 month')::date,
           'Contributi INPS (dipendenti e azienda)', sum(coalesce(c.contributi_dipendente, 0) + coalesce(c.contributi_datore, 0)), 'cedolini'
      from public.cedolini c
     where c.company_id = v_company_id and c.stato in ('emesso', 'pagato')
     group by 1
    union all
    select (make_date(c.anno, c.mese, 16) + interval '1 month')::date,
           'TFR al Fondo Tesoreria INPS', sum(round(coalesce(c.lordo, 0) / 13.5, 2)), 'cedolini'
      from public.cedolini c
      join public.cg_tfr_destinazioni d on d.employee_id = c.employee_id and d.company_id = v_company_id
                                     and d.destinazione = 'tesoreria_inps'
     where c.company_id = v_company_id and c.stato in ('emesso', 'pagato')
       and make_date(c.anno, c.mese, 1) >= date_trunc('month', d.dal)::date
     group by 1
    union all
    select f.data_scadenza, coalesce(nullif(f.tributo_descrizione, ''), 'F24 codice ' || coalesce(f.tributo_code, '?')),
           coalesce(f.importo, 0), 'F24 registrato'
      from public.f24_entries f
     where f.company_id = v_company_id and f.data_scadenza is not null
    union all
    select i.scadenza,
           'IVA ' || case when i.periodicita = 'mensile' then 'del mese ' else 'del trimestre ' end || i.periodo || '/' || i.anno,
           i.da_versare, 'registri IVA'
      from private.cg_iva_periodi(v_company_id, p_anno) i
     where i.da_versare > 0
    union all
    select make_date(p_anno, 12, 16), 'Imposta sostitutiva sulla rivalutazione del TFR: acconto', round(v_imp_tfr * 0.9, 2), 'stima'
    union all
    select make_date(p_anno, 2, 16), 'Imposta sostitutiva sulla rivalutazione del TFR: saldo ' || (p_anno - 1),
           v_imp_tfr_prec - round(v_imp_tfr_prec * 0.9, 2), 'stima'
    union all
    select make_date(p_anno, 6, 30), 'IRES e IRAP: saldo ' || (p_anno - 1), greatest(v_imposte_prec - v_acconti_prec, 0), 'stima'
    union all
    select make_date(p_anno, 6, 30), 'IRES e IRAP: primo acconto ' || p_anno, round(v_imposte_prec * 0.4, 2), 'stima'
    union all
    select make_date(p_anno, 11, 30), 'IRES e IRAP: secondo acconto ' || p_anno, round(v_imposte_prec * 0.6, 2), 'stima'
  ), righe as (
    select * from attesi where extract(year from scadenza) = p_anno and importo > 0
  ), date_scad as (
    select distinct scadenza from righe
  ), movimenti as (
    -- Ogni uscita va alla scadenza più vicina, entro 20 giorni.
    select -t.amount as importo, coalesce(t.value_date, t.booking_date) as data,
           (select d.scadenza from date_scad d
             where abs(coalesce(t.value_date, t.booking_date) - d.scadenza) <= 20
             order by abs(coalesce(t.value_date, t.booking_date) - d.scadenza), d.scadenza limit 1) as scadenza
      from public.bank_transactions t
      left join public.cassa_voci v on v.id = t.cassa_voce_id
     where t.company_id = v_company_id and t.amount < 0
       and coalesce(t.status, 'booked') = 'booked'
       and coalesce(t.value_date, t.booking_date) between make_date(p_anno, 1, 1) - 20 and make_date(p_anno, 12, 31) + 20
       and (v.codice_base = any (private.cg_codici_f24())
            or (t.cassa_voce_id is null
                and (coalesce(t.description, '') ilike '%f24%' or coalesce(t.reference, '') ilike '%f24%')))
  ), f24_pagati as (
    select f.data_scadenza as scadenza, sum(coalesce(f.importo, 0)) as importo
      from public.f24_entries f
     where f.company_id = v_company_id and f.stato = 'pagato'
     group by 1
  ), per_scadenza as (
    select d.scadenza,
           (select jsonb_agg(jsonb_build_object('voce', r.voce, 'importo', round(r.importo, 2), 'fonte', r.fonte) order by r.voce)
              from righe r where r.scadenza = d.scadenza) as voci,
           (select round(sum(r.importo), 2) from righe r where r.scadenza = d.scadenza) as atteso,
           coalesce((select round(sum(m.importo), 2) from movimenti m where m.scadenza = d.scadenza), 0) as pagato_banca,
           coalesce((select round(sum(f.importo), 2) from f24_pagati f where f.scadenza = d.scadenza), 0) as pagato_f24
      from date_scad d
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'scadenza', s.scadenza, 'voci', s.voci, 'atteso', s.atteso,
           'pagato_banca', s.pagato_banca, 'pagato_f24', s.pagato_f24,
           'stato', case
             when s.scadenza > current_date then 'da_venire'
             when greatest(s.pagato_banca, s.pagato_f24) >= s.atteso - 1 then 'pagato'
             when not v_conti and s.pagato_f24 = 0 then 'non_verificabile'
             when greatest(s.pagato_banca, s.pagato_f24) > 0 then 'parziale'
             else 'non_trovato' end)
           order by s.scadenza), '[]'::jsonb)
    into v_scadenze
    from per_scadenza s;

  select count(*) into v_non_classificati
    from public.bank_transactions t
   where t.company_id = v_company_id and t.amount < 0 and t.cassa_voce_id is null
     and coalesce(t.value_date, t.booking_date) between make_date(p_anno, 1, 1) and make_date(p_anno, 12, 31)
     and (coalesce(t.description, '') ilike '%f24%' or coalesce(t.reference, '') ilike '%f24%');

  return jsonb_build_object(
    'anno', p_anno,
    'conti_bancari', v_conti,
    'f24_non_classificati', v_non_classificati,
    'imposte_anno_prima', round(v_imposte_prec, 2),
    'acconti_anno_prima_in_banca', round(v_acconti_prec, 2),
    'scadenze', v_scadenze);
end $$;
revoke all on function public.cg_get_versamenti_fiscali(uuid, integer) from public, anon;
grant execute on function public.cg_get_versamenti_fiscali(uuid, integer) to authenticated, service_role;

do $p$
declare
  sp text := pg_get_functiondef('public.cg_get_stato_patrimoniale_riclassificato(uuid,integer,date)'::regprocedure);
  prima text[] := array[
    $a$  v_imposte_es numeric(14,2) := 0;$a$,
    $a$  v_imposte_es := COALESCE(v_imposte_es, 0);$a$,
    $a$  FROM public.f24_entries
  WHERE company_id = v_company_id
    AND stato IN ('da_pagare','parzialmente_pagato')
    AND anno <= p_anno$a$,
    $a$    COALESCE(sum(COALESCE(c.ritenute_irpef, 0)) FILTER (
      WHERE c.stato = 'emesso' OR (make_date(c.anno, c.mese, 16) + interval '1 month')::date > v_rif), 0)$a$,
    $a$+ COALESCE((v_iva ->> 'debito')::numeric, 0) + v_imposte_es
$a$,
    $a$      'imposte_esercizio', v_imposte_es,$a$];
  dopo text[] := array[
    $b$  v_imposte_es numeric(14,2) := 0;
  v_acconti_es numeric(14,2) := 0;
  v_imposte_prec numeric(14,2) := 0;
  v_imposte_prec_dv numeric(14,2) := 0;
  v_imposte_netto numeric(14,2) := 0;$b$,
    $b$  v_imposte_es := COALESCE(v_imposte_es, 0);

  -- Acconti IRES e IRAP dell'anno usciti dalla banca (voci 12.03 e 12.05).
  v_acconti_es := private.cg_uscite_voci(v_company_id, make_date(p_anno, 1, 1), v_rif, array['12.03', '12.05'], false);
  -- Fino al 30/6 il saldo delle imposte dell'anno prima (meno acconti e saldi usciti dalla banca).
  IF v_rif < make_date(p_anno, 6, 30) THEN
    SELECT COALESCE((val->>'valore')::numeric, 0) INTO v_imposte_prec
      FROM jsonb_array_elements(
        (public.cg_get_conto_economico_riclassificato(v_company_id, p_anno - 1, 1, 12) -> 'voci')) AS val
     WHERE val->>'codice' = '15';
    v_imposte_prec_dv := GREATEST(COALESCE(v_imposte_prec, 0)
      - private.cg_uscite_voci(v_company_id, make_date(p_anno - 1, 1, 1), make_date(p_anno - 1, 12, 31), array['12.03', '12.05'], false)
      - private.cg_uscite_voci(v_company_id, make_date(p_anno, 1, 1), v_rif, array['12.04', '12.06'], false), 0);
  END IF;
  v_imposte_netto := v_imposte_es - v_acconti_es + v_imposte_prec_dv;
  -- Acconti oltre le imposte: credito tributario.
  IF v_imposte_netto < 0 THEN
    v_crediti_trib := v_crediti_trib - v_imposte_netto;
    v_liq_diff     := v_liq_diff - v_imposte_netto;
    v_attivo_circ  := v_attivo_circ - v_imposte_netto;
    v_tot_attivo   := v_tot_attivo - v_imposte_netto;
    v_imposte_netto := 0;
  END IF;$b$,
    $b$  FROM public.f24_entries
  WHERE company_id = v_company_id
    -- Dal mese a cui si riferisce, e non ancora pagato alla data.
    AND make_date(anno, mese, 1) <= v_rif
    AND (stato IN ('da_pagare','parzialmente_pagato') OR (stato = 'pagato' AND data_pagamento > v_rif))
    AND anno <= p_anno$b$,
    $b$    COALESCE(sum(COALESCE(c.ritenute_irpef, 0)) FILTER (
      WHERE (c.stato = 'emesso' OR (make_date(c.anno, c.mese, 16) + interval '1 month')::date > v_rif)
        -- Col mese che ha l'F24 delle ritenute registrato vale l'F24.
        AND NOT EXISTS (SELECT 1 FROM public.f24_entries f
                         WHERE f.company_id = v_company_id AND f.anno = c.anno AND f.mese = c.mese
                           AND f.tributo_code = '1001')), 0)$b$,
    $b$+ COALESCE((v_iva ->> 'debito')::numeric, 0) + v_imposte_netto
$b$,
    $b$      'imposte_esercizio', v_imposte_es,
      'imposte_acconti_in_banca', v_acconti_es,
      'imposte_anno_prima_da_versare', v_imposte_prec_dv,$b$];
  i integer;
begin
  if position('private.cg_uscite_voci' in sp) > 0 then
    return;
  end if;
  for i in 1 .. array_length(prima, 1) loop
    if (length(sp) - length(replace(sp, prima[i], ''))) / length(prima[i]) <> 1 then
      raise exception 'Stato patrimoniale: blocco % non trovato una volta sola, la funzione è cambiata', i;
    end if;
    sp := replace(sp, prima[i], dopo[i]);
  end loop;
  execute sp;
end $p$;
