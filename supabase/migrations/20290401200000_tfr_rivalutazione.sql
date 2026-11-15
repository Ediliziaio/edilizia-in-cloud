-- Fondo TFR: rivalutazione annua e imposta sostitutiva (15/11/2026)
--
-- Art. 2120 c.c., quarto comma: il fondo TFR accantonato al 31 dicembre
-- dell'anno prima si rivaluta ogni anno dell'1,5% fisso più il 75%
-- dell'aumento dell'indice ISTAT dei prezzi FOI da dicembre a dicembre. La
-- rivalutazione è un costo del personale (art. 2425 c.c., B9c; OIC 31) e
-- aumenta il fondo; su di essa l'azienda trattiene e versa l'imposta
-- sostitutiva del 17% (art. 11 D.Lgs. 47/2000): acconto del 90% entro il 16
-- dicembre, saldo entro il 16 febbraio dell'anno dopo.
--
-- 1. cg_tfr_coefficienti_istat: i coefficienti pubblicati dall'ISTAT, per
--    mese. Dicembre è il coefficiente dell'anno; per l'anno in corso, senza
--    dicembre, vale l'ultimo mese pubblicato con la parte fissa per l'anno
--    intero (1,5% + l'inflazione fin lì); senza alcun mese, l'1,5% (stimato).
-- 2. private.cg_tfr_rivalutazione_anni: anno per anno dalla riga del
--    patrimonio netto, fondo a inizio anno (meno liquidazioni e anticipi
--    dell'anno) × coefficiente. Solo negli anni con cedolini: senza cedolini
--    il costo del personale viene dai costi registrati, che possono già
--    comprendere il TFR del consulente.
-- 3. Nel conto economico e nel suo dettaglio la rivalutazione dell'anno è
--    distribuita sui mesi con cedolini emessi o pagati (dodici mesi: tutta),
--    con lo stesso arrotondamento, così mesi e anno sommano uguale.
-- 4. Nello Stato patrimoniale il fondo cresce della rivalutazione al netto
--    dell'imposta; l'imposta non ancora versata va tra i debiti tributari.
--
-- Coefficienti: dicembre 2023 1,944162; dicembre 2024 2,320017; dicembre 2025
-- 2,311148; agosto 2026 3,710988; settembre 2026 4,285617 (comunicati ISTAT,
-- riportati da ANCE). Ogni mese l'ISTAT ne pubblica uno nuovo, verso il 15 del
-- mese dopo: si aggiunge una riga.

create table if not exists public.cg_tfr_coefficienti_istat (
  anno integer not null check (anno between 2000 and 2100),
  mese integer not null check (mese between 1 and 12),
  coefficiente_pct numeric(10,6) not null check (coefficiente_pct >= 0),
  fonte text,
  updated_at timestamptz not null default now(),
  primary key (anno, mese)
);
alter table public.cg_tfr_coefficienti_istat enable row level security;
revoke all on public.cg_tfr_coefficienti_istat from public, anon, authenticated;
grant select, insert, update on public.cg_tfr_coefficienti_istat to authenticated;

do $p$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cg_tfr_coefficienti_istat' and policyname = 'coefficienti_lettura') then
    create policy coefficienti_lettura on public.cg_tfr_coefficienti_istat for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cg_tfr_coefficienti_istat' and policyname = 'coefficienti_super_admin_inserisce') then
    create policy coefficienti_super_admin_inserisce on public.cg_tfr_coefficienti_istat for insert to authenticated
      with check ((select public.utente_super_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cg_tfr_coefficienti_istat' and policyname = 'coefficienti_super_admin_modifica') then
    create policy coefficienti_super_admin_modifica on public.cg_tfr_coefficienti_istat for update to authenticated
      using ((select public.utente_super_admin())) with check ((select public.utente_super_admin()));
  end if;
end $p$;

insert into public.cg_tfr_coefficienti_istat (anno, mese, coefficiente_pct, fonte) values
  (2023, 12, 1.944162, 'ISTAT, indice FOI dicembre 2023'),
  (2024, 12, 2.320017, 'ISTAT, indice FOI dicembre 2024'),
  (2025, 12, 2.311148, 'ISTAT, indice FOI dicembre 2025'),
  (2026, 8, 3.710988, 'ISTAT, indice FOI agosto 2026'),
  (2026, 9, 4.285617, 'ISTAT, indice FOI settembre 2026')
on conflict (anno, mese) do nothing;

-- Coefficiente dell'anno: dicembre, o la stima dall'ultimo mese pubblicato.
create or replace function private.cg_tfr_coefficiente_anno(p_anno integer)
returns table(coefficiente_pct numeric, stimato boolean)
language sql stable security definer set search_path to '' as $$
  select coalesce(
           (select case when c.mese = 12 then c.coefficiente_pct
                        else c.coefficiente_pct - 1.5 * c.mese / 12.0 + 1.5 end
              from public.cg_tfr_coefficienti_istat c
             where c.anno = p_anno
             order by c.mese desc limit 1),
           1.5),
         not exists (select 1 from public.cg_tfr_coefficienti_istat c where c.anno = p_anno and c.mese = 12)
$$;
revoke all on function private.cg_tfr_coefficiente_anno(integer) from public, anon, authenticated;

-- Anno per anno, dalla riga del patrimonio netto fino a p_fino_anno.
create or replace function private.cg_tfr_rivalutazione_anni(p_company uuid, p_fino_anno integer)
returns table(anno integer, fondo_inizio numeric, coefficiente_pct numeric, stimato boolean,
              rivalutazione numeric, imposta numeric, fondo_fine numeric)
language plpgsql stable security definer set search_path to '' as $$
declare
  v_base integer;
  v_fondo numeric := 0;
  v_liq numeric;
  v_acc numeric;
  v_ced boolean;
  y integer;
begin
  select pn.esercizio, coalesce(pn.fondo_tfr, 0) into v_base, v_fondo
    from public.patrimonio_netto pn
   where pn.company_id = p_company and pn.esercizio <= p_fino_anno
   order by pn.esercizio desc limit 1;
  v_base := coalesce(v_base, p_fino_anno);
  v_fondo := coalesce(v_fondo, 0);

  for y in greatest(v_base, p_fino_anno - 10) .. p_fino_anno loop
    select coalesce(sum(m.importo), 0) into v_liq
      from public.cg_tfr_movimenti m
     where m.company_id = p_company and m.annullato_il is null
       and m.data >= make_date(y, 1, 1) and m.data <= make_date(y, 12, 31);

    select coalesce(sum(round(coalesce(c.lordo, 0) / 13.5, 2)), 0), count(*) > 0 into v_acc, v_ced
      from public.cedolini c
      left join public.cg_tfr_destinazioni d on d.employee_id = c.employee_id and d.company_id = p_company
                                            and d.destinazione <> 'azienda'
     where c.company_id = p_company and c.anno = y and c.stato in ('emesso', 'pagato')
       and (d.employee_id is null or make_date(c.anno, c.mese, 1) < date_trunc('month', d.dal)::date);
    -- Anche chi versa tutto ai fondi ha cedolini: l'anno conta se ce n'è almeno uno.
    v_ced := v_ced or exists (select 1 from public.cedolini c
                               where c.company_id = p_company and c.anno = y and c.stato in ('emesso', 'pagato'));

    anno := y;
    fondo_inizio := v_fondo;
    select k.coefficiente_pct, k.stimato into coefficiente_pct, stimato from private.cg_tfr_coefficiente_anno(y) k;
    rivalutazione := case when v_ced then round(greatest(v_fondo - v_liq, 0) * coefficiente_pct / 100, 2) else 0 end;
    imposta := round(rivalutazione * 0.17, 2);
    fondo_fine := v_fondo + v_acc + rivalutazione - imposta - v_liq;
    return next;
    v_fondo := fondo_fine;
  end loop;
end $$;
revoke all on function private.cg_tfr_rivalutazione_anni(uuid, integer) from public, anon, authenticated;

-- Mesi dell'anno con cedolini emessi o pagati, fino a p_mese.
create or replace function private.cg_tfr_mesi_cedolini(p_company uuid, p_anno integer, p_mese integer)
returns integer language sql stable security definer set search_path to '' as $$
  select count(distinct c.mese)::integer from public.cedolini c
   where c.company_id = p_company and c.anno = p_anno and c.mese <= p_mese
     and c.stato in ('emesso', 'pagato')
$$;
revoke all on function private.cg_tfr_mesi_cedolini(uuid, integer, integer) from public, anon, authenticated;

-- Costo della rivalutazione nei mesi da p_da a p_a: arrotondato sul cumulato, così i mesi sommano all'anno.
create or replace function private.cg_tfr_rivalutazione_mesi(p_company uuid, p_anno integer, p_da integer, p_a integer)
returns numeric language sql stable security definer set search_path to '' as $$
  select coalesce((
    select round(r.rivalutazione * private.cg_tfr_mesi_cedolini(p_company, p_anno, p_a) / 12.0, 2)
         - round(r.rivalutazione * private.cg_tfr_mesi_cedolini(p_company, p_anno, p_da - 1) / 12.0, 2)
      from private.cg_tfr_rivalutazione_anni(p_company, p_anno) r
     where r.anno = p_anno), 0)
$$;
revoke all on function private.cg_tfr_rivalutazione_mesi(uuid, integer, integer, integer) from public, anon, authenticated;

-- Alla data: rivalutazione netta entrata nel fondo dall'anno della riga, imposta da versare.
create or replace function private.cg_tfr_rivalutazione_al(p_company uuid, p_anno integer, p_rif date)
returns table(netta numeric, imposta_da_versare numeric, lorda_anno numeric, coefficiente_pct numeric, stimato boolean)
language plpgsql stable security definer set search_path to '' as $$
declare
  r record;
  k integer := private.cg_tfr_mesi_cedolini(p_company, p_anno, extract(month from p_rif)::integer);
  v_imp_anno numeric := 0;
  v_imp_prec numeric := 0;
begin
  netta := 0; lorda_anno := 0; imposta_da_versare := 0;
  for r in select * from private.cg_tfr_rivalutazione_anni(p_company, p_anno) loop
    if r.anno < p_anno then
      netta := netta + r.rivalutazione - r.imposta;
      if r.anno = p_anno - 1 then v_imp_prec := r.imposta; end if;
    else
      lorda_anno := round(r.rivalutazione * k / 12.0, 2);
      v_imp_anno := round(r.imposta * k / 12.0, 2);
      netta := netta + lorda_anno - v_imp_anno;
      coefficiente_pct := r.coefficiente_pct;
      stimato := r.stimato;
      -- Acconto del 90% il 16 dicembre.
      imposta_da_versare := greatest(v_imp_anno - case when p_rif >= make_date(p_anno, 12, 16)
                                                       then round(r.imposta * 0.9, 2) else 0 end, 0);
    end if;
  end loop;
  -- Saldo dell'anno prima entro il 16 febbraio.
  if p_rif < make_date(p_anno, 2, 16) then
    imposta_da_versare := imposta_da_versare + v_imp_prec - round(v_imp_prec * 0.9, 2);
  end if;
  return next;
end $$;
revoke all on function private.cg_tfr_rivalutazione_al(uuid, integer, date) from public, anon, authenticated;

do $p$
declare
  sp text := pg_get_functiondef('public.cg_get_stato_patrimoniale_riclassificato(uuid,integer,date)'::regprocedure);
  ce text := pg_get_functiondef('public.cg_get_conto_economico_riclassificato'::regproc);
  dt text := pg_get_functiondef('public.cg_get_dettaglio_voce_mese'::regproc);
  sp_prima text[] := array[
    $a$  v_tfr_da_versare numeric(14,2) := 0;$a$,
    $a$  v_tfr := COALESCE(v_tfr, 0) - v_tfr_liquidato;$a$,
    $a$  v_debiti_trib := v_debiti_trib + v_ritenute_ced + COALESCE((v_iva ->> 'debito')::numeric, 0) + v_imposte_es;$a$,
    $a$        'tfr_da_versare_ai_fondi', v_tfr_da_versare),$a$];
  sp_dopo text[] := array[
    $b$  v_tfr_da_versare numeric(14,2) := 0;
  v_tfr_riv_netta numeric(14,2) := 0;
  v_tfr_riv_anno numeric(14,2) := 0;
  v_tfr_imposta_dv numeric(14,2) := 0;
  v_tfr_coeff numeric;
  v_tfr_coeff_stimato boolean;$b$,
    $b$  v_tfr := COALESCE(v_tfr, 0) - v_tfr_liquidato;

  -- Rivalutazione del fondo (art. 2120 c.c.), al netto dell'imposta sostitutiva del 17%.
  SELECT rv.netta, rv.imposta_da_versare, rv.lorda_anno, rv.coefficiente_pct, rv.stimato
    INTO v_tfr_riv_netta, v_tfr_imposta_dv, v_tfr_riv_anno, v_tfr_coeff, v_tfr_coeff_stimato
    FROM private.cg_tfr_rivalutazione_al(v_company_id, p_anno, v_rif) rv;
  v_tfr := v_tfr + COALESCE(v_tfr_riv_netta, 0);$b$,
    $b$  v_debiti_trib := v_debiti_trib + v_ritenute_ced + COALESCE((v_iva ->> 'debito')::numeric, 0) + v_imposte_es
                   + COALESCE(v_tfr_imposta_dv, 0);$b$,
    $b$        'tfr_da_versare_ai_fondi', v_tfr_da_versare,
        'tfr_rivalutazione_netta', v_tfr_riv_netta,
        'tfr_rivalutazione_anno', v_tfr_riv_anno,
        'tfr_coefficiente_pct', v_tfr_coeff,
        'tfr_coefficiente_stimato', v_tfr_coeff_stimato,
        'tfr_imposta_sostitutiva_da_versare', v_tfr_imposta_dv),$b$];
  ce_prima text := $a$IF v_costo_pers_cedolini > 0 THEN v_costo_pers := v_costo_pers_cedolini; END IF;$a$;
  ce_dopo text := $b$IF v_costo_pers_cedolini > 0 THEN
      -- Più la rivalutazione del fondo TFR dei mesi (art. 2120 c.c.).
      v_costo_pers := v_costo_pers_cedolini + private.cg_tfr_rivalutazione_mesi(v_company_id, p_anno, p_mese_da, p_mese_a);
    END IF;$b$;
  dt_prima text[] := array[
    $a$  v_has_cedolini boolean := false;$a$,
    $a$      INTO v_righe, v_totale
      FROM public.cedolini cd
      WHERE cd.company_id = v_company_id AND cd.anno = p_anno
        AND (p_mese IS NULL OR cd.mese = p_mese)
        AND cd.stato IN ('emesso','pagato');$a$,
    $a$        GROUP BY cd.employee_name
      ) r;$a$];
  dt_dopo text[] := array[
    $b$  v_has_cedolini boolean := false;
  v_riv_tfr numeric(14,2) := 0;$b$,
    $b$      INTO v_righe, v_totale
      FROM public.cedolini cd
      WHERE cd.company_id = v_company_id AND cd.anno = p_anno
        AND (p_mese IS NULL OR cd.mese = p_mese)
        AND cd.stato IN ('emesso','pagato');

      -- Rivalutazione del fondo TFR, come nel conto economico.
      v_riv_tfr := private.cg_tfr_rivalutazione_mesi(v_company_id, p_anno, COALESCE(p_mese, 1), COALESCE(p_mese, 12));
      IF v_riv_tfr <> 0 THEN
        v_righe := COALESCE(v_righe, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'id', NULL, 'source_table', 'cg_tfr_rivalutazione',
          'data', make_date(p_anno, COALESCE(p_mese, 12), 1),
          'descrizione', 'Rivalutazione del fondo TFR (art. 2120 c.c.)',
          'controparte', NULL, 'voce_chiave', 'tfr_rivalutazione', 'categoria', 'rivalutazione',
          'importo', v_riv_tfr));
        v_totale := v_totale + v_riv_tfr;
      END IF;$b$,
    $b$        GROUP BY cd.employee_name
      ) r;
      IF v_riv_tfr <> 0 THEN
        v_raggr := COALESCE(v_raggr, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'etichetta', 'Rivalutazione del fondo TFR', 'totale', v_riv_tfr, 'count', 1));
      END IF;$b$];
  i integer;
begin
  if position('private.cg_tfr_rivalutazione_al' in sp) = 0 then
    for i in 1 .. array_length(sp_prima, 1) loop
      if (length(sp) - length(replace(sp, sp_prima[i], ''))) / length(sp_prima[i]) <> 1 then
        raise exception 'Stato patrimoniale: blocco % non trovato una volta sola, la funzione è cambiata', i;
      end if;
      sp := replace(sp, sp_prima[i], sp_dopo[i]);
    end loop;
    execute sp;
  end if;

  if position('private.cg_tfr_rivalutazione_mesi' in ce) = 0 then
    if (length(ce) - length(replace(ce, ce_prima, ''))) / length(ce_prima) <> 1 then
      raise exception 'Conto economico: costo dai cedolini non trovato una volta sola, la funzione è cambiata';
    end if;
    execute replace(ce, ce_prima, ce_dopo);
  end if;

  if position('private.cg_tfr_rivalutazione_mesi' in dt) = 0 then
    for i in 1 .. array_length(dt_prima, 1) loop
      if (length(dt) - length(replace(dt, dt_prima[i], ''))) / length(dt_prima[i]) <> 1 then
        raise exception 'Dettaglio della voce: blocco % non trovato una volta sola, la funzione è cambiata', i;
      end if;
      dt := replace(dt, dt_prima[i], dt_dopo[i]);
    end loop;
    execute dt;
  end if;
end $p$;
