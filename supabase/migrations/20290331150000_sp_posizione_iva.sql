-- Stato patrimoniale: la posizione IVA, come vuole la legge (15/11/2026)
--
-- Nel conto economico ricavi e costi sono al netto dell'IVA; nello Stato
-- patrimoniale crediti verso clienti e debiti verso fornitori sono IVA
-- compresa (art. 2424 c.c., OIC 15 e 19). La differenza è un rapporto con
-- l'Erario: IVA a debito non ancora versata (debiti tributari, OIC 19) o
-- credito IVA (crediti tributari, OIC 15). Lo Stato patrimoniale non la aveva:
-- crediti tributari sempre a zero «da inserire», debiti tributari solo da F24
-- registrati, e nessuna azienda registra gli F24 dell'IVA.
-- Demo 2, 2025: IVA sugli acquisti oltre quella sulle vendite per circa
-- 300.000 € (tipico dell'edilizia con il reverse charge sulle vendite).
--
-- La posizione si calcola con la liquidazione dell'app
-- (liquidazione_iva_periodo: split payment escluso, integrazioni e reverse
-- charge neutri, quota indetraibile esclusa, detrazione nel mese di ricezione):
--  - periodicità dalle impostazioni fiscali dell'anno; senza, mensile oltre
--    800.000 € di volume d'affari dell'anno prima, trimestrale sotto
--    (art. 7 DPR 542/99);
--  - il credito di un periodo passa al successivo, anche da un anno all'altro;
--    se le impostazioni indicano il credito dell'anno prima, vale quello;
--  - un periodo a debito con la scadenza già passata alla data si considera
--    versato (gli F24 dell'IVA non sono registrati); quelli non ancora scaduti
--    sono debito: mensile il 16 del mese dopo; trimestrale 16 maggio,
--    20 agosto, 16 novembre e, per il quarto, il saldo del 16 marzo
--    (DPR 100/98, art. 7 DPR 542/99). Acconto di dicembre e interessi dei
--    trimestrali non sono considerati.
-- Gli F24 dell'IVA periodica dell'anno (6001–6012, 6031–6034, acconto 6013)
-- escono dai debiti tributari da F24: li conta già la posizione IVA.
-- Senza permesso di leggere la liquidazione (chiamate senza utente) la
-- posizione resta fuori e i crediti tributari tornano «da inserire».

create or replace function private.cg_posizione_iva_al(p_company uuid, p_rif date)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  v_anno integer := extract(year from p_rif)::integer;
  v_per text;
  v_cred_prec numeric;
  v_volume numeric;
  v_cred numeric := 0;
  v_deb numeric := 0;
  v_saldo numeric;
  v_inizio date;
  v_scad date;
  v_r jsonb;
  y integer;
  p integer;
begin
  select lower(i.periodicita), i.credito_anno_precedente into v_per, v_cred_prec
    from public.fiscalita_impostazioni_iva i
   where i.company_id = p_company and i.anno = v_anno;
  if v_per is null or v_per not in ('mensile', 'trimestrale') then
    select coalesce(sum(case when v.tipo = 'nota_credito' then -abs(coalesce(v.imponibile_totale, 0))
                             else coalesce(v.imponibile_totale, 0) end), 0)
      into v_volume
      from public.fatture_vendite_iva v
     where v.company_id = p_company and v.deleted_at is null
       and v.stato not in ('bozza', 'annullata')
       and extract(year from v.data_emissione) = v_anno - 1;
    v_per := case when v_volume > 800000 then 'mensile' else 'trimestrale' end;
  end if;

  -- Fino al 16 marzo può essere ancora da versare l'ultimo periodo dell'anno prima.
  for y in (case when p_rif <= make_date(v_anno, 3, 16) then v_anno - 1 else v_anno end) .. v_anno loop
    if y = v_anno and v_cred_prec is not null then
      v_cred := v_cred_prec;
    end if;
    for p in 1 .. (case when v_per = 'mensile' then 12 else 4 end) loop
      v_inizio := case when v_per = 'mensile' then make_date(y, p, 1) else make_date(y, (p - 1) * 3 + 1, 1) end;
      exit when v_inizio > p_rif;
      v_r := public.liquidazione_iva_periodo(p_company, v_per, y,
               case when v_per = 'mensile' then p end, case when v_per = 'trimestrale' then p end);
      v_saldo := coalesce((v_r ->> 'saldo')::numeric, 0) - v_cred;
      v_scad := case
        when v_per = 'mensile' then (make_date(y, p, 16) + interval '1 month')::date
        when p = 1 then make_date(y, 5, 16)
        when p = 2 then make_date(y, 8, 20)
        when p = 3 then make_date(y, 11, 16)
        else make_date(y + 1, 3, 16) end;
      if v_saldo <= 0 then
        v_cred := -v_saldo;
      else
        v_cred := 0;
        if v_scad > p_rif then
          v_deb := v_deb + v_saldo;
        end if;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'calcolata', true,
    'periodicita', v_per,
    'credito', round(v_cred, 2),
    'debito', round(v_deb, 2),
    'credito_anno_precedente_indicato', v_cred_prec is not null);
exception when others then
  return jsonb_build_object('calcolata', false, 'credito', 0, 'debito', 0);
end $$;
revoke all on function private.cg_posizione_iva_al(uuid, date) from public, anon, authenticated;

do $p$
declare
  vecchio text := pg_get_functiondef('public.cg_get_stato_patrimoniale_riclassificato(uuid,integer,date)'::regprocedure);
  nuovo text := vecchio;
  prima text[] := array[
    $a$v_tot_passivo numeric(14,2);
BEGIN$a$,
    $a$  v_crediti_trib  := 0;
  v_anticipi_forn := 0;$a$,
    $a$  v_debiti_trib := v_debiti_trib + v_ritenute_ced;$a$,
    $a$    AND stato IN ('da_pagare','parzialmente_pagato')
    AND anno <= p_anno;$a$,
    $a$'voci_manuali', jsonb_build_array('crediti_tributari', 'anticipi_fornitori', 'cassa')$a$];
  dopo text[] := array[
    $b$v_tot_passivo numeric(14,2);
  v_iva jsonb;
BEGIN$b$,
    $b$  -- Credito IVA dalle liquidazioni; anticipi a fornitori: nessuna fonte.
  v_iva := private.cg_posizione_iva_al(v_company_id, v_rif);
  v_crediti_trib  := COALESCE((v_iva ->> 'credito')::numeric, 0);
  v_anticipi_forn := 0;$b$,
    $b$  -- IVA dei periodi non ancora scaduti alla data.
  v_debiti_trib := v_debiti_trib + v_ritenute_ced + COALESCE((v_iva ->> 'debito')::numeric, 0);$b$,
    $b$    AND stato IN ('da_pagare','parzialmente_pagato')
    AND anno <= p_anno
    -- L'IVA periodica dell'anno la conta la posizione IVA.
    AND NOT (anno = p_anno AND COALESCE(tributo_code, '') ~ '^60(0[1-9]|1[0-3]|3[1-4])$');$b$,
    $b$'iva', v_iva,
      'voci_manuali', CASE WHEN COALESCE((v_iva ->> 'calcolata')::boolean, false)
                          THEN jsonb_build_array('anticipi_fornitori', 'cassa')
                          ELSE jsonb_build_array('crediti_tributari', 'anticipi_fornitori', 'cassa') END$b$];
  i integer;
begin
  if position('private.cg_posizione_iva_al' in nuovo) > 0 then
    return;
  end if;
  for i in 1 .. array_length(prima, 1) loop
    if position(prima[i] in nuovo) = 0 then
      raise exception 'Stato patrimoniale: blocco % non trovato, la funzione è cambiata', i;
    end if;
    nuovo := replace(nuovo, prima[i], dopo[i]);
  end loop;
  execute nuovo;
end $p$;
