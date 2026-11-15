-- Stato patrimoniale: patrimonio netto riportato agli anni dopo e fondo TFR alla data (15/11/2026)
--
-- 1. Patrimonio netto. Lo Stato patrimoniale leggeva solo la riga di
--    patrimonio_netto dello stesso anno: inseriti i dati del 2026, nel 2027 il
--    capitale e le riserve tornavano a zero. Adesso vale l'ultima riga fino
--    all'anno (valori all'1/1 di quell'esercizio) e, per ogni anno passato da
--    allora, l'utile o la perdita del conto economico va negli utili portati a
--    nuovo. I dividendi distribuiti non sono registrati: chi li ha distribuiti
--    inserisce la riga dell'anno con le riserve giuste.
-- 2. Fondo TFR. Dal 20290331160000 il conto economico conta il TFR maturato
--    (lordo dei cedolini / 13,5, art. 2120 c.c.), ma il fondo nello Stato
--    patrimoniale restava quello inserito a mano: il costo c'era, il debito
--    verso i dipendenti no (art. 2424 c.c., passivo C). Adesso il fondo è
--    quello iniziale più il TFR maturato dai cedolini emessi o pagati, dall'1/1
--    dell'anno della riga fino alla data. Le liquidazioni ai dipendenti usciti e
--    i versamenti ai fondi pensione non sono registrati come tali: per chi li ha
--    si corregge inserendo la riga dell'anno.
-- 3. Il controllo di salute cerca il capitale sociale nella stessa riga.
-- Il dettaglio (anno di partenza, utili riportati, TFR maturato) va nel meta
-- dello Stato patrimoniale, alla voce «patrimonio».

create or replace function private.cg_patrimonio_al(p_company uuid, p_anno integer, p_rif date)
returns table(esercizio_base integer, capitale numeric, riserve numeric, utili_riportati numeric,
              tfr_iniziale numeric, tfr_maturato numeric, fondi numeric)
language plpgsql stable security definer set search_path to '' as $$
declare
  r public.patrimonio_netto%rowtype;
  y integer;
  v_l numeric;
begin
  select * into r from public.patrimonio_netto pn
   where pn.company_id = p_company and pn.esercizio <= p_anno
   order by pn.esercizio desc limit 1;

  esercizio_base  := r.esercizio;
  capitale        := coalesce(r.capitale_sociale, 0);
  riserve         := coalesce(r.riserva_legale, 0) + coalesce(r.riserva_straordinaria, 0)
                     + coalesce(r.altre_riserve, 0) + coalesce(r.utili_perdite_a_nuovo, 0);
  tfr_iniziale    := coalesce(r.fondo_tfr, 0);
  fondi           := coalesce(r.fondo_rischi, 0) + coalesce(r.altri_fondi, 0);
  utili_riportati := 0;

  -- Utili e perdite degli anni chiusi dopo la riga (al massimo dieci).
  if r.esercizio is not null then
    for y in greatest(r.esercizio, p_anno - 10) .. p_anno - 1 loop
      select (v ->> 'valore')::numeric into v_l
        from jsonb_array_elements(public.cg_get_conto_economico_riclassificato(p_company, y, 1, 12) -> 'voci') v
       where v ->> 'codice' = 'L'
       limit 1;
      utili_riportati := utili_riportati + coalesce(v_l, 0);
    end loop;
  end if;

  -- TFR maturato come nel conto economico, dall'anno della riga (o dall'anno, senza riga).
  select coalesce(sum(round(coalesce(c.lordo, 0) / 13.5, 2)), 0) into tfr_maturato
    from public.cedolini c
   where c.company_id = p_company
     and c.stato in ('emesso', 'pagato')
     and make_date(c.anno, c.mese, 1) >= make_date(coalesce(r.esercizio, p_anno), 1, 1)
     and make_date(c.anno, c.mese, 1) <= p_rif;

  return next;
end $$;
revoke all on function private.cg_patrimonio_al(uuid, integer, date) from public, anon, authenticated;

do $p$
declare
  vecchio text := pg_get_functiondef('public.cg_get_stato_patrimoniale_riclassificato(uuid,integer,date)'::regprocedure);
  nuovo text := vecchio;
  prima text[] := array[
    $a$  v_tfr numeric(14,2) := 0;$a$,
    $a$  SELECT
    COALESCE(pn.capitale_sociale, 0),
    COALESCE(pn.riserva_legale, 0) + COALESCE(pn.riserva_straordinaria, 0)
      + COALESCE(pn.altre_riserve, 0) + COALESCE(pn.utili_perdite_a_nuovo, 0),
    COALESCE(pn.fondo_tfr, 0),
    COALESCE(pn.fondo_rischi, 0) + COALESCE(pn.altri_fondi, 0)
  INTO v_capitale, v_riserve, v_tfr, v_fondi_rischi
  FROM public.patrimonio_netto pn
  WHERE pn.company_id = v_company_id AND pn.esercizio = p_anno;$a$,
    $a$      'imposte_esercizio', v_imposte_es,$a$];
  dopo text[] := array[
    $b$  v_tfr numeric(14,2) := 0;
  v_pn_base integer;
  v_pn_utili_rip numeric(14,2) := 0;
  v_tfr_iniziale numeric(14,2) := 0;
  v_tfr_maturato numeric(14,2) := 0;$b$,
    $b$  -- Ultima riga fino all'anno, con gli utili degli anni passati da allora e il TFR maturato alla data.
  SELECT pa.capitale, pa.riserve + pa.utili_riportati, pa.tfr_iniziale + pa.tfr_maturato, pa.fondi,
         pa.esercizio_base, pa.utili_riportati, pa.tfr_iniziale, pa.tfr_maturato
  INTO v_capitale, v_riserve, v_tfr, v_fondi_rischi,
       v_pn_base, v_pn_utili_rip, v_tfr_iniziale, v_tfr_maturato
  FROM private.cg_patrimonio_al(v_company_id, p_anno, v_rif) pa;$b$,
    $b$      'imposte_esercizio', v_imposte_es,
      'patrimonio', jsonb_build_object(
        'esercizio_base', v_pn_base,
        'utili_riportati', v_pn_utili_rip,
        'tfr_iniziale', v_tfr_iniziale,
        'tfr_maturato', v_tfr_maturato),$b$];
  i integer;
  hc_vecchio text := pg_get_functiondef('public.cg_get_health_check'::regproc);
  hc_prima text := $a$  SELECT COALESCE(sum(capitale_sociale), 0) INTO v_pn_capitale
  FROM public.patrimonio_netto WHERE company_id = v_company_id AND esercizio = p_anno;$a$;
  hc_dopo text := $b$  -- Come lo Stato patrimoniale: l'ultima riga fino all'anno.
  SELECT COALESCE((SELECT capitale_sociale FROM public.patrimonio_netto
                    WHERE company_id = v_company_id AND esercizio <= p_anno
                    ORDER BY esercizio DESC LIMIT 1), 0) INTO v_pn_capitale;$b$;
begin
  if position('private.cg_patrimonio_al' in nuovo) = 0 then
    for i in 1 .. array_length(prima, 1) loop
      if position(prima[i] in nuovo) = 0 then
        raise exception 'Stato patrimoniale: blocco % non trovato, la funzione è cambiata', i;
      end if;
      nuovo := replace(nuovo, prima[i], dopo[i]);
    end loop;
    execute nuovo;
  end if;

  if position('ultima riga fino all''anno' in hc_vecchio) = 0 then
    if position(hc_prima in hc_vecchio) = 0 then
      raise exception 'Controllo di salute: lettura del capitale sociale non trovata, la funzione è cambiata';
    end if;
    execute replace(hc_vecchio, hc_prima, hc_dopo);
  end if;
end $p$;
