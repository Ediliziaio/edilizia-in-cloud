-- Liquidazione IVA, fase 1.1 (docs/piano-liquidazione-iva-lipe-f24.md):
-- da dove viene la data di ricezione di una fattura ricevuta.
--
-- L'IVA sugli acquisti si detrae nel periodo in cui la fattura arriva (o in
-- quello della fattura, se arriva entro il 15 del mese dopo nello stesso anno:
-- public.data_detrazione_iva). Il 07/11/2026 le fatture arrivate dal canale SDI
-- di EiC avevano tutte la data (Renova 111 su 111); le importate (Fatture in
-- Cloud, XML caricati, storico) non l'avevano mai: Innovasol 1.519 su 1.519,
-- Best Infissi 1.235, Vulcano 1.208, Bonarrigo 870, Dimora 621.
--
-- Il file XML della fattura non contiene la data di consegna: la sa solo lo SDI.
-- Per le importate quindi la data o la dichiara chi tiene la contabilità
-- (ricezione_dichiarata_il, con chi e quando), o si presume uguale alla data
-- della fattura. La presunzione è innocua quasi sempre: lo SDI consegna in pochi
-- giorni e, se arriva entro il 15 del mese dopo, il periodo resta quello della
-- fattura. Non lo è a fine dicembre: una fattura del 29/12 consegnata il 3/1
-- va nell'anno dopo. Quelle restano «da verificare» e la liquidazione le
-- segnala.
--
-- Origine (public.ricezione_iva_origine):
--   sdi           — data registrata dal canale SDI
--   dichiarata    — inserita da una persona, firmata
--   presunta      — nessuna data, si usa quella della fattura
--   da_verificare — nessuna data e fattura dal 20 dicembre in poi

-- Colonne senza default e trigger: istantanei, ma serve un lock breve sulla
-- tabella. Meglio fallire che restare in coda dietro un'altra transazione.
set local lock_timeout = '3s';

alter table public.fatture_ricevute
  add column if not exists ricezione_dichiarata_il date,
  add column if not exists ricezione_dichiarata_da uuid,
  add column if not exists ricezione_dichiarata_at timestamptz;

comment on column public.fatture_ricevute.ricezione_dichiarata_il is
  'Data di ricezione dichiarata da chi tiene la contabilità, per le fatture senza data SDI (importate). La data SDI, se c''è, vince sempre.';

-- Le regole valgono anche per chi scrive la colonna direttamente (il browser ha
-- l'UPDATE sulla tabella): mai sopra una data SDI, mai prima della fattura, e
-- chi/quando li scrive il database.
create or replace function private.ricezione_dichiarata_firma()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.ricezione_dichiarata_il is null then
    new.ricezione_dichiarata_da := null;
    new.ricezione_dichiarata_at := null;
    return new;
  end if;
  -- Arriva la data SDI su una fattura che aveva quella dichiarata: vince lo SDI,
  -- la dichiarazione si toglie invece di bloccare l'aggiornamento.
  if new.data_ricezione_sdi is not null and tg_op = 'UPDATE'
     and new.data_ricezione_sdi is distinct from old.data_ricezione_sdi then
    new.ricezione_dichiarata_il := null;
    new.ricezione_dichiarata_da := null;
    new.ricezione_dichiarata_at := null;
    return new;
  end if;
  if new.data_ricezione_sdi is not null then
    raise exception 'La fattura ha già la data di ricezione dello SDI' using errcode = '22023';
  end if;
  if new.data_fattura is not null and new.ricezione_dichiarata_il < new.data_fattura then
    raise exception 'La data di ricezione non può precedere quella della fattura' using errcode = '22023';
  end if;
  new.ricezione_dichiarata_da := auth.uid();
  new.ricezione_dichiarata_at := now();
  return new;
end $$;
revoke all on function private.ricezione_dichiarata_firma() from public, anon, authenticated;

drop trigger if exists ricezione_dichiarata_firma on public.fatture_ricevute;
create trigger ricezione_dichiarata_firma
  before insert or update of ricezione_dichiarata_il, ricezione_dichiarata_da, ricezione_dichiarata_at, data_ricezione_sdi
  on public.fatture_ricevute
  for each row
  when (new.ricezione_dichiarata_il is not null or new.ricezione_dichiarata_da is not null or new.ricezione_dichiarata_at is not null)
  execute function private.ricezione_dichiarata_firma();

-- La data che conta per l'IVA: quella SDI, altrimenti quella dichiarata (a
-- mezzanotte, ora italiana: data_detrazione_iva la riporta a data in Europe/Rome).
create or replace function public.ricezione_iva_il(p_sdi timestamptz, p_dichiarata date)
returns timestamptz language sql immutable set search_path = public as $$
  select coalesce(p_sdi, p_dichiarata::timestamp at time zone 'Europe/Rome');
$$;

create or replace function public.ricezione_iva_origine(p_data_fattura date, p_sdi timestamptz, p_dichiarata date)
returns text language sql immutable set search_path = public as $$
  select case
    when p_sdi is not null then 'sdi'
    when p_dichiarata is not null then 'dichiarata'
    when p_data_fattura is null then 'da_verificare'
    when extract(month from p_data_fattura) = 12 and extract(day from p_data_fattura) >= 20 then 'da_verificare'
    else 'presunta'
  end;
$$;

revoke all on function public.ricezione_iva_il(timestamptz, date), public.ricezione_iva_origine(date, timestamptz, date) from public, anon;
grant execute on function public.ricezione_iva_il(timestamptz, date), public.ricezione_iva_origine(date, timestamptz, date) to authenticated, service_role;

-- La vista del Registro: stessa forma di prima, la data dichiarata entra nel
-- periodo di detrazione e due colonne nuove in fondo dicono da dove viene.
create or replace view public.fatture_ricevute_periodo_iva with (security_invoker = true) as
  select f.id,
    f.company_id,
    f.numero_fattura,
    f.data_fattura,
    f.data_ricezione_sdi,
    public.data_detrazione_iva(f.data_fattura, public.ricezione_iva_il(f.data_ricezione_sdi, f.ricezione_dichiarata_il)) as data_detrazione,
    f.tipo_documento,
    f.cedente_ragione_sociale,
    f.imponibile_totale,
    f.iva_totale,
    f.totale_documento,
    f.riepilogo_iva,
    f.stato,
    f.aliquota_reverse_charge,
    f.ricezione_dichiarata_il,
    public.ricezione_iva_origine(f.data_fattura, f.data_ricezione_sdi, f.ricezione_dichiarata_il) as ricezione_origine
  from public.fatture_ricevute f;

-- Dichiarare la data di ricezione, anche in blocco («arrivate tutte il…»).
-- Solo per fatture senza data SDI, mai prima della data della fattura. Il
-- controllo dei periodi chiusi (private.fiscalita_guard) scatta sull'UPDATE:
-- una data che sposta l'IVA dentro o fuori da un mese chiuso viene rifiutata.
-- p_data null toglie la dichiarazione e torna alla presunzione.
create or replace function public.fiscalita_dichiara_ricezione(p_company uuid, p_ids uuid[], p_data date)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_richieste integer := coalesce(cardinality(p_ids), 0);
  v_aggiornate integer;
begin
  perform public.fiscalita_verifica_scrittura(p_company);
  if v_richieste = 0 then raise exception 'Nessuna fattura indicata' using errcode = '22023'; end if;
  if v_richieste > 2000 then raise exception 'Al massimo 2000 fatture per volta' using errcode = '22023'; end if;
  if p_data is not null and p_data > (now() at time zone 'Europe/Rome')::date then
    raise exception 'La data di ricezione non può essere nel futuro' using errcode = '22023';
  end if;

  update public.fatture_ricevute f
     set ricezione_dichiarata_il = p_data,
         ricezione_dichiarata_da = case when p_data is null then null else auth.uid() end,
         ricezione_dichiarata_at = case when p_data is null then null else now() end
   where f.company_id = p_company
     and f.id = any(p_ids)
     and f.data_ricezione_sdi is null
     and (p_data is null or p_data >= f.data_fattura)
     and f.ricezione_dichiarata_il is distinct from p_data;
  get diagnostics v_aggiornate = row_count;

  return jsonb_build_object(
    'aggiornate', v_aggiornate,
    'saltate', v_richieste - v_aggiornate,
    'nota', 'Saltate: già con data SDI, data precedente a quella della fattura, già con questa data o di un''altra azienda.'
  );
end $$;
revoke all on function public.fiscalita_dichiara_ricezione(uuid, uuid[], date) from public, anon;
grant execute on function public.fiscalita_dichiara_ricezione(uuid, uuid[], date) to authenticated;

-- Il controllo dei periodi chiusi guarda anche la data dichiarata: senza, la si
-- poteva usare per spostare IVA in un mese già chiuso. Il resto è invariato.
create or replace function private.fiscalita_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare j jsonb; r record; docs jsonb:='[]'::jsonb; c uuid; old_month date; new_month date;
begin
 if tg_table_name in('f24_entries','ritenute_garanzia') then
  c:=case when tg_op='DELETE' then old.company_id else new.company_id end;
  perform public.fiscalita_verifica_scrittura(c);
  if tg_op='DELETE' then raise exception 'Registrazione fiscale non cancellabile: usa rettifica documentata'; end if;
  if tg_op='UPDATE' and new.company_id<>old.company_id then raise exception 'Azienda non modificabile'; end if;
 end if;
 if tg_table_name='f24_entries' then
  if new.anno is null or new.anno not between 2000 and 2100 or new.mese is null or new.mese not between 1 and 12 then raise exception 'Periodo F24 non valido'; end if;
  if new.importo is null or new.importo<=0 or new.importo>1000000000 or new.importo<>round(new.importo,2) or length(btrim(coalesce(new.note,'')))<5 then raise exception 'Importo e riferimento F24 obbligatori'; end if;
  if tg_op='INSERT' or new.tributo_code is distinct from old.tributo_code or new.mese is distinct from old.mese then
   if new.tributo_code is null or not public.f24_codice_ammesso(new.tributo_code) then raise exception 'Codice erariale non supportato'; end if;
   if new.tributo_code between '6001' and '6012' and new.tributo_code::integer-6000<>new.mese then raise exception 'Codice IVA e mese di riferimento non coerenti'; end if;
  end if;
  if tg_op='INSERT' and new.stato<>'da_pagare' then raise exception 'Una nuova registrazione F24 non è un pagamento'; end if;
  if tg_op='UPDATE' and old.stato='pagato' and (to_jsonb(new)-'updated_at')<>(to_jsonb(old)-'updated_at') then raise exception 'Versamento registrato immutabile'; end if;
  if tg_op='UPDATE' and new.stato='pagato' and old.stato<>'pagato' and (new.data_pagamento is null or new.note is not distinct from old.note) then raise exception 'Serve una quietanza con data e riferimento specifico'; end if;
  new_month:=make_date(new.anno,new.mese,1);
  if tg_op='UPDATE' and old.mese between 1 and 12 then old_month:=make_date(old.anno,old.mese,1); end if;
 elsif tg_table_name='ritenute_garanzia' then
  if new.importo is null or new.importo<=0 then raise exception 'Importo ritenuta non valido'; end if;
  if tg_op='INSERT' and new.stato<>'trattenuta' then raise exception 'Registra prima la garanzia, poi conferma lo svincolo documentato'; end if;
  if tg_op='UPDATE' and new.importo is distinct from old.importo and new.note is not distinct from old.note then raise exception 'Rettifica importo: serve un nuovo riferimento documentato'; end if;
  if tg_op='UPDATE' and new.stato is distinct from old.stato and (new.note is not distinct from old.note or length(btrim(coalesce(new.note,'')))<5) then raise exception 'Cambio stato ritenuta: serve motivo e riferimento'; end if;
  if new.stato='svincolata' and new.data_svincolo_effettiva is null then raise exception 'Data di svincolo obbligatoria'; end if;
  new_month:=date_trunc('month',coalesce(new.data_svincolo_effettiva,new.created_at::date))::date;
  if tg_op='UPDATE' then old_month:=date_trunc('month',coalesce(old.data_svincolo_effettiva,old.created_at::date))::date; end if;
 else
  if tg_op='UPDATE' then
   if new.company_id is distinct from old.company_id or new.id is distinct from old.id then raise exception 'Identità fiscale non modificabile'; end if;
   if tg_table_name='documenti_fiscali' and (to_jsonb(new)->'tipo',to_jsonb(new)->'numero',to_jsonb(new)->'data_emissione',to_jsonb(new)->'imponibile_totale',to_jsonb(new)->'iva_totale',to_jsonb(new)->'totale_documento',to_jsonb(new)->'riepilogo_iva',to_jsonb(new)->'esigibilita_iva',to_jsonb(new)->'deleted_at',(new.stato in('bozza','annullata')))
    is not distinct from (to_jsonb(old)->'tipo',to_jsonb(old)->'numero',to_jsonb(old)->'data_emissione',to_jsonb(old)->'imponibile_totale',to_jsonb(old)->'iva_totale',to_jsonb(old)->'totale_documento',to_jsonb(old)->'riepilogo_iva',to_jsonb(old)->'esigibilita_iva',to_jsonb(old)->'deleted_at',(old.stato in('bozza','annullata'))) then return new; end if;
   if tg_table_name='fatture_ricevute' then
    if (to_jsonb(new)->'tipo_documento',to_jsonb(new)->'numero_fattura',new.data_fattura,new.data_ricezione_sdi,to_jsonb(new)->'ricezione_dichiarata_il',new.imponibile_totale,new.iva_totale,new.totale_documento,new.riepilogo_iva,new.aliquota_reverse_charge,(new.stato in('non_letta','letta','contabilizzata')))
     is not distinct from (to_jsonb(old)->'tipo_documento',to_jsonb(old)->'numero_fattura',old.data_fattura,old.data_ricezione_sdi,to_jsonb(old)->'ricezione_dichiarata_il',old.imponibile_totale,old.iva_totale,old.totale_documento,old.riepilogo_iva,old.aliquota_reverse_charge,(old.stato in('non_letta','letta','contabilizzata'))) then return new; end if;
   end if;
  end if;
  if tg_op<>'INSERT' then docs:=docs||jsonb_build_array(to_jsonb(old)); end if;
  if tg_op<>'DELETE' then docs:=docs||jsonb_build_array(to_jsonb(new)); end if;
  for j in select value from jsonb_array_elements(docs) loop
   c:=(j->>'company_id')::uuid;
   if tg_table_name='documenti_fiscali' then new_month:=date_trunc('month',(j->>'data_emissione')::date)::date;
   else new_month:=date_trunc('month',public.data_detrazione_iva((j->>'data_fattura')::date,public.ricezione_iva_il((j->>'data_ricezione_sdi')::timestamptz,(j->>'ricezione_dichiarata_il')::date)))::date; end if;
   if new_month is not null then
    perform pg_advisory_xact_lock(hashtextextended('fiscal-month:'||c||':'||new_month,0));
    if exists(select 1 from public.fiscalita_periodi where company_id=c and mese=new_month and stato='chiuso') then raise exception 'Periodo fiscale chiuso: serve riapertura autorizzata'; end if;
   end if;
  end loop;
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 for r in select distinct m from unnest(array[old_month,new_month]) m where m is not null order by m loop
  perform pg_advisory_xact_lock(hashtextextended('fiscal-month:'||c||':'||r.m,0));
  if exists(select 1 from public.fiscalita_periodi where company_id=c and mese=r.m and stato='chiuso') then raise exception 'Periodo fiscale chiuso: serve riapertura autorizzata'; end if;
 end loop;
 return new;
end $function$;

-- Il prospetto IVA usa la stessa data del Registro (SDI, altrimenti dichiarata)
-- e conta a parte le fatture «da verificare» di fine dicembre. Il resto del
-- calcolo è quello di prima: lo sostituirà il calcolo per righi della fase 2.
CREATE OR REPLACE FUNCTION public.liquidazione_iva_periodo(p_company_id uuid, p_periodo text, p_anno integer, p_mese integer DEFAULT NULL::integer, p_trimestre integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tipi_vendite text[] := ARRAY[
    'fattura','fattura_pa','nota_credito','nota_debito','autofattura',
    'fattura_riepilogativa','parcella','fattura_accompagnatoria',
    'integrazione_servizi_estero','integrazione_beni_ue','integrazione_beni_extra_ue',
    'reverse_charge_interno'];
  -- Le integrazioni: la loro IVA è anche detraibile, quindi entrano pure negli acquisti.
  v_tipi_integrazione text[] := ARRAY[
    'reverse_charge_interno','integrazione_servizi_estero','integrazione_beni_ue','integrazione_beni_extra_ue'];
  v_dal        date;
  v_al         date;
  v_etichetta  text;
  v_mesi       text[] := ARRAY['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                               'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  v_out        jsonb;
  v_n_vendite  int;
  v_n_acquisti int;
  v_senza_ricezione int;
  v_da_verificare int;
BEGIN
  IF public.user_can_access_company(p_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  IF p_anno IS NULL OR p_anno < 2000 OR p_anno > 2100 THEN
    RAISE EXCEPTION 'anno non valido: %', p_anno USING ERRCODE = '22023';
  END IF;

  IF p_periodo = 'mensile' THEN
    IF p_mese IS NULL OR p_mese < 1 OR p_mese > 12 THEN
      RAISE EXCEPTION 'mese non valido: %', p_mese USING ERRCODE = '22023';
    END IF;
    v_dal := make_date(p_anno, p_mese, 1);
    v_al  := (v_dal + interval '1 month' - interval '1 day')::date;
    v_etichetta := v_mesi[p_mese] || ' ' || p_anno;
  ELSIF p_periodo = 'trimestrale' THEN
    IF p_trimestre IS NULL OR p_trimestre < 1 OR p_trimestre > 4 THEN
      RAISE EXCEPTION 'trimestre non valido: %', p_trimestre USING ERRCODE = '22023';
    END IF;
    v_dal := make_date(p_anno, (p_trimestre - 1) * 3 + 1, 1);
    v_al  := (v_dal + interval '3 months' - interval '1 day')::date;
    v_etichetta := p_trimestre || '° Trimestre ' || p_anno;
  ELSE
    RAISE EXCEPTION 'periodo non valido: % (attesi "mensile" o "trimestrale")', p_periodo
      USING ERRCODE = '22023';
  END IF;

  WITH
  vend_doc AS (
    SELECT d.id,
           (d.tipo = 'nota_credito') AS nota_credito,
           coalesce(nullif(d.esigibilita_iva, ''), 'I') AS esig_doc,
           d.imponibile_totale, d.iva_totale, d.riepilogo_iva
    FROM public.fatture_vendite_iva d
    WHERE d.company_id = p_company_id
      AND d.deleted_at IS NULL
      AND d.tipo = ANY(v_tipi_vendite)
      AND d.stato NOT IN ('bozza', 'annullata')
      AND d.data_emissione BETWEEN v_dal AND v_al
  ),
  vend_righe AS (
    SELECT v.id, v.nota_credito,
           coalesce(nullif(r.value ->> 'aliquota', ''), '—') AS aliquota,
           upper(coalesce(nullif(r.value ->> 'esigibilita', ''), v.esig_doc)) AS esigibilita,
           abs(public.num_da_json(r.value ->> 'imponibile')) AS imponibile,
           abs(public.num_da_json(r.value ->> 'imposta'))    AS imposta
    FROM vend_doc v
    CROSS JOIN LATERAL jsonb_array_elements(v.riepilogo_iva) r
    WHERE jsonb_array_length(coalesce(v.riepilogo_iva, '[]'::jsonb)) > 0
    UNION ALL
    SELECT v.id, v.nota_credito, '—', upper(v.esig_doc),
           abs(coalesce(v.imponibile_totale, 0)), abs(coalesce(v.iva_totale, 0))
    FROM vend_doc v
    WHERE jsonb_array_length(coalesce(v.riepilogo_iva, '[]'::jsonb)) = 0
  ),
  vend_segno AS (
    SELECT aliquota, esigibilita,
           CASE WHEN nota_credito THEN -1 ELSE 1 END * imponibile AS imponibile,
           CASE WHEN nota_credito THEN -1 ELSE 1 END * imposta    AS imposta
    FROM vend_righe
  ),
  acq_doc AS (
    -- Nel periodo per data di detrazione (data_detrazione_iva), non per data
    -- della fattura. La data della fattura precede sempre quella di detrazione:
    -- il primo filtro serve solo a non calcolare la regola su tutto l'archivio.
    SELECT f.id,
           (upper(coalesce(f.tipo_documento, '')) = 'TD04'
            OR upper(coalesce(f.tipo_documento, '')) LIKE '%CREDIT%') AS nota_credito,
           f.imponibile_totale, f.iva_totale, f.riepilogo_iva,
           coalesce(f.aliquota_reverse_charge, 22) AS aliquota_rc,
           (f.data_ricezione_sdi IS NULL AND f.ricezione_dichiarata_il IS NULL) AS senza_ricezione,
           (public.ricezione_iva_origine(f.data_fattura, f.data_ricezione_sdi, f.ricezione_dichiarata_il) = 'da_verificare') AS da_verificare
    FROM public.fatture_ricevute f
    WHERE f.company_id = p_company_id
      AND f.stato IN ('non_letta', 'letta', 'contabilizzata')
      AND f.data_fattura <= v_al
      AND f.data_fattura >= (v_dal - interval '13 months')::date
      AND public.data_detrazione_iva(f.data_fattura, public.ricezione_iva_il(f.data_ricezione_sdi, f.ricezione_dichiarata_il)) BETWEEN v_dal AND v_al
  ),
  acq_righe AS (
    SELECT a.id, a.nota_credito,
           coalesce(nullif(r.value ->> 'aliquota', ''), '—') AS aliquota,
           abs(public.num_da_json(r.value ->> 'imponibile')) AS imponibile,
           abs(public.num_da_json(r.value ->> 'imposta'))    AS imposta
    FROM acq_doc a
    CROSS JOIN LATERAL jsonb_array_elements(a.riepilogo_iva) r
    WHERE jsonb_array_length(coalesce(a.riepilogo_iva, '[]'::jsonb)) > 0
    UNION ALL
    SELECT a.id, a.nota_credito, '—',
           abs(coalesce(a.imponibile_totale, 0)), abs(coalesce(a.iva_totale, 0))
    FROM acq_doc a
    WHERE jsonb_array_length(coalesce(a.riepilogo_iva, '[]'::jsonb)) = 0
  ),
  acq_segno AS (
    SELECT aliquota,
           CASE WHEN nota_credito THEN -1 ELSE 1 END * imponibile AS imponibile,
           CASE WHEN nota_credito THEN -1 ELSE 1 END * imposta    AS imposta
    FROM acq_righe
    UNION ALL
    -- Il riflesso delle integrazioni: stessa IVA delle vendite, nello stesso periodo.
    SELECT r.aliquota, r.imponibile, r.imposta
    FROM vend_righe r
    JOIN public.fatture_vendite_iva d ON d.id = r.id
    WHERE d.tipo = ANY(v_tipi_integrazione)
  ),
  -- Reverse charge delle ricevute (N6.x): l'IVA integrata, uguale nei due lati.
  rc AS (
    SELECT rtrim(rtrim(a.aliquota_rc::text, '0'), '.') AS aliquota,
           CASE WHEN a.nota_credito THEN -1 ELSE 1 END * abs(public.num_da_json(r.value ->> 'imponibile')) AS imponibile,
           CASE WHEN a.nota_credito THEN -1 ELSE 1 END
             * round(abs(public.num_da_json(r.value ->> 'imponibile')) * a.aliquota_rc / 100, 2) AS imposta
    FROM acq_doc a
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(a.riepilogo_iva, '[]'::jsonb)) r
    WHERE upper(coalesce(r.value ->> 'natura', '')) LIKE 'N6%'
  ),
  vend_tutte AS (
    SELECT aliquota, esigibilita, imponibile, imposta FROM vend_segno
    UNION ALL
    SELECT aliquota, 'I', imponibile, imposta FROM rc
  ),
  acq_tutte AS (
    SELECT aliquota, imponibile, imposta FROM acq_segno
    UNION ALL
    SELECT aliquota, 0::numeric, imposta FROM rc
  ),
  tot AS (
    SELECT
      (SELECT coalesce(sum(imposta)    FILTER (WHERE esigibilita <> 'S'), 0) FROM vend_tutte) AS iva_vendite,
      (SELECT coalesce(sum(imponibile) FILTER (WHERE esigibilita <> 'S'), 0) FROM vend_tutte) AS imp_vendite,
      (SELECT coalesce(sum(imposta)    FILTER (WHERE esigibilita =  'S'), 0) FROM vend_tutte) AS iva_split,
      (SELECT coalesce(sum(imposta)    FILTER (WHERE esigibilita =  'D'), 0) FROM vend_tutte) AS iva_differita,
      (SELECT coalesce(sum(imposta), 0)    FROM acq_tutte) AS iva_acquisti,
      (SELECT coalesce(sum(imponibile), 0) FROM acq_tutte) AS imp_acquisti,
      (SELECT count(*) FROM vend_doc) AS n_vendite,
      (SELECT count(*) FROM acq_doc)
        + (SELECT count(*) FROM vend_doc v JOIN public.fatture_vendite_iva d ON d.id = v.id
           WHERE d.tipo = ANY(v_tipi_integrazione)) AS n_acquisti,
      (SELECT count(*) FROM acq_doc WHERE senza_ricezione) AS n_senza_ricezione,
      (SELECT count(*) FROM acq_doc WHERE da_verificare) AS n_da_verificare
  ),
  aliquote AS (
    SELECT jsonb_agg(x ORDER BY x ->> 'lato', x ->> 'aliquota') AS righe FROM (
      SELECT jsonb_build_object('lato','vendite','aliquota',aliquota,
               'imponibile', round(sum(imponibile), 2), 'imposta', round(sum(imposta), 2)) AS x
      FROM vend_tutte GROUP BY aliquota
      UNION ALL
      SELECT jsonb_build_object('lato','acquisti','aliquota',aliquota,
               'imponibile', round(sum(imponibile), 2), 'imposta', round(sum(imposta), 2))
      FROM acq_tutte GROUP BY aliquota
    ) s
  )
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object(
      'tipo', p_periodo, 'anno', p_anno, 'mese', p_mese, 'trimestre', p_trimestre,
      'dal', v_dal, 'al', v_al, 'etichetta', v_etichetta),
    'iva_vendite',        round(t.iva_vendite, 2),
    'iva_acquisti',       round(t.iva_acquisti, 2),
    'imponibile_vendite', round(t.imp_vendite, 2),
    'imponibile_acquisti',round(t.imp_acquisti, 2),
    'saldo',              round(t.iva_vendite - t.iva_acquisti, 2),
    'documenti', jsonb_build_object('vendite', t.n_vendite, 'acquisti', t.n_acquisti,
                                    'acquisti_senza_data_ricezione', t.n_senza_ricezione,
                                    'acquisti_ricezione_da_verificare', t.n_da_verificare),
    'escluso', jsonb_build_object(
      'split_payment', round(t.iva_split, 2),
      'nota', 'IVA in scissione dei pagamenti: la versa il committente'),
    'esigibilita_differita', round(t.iva_differita, 2),
    'dettaglio_aliquote', coalesce(a.righe, '[]'::jsonb)
  ), t.n_vendite, t.n_acquisti, t.n_senza_ricezione, t.n_da_verificare
  INTO v_out, v_n_vendite, v_n_acquisti, v_senza_ricezione, v_da_verificare
  FROM tot t CROSS JOIN aliquote a;

  IF v_n_vendite = 0 AND v_n_acquisti = 0 THEN
    RETURN v_out || jsonb_build_object(
      'calcolabile', false,
      'motivo', format(
        'Nessun documento fiscale nel periodo %s: non c''è nulla da liquidare e non è possibile confermare un saldo. Verifica che le fatture emesse e il cassetto SdI siano aggiornati.',
        v_etichetta)
    );
  END IF;

  RETURN v_out || jsonb_build_object(
    'calcolabile', true,
    'ipotesi', jsonb_build_array(
      'IVA sugli acquisti considerata interamente detraibile: la quota di indetraibilità non è tracciata a sistema',
      'Esigibilità differita (IVA per cassa) conteggiata alla data del documento, non a quella dell''incasso',
      'Acquisti nel periodo in cui sono stati ricevuti dallo SDI (o nel mese della fattura se ricevuti entro il 15 del mese dopo). '
        || CASE WHEN v_senza_ricezione > 0
             THEN v_senza_ricezione || ' senza data di ricezione (importati da gestionali o caricati a mano): collocati alla data della fattura'
                  || CASE WHEN v_da_verificare > 0
                       THEN ', di cui ' || v_da_verificare || ' di fine dicembre da verificare: se arrivati a gennaio vanno nell''anno dopo'
                       ELSE '' END
             ELSE 'Tutti con data di ricezione (dallo SDI o dichiarata)' END
    )
  );
END;
$function$;
