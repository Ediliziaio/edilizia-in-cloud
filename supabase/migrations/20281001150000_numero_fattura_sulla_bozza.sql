-- Numero vero già sulla bozza, e il super admin che entra in un'azienda vede le
-- sue fatture (01/10/2026, go-live di Renova sulla fatturazione interna).
--
-- Perché: la fattura deve avere il suo numero (es. FPR 73/26) già da bozza,
-- così il cliente paga citandolo; l'invio allo SDI viene dopo. Dal 24/09
-- (migrazione 20280924235950) il numero nasceva solo all'emissione e la bozza
-- portava «Bozza XXXXXXXX»: in Renova non si vedeva mai FPR 73/26 e non lo si
-- poteva correggere.
--
-- 1. documento_numero_nella_serie (interna): sceglie prefisso, formato e
--    progressivo della serie (fatture, e note di credito se la serie è unica),
--    salta i numeri già presi (fatture importate, numeri cambiati a mano) e non
--    dà mai due volte lo stesso numero nella serie. Con la serie unica fattura +
--    nota di credito l'indice unique_numero_tipo_anno_company (per tipo) non basta.
-- 2. documento_crea: le fatture nascono col numero vero, nella stessa
--    transazione dell'inserimento (se l'inserimento fallisce il contatore torna
--    indietro).
-- 3. documento_assegna_numero: dà il numero alle bozze nate col segnaposto e lo
--    fa cambiare a mano finché è bozza (es. se l'ultimo numero emesso altrove non
--    è quello atteso). Passa dal trigger di protezione come documento_emetti
--    (fatturazione.emissione = on).
-- 4. rilascia_numero_documento: la nota di credito nella serie unica libera il
--    numero delle fatture; nota di debito e fattura riepilogativa pure (stanno
--    nella serie delle fatture, il contatore NC non c'entra).
-- 5. documenti_fiscali_lettura: il super admin che è entrato nell'azienda le
--    legge. Poteva già scriverle (puo_gestire_documento_fiscale lo ammette), ma
--    l'elenco restava vuoto mentre i conteggi, che passano da funzioni, no.
--
-- documento_emetti non cambia: una bozza già numerata la emette con il suo
-- numero e fa gli stessi controlli su anno e ordine delle date.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1 ─── Numero nella serie ────────────────────────────────────────────────────
create or replace function public.documento_numero_nella_serie(
  p_company_id uuid,
  p_tipo text,
  p_anno integer,
  p_numero_progressivo integer default null,
  p_escludi_id uuid default null
)
returns table (numero text, numero_progressivo integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  c_serie_ft constant text[] := array['fattura','fattura_pa','nota_debito','autofattura','fattura_riepilogativa'];
  v_ana        public.anagrafica_azienda%rowtype;
  v_condivisa  boolean;
  v_fatture    boolean;   -- la serie usa il contatore delle fatture
  v_serie      text[];
  v_prefisso   text;
  v_formato    text;
  v_prog       integer;
  v_giri       integer := 0;
begin
  select * into v_ana from public.anagrafica_azienda a where a.company_id = p_company_id for update;
  if not found then
    raise exception 'Anagrafica azienda non configurata: completala in Impostazioni → Fatturazione.'
      using errcode = 'P0002';
  end if;

  v_condivisa := coalesce(v_ana.nc_serie_condivisa, false);
  v_fatture   := p_tipo <> 'nota_credito' or v_condivisa;
  if v_fatture then
    v_serie    := c_serie_ft || case when v_condivisa then array['nota_credito'] else array[]::text[] end;
    v_prefisso := coalesce(v_ana.prefisso_fattura, 'FT');
    v_formato  := v_ana.formato_numero;
  else
    v_serie    := array['nota_credito'];
    v_prefisso := coalesce(v_ana.prefisso_nc, 'NC');
    v_formato  := null;
  end if;

  if p_numero_progressivo is not null then
    -- Scelto a mano.
    if p_numero_progressivo < 1 then
      raise exception 'Il numero della fattura parte da 1.' using errcode = '22023';
    end if;
    v_prog := p_numero_progressivo;
  elsif v_fatture and p_anno < coalesce(v_ana.anno_corrente_fattura, p_anno) then
    -- Anno che il contatore ha già chiuso: il primo libero di quell'anno.
    select coalesce(max(d.numero_progressivo), 0) + 1 into v_prog
      from public.documenti_fiscali d
     where d.company_id = p_company_id and d.tipo = any (v_serie) and d.anno = p_anno
       and d.numero not like 'Bozza %';
  else
    -- Il successivo del contatore (a inizio anno riparte da 1).
    perform public.genera_numero_documento_native(p_company_id, p_tipo, p_anno);
    select case when v_fatture then a.ultimo_numero_fattura else a.ultimo_numero_nc end
      into v_prog
      from public.anagrafica_azienda a where a.company_id = p_company_id;
    -- Contatore indietro rispetto ai documenti già presenti: il primo libero.
    while exists (
      select 1 from public.documenti_fiscali d
       where d.company_id = p_company_id and d.tipo = any (v_serie) and d.anno = p_anno
         and d.numero_progressivo = v_prog and d.numero not like 'Bozza %'
         and (p_escludi_id is null or d.id <> p_escludi_id)
    ) loop
      v_prog := v_prog + 1;
      v_giri := v_giri + 1;
      if v_giri > 10000 then
        raise exception 'Numerazione bloccata: controlla i numeratori in Impostazioni → Fatturazione.'
          using errcode = '22023';
      end if;
    end loop;
  end if;

  -- Mai due documenti con lo stesso numero nella stessa serie e nello stesso
  -- anno: bozze numerate e cestino compresi, l'indice unico non lascia riusarli.
  if exists (
    select 1 from public.documenti_fiscali d
     where d.company_id = p_company_id and d.tipo = any (v_serie) and d.anno = p_anno
       and d.numero_progressivo = v_prog and d.numero not like 'Bozza %'
       and (p_escludi_id is null or d.id <> p_escludi_id)
  ) then
    raise exception 'Il numero % è già usato da un altro documento della stessa serie: scegline un altro.',
      public.formatta_numero_documento(v_formato, v_prefisso, v_prog, p_anno)
      using errcode = '23505';
  end if;

  -- Il contatore segue il numero più alto dell'anno in corso, così la prossima
  -- fattura continua da qui. Un anno già chiuso non lo tocca.
  if v_fatture then
    if coalesce(v_ana.anno_corrente_fattura, 0) < p_anno then
      update public.anagrafica_azienda
         set anno_corrente_fattura = p_anno, ultimo_numero_fattura = v_prog
       where company_id = p_company_id;
    elsif v_ana.anno_corrente_fattura = p_anno then
      update public.anagrafica_azienda
         set ultimo_numero_fattura = greatest(coalesce(ultimo_numero_fattura, 0), v_prog)
       where company_id = p_company_id;
    end if;
  else
    update public.anagrafica_azienda
       set ultimo_numero_nc = greatest(coalesce(ultimo_numero_nc, 0), v_prog)
     where company_id = p_company_id;
  end if;

  return query select public.formatta_numero_documento(v_formato, v_prefisso, v_prog, p_anno), v_prog;
end;
$function$;

-- Interna: la chiamano solo documento_crea e documento_assegna_numero.
revoke all on function public.documento_numero_nella_serie(uuid, text, integer, integer, uuid) from public, anon, authenticated;

-- 2 ─── documento_crea: la fattura nasce col numero vero ──────────────────────
create or replace function public.documento_crea(p_company_id uuid, p_dati jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tipo    text;
  v_oggi    date := (now() at time zone 'Europe/Rome')::date;
  v_data    date;
  v_anno    integer := extract(year from (now() at time zone 'Europe/Rome'))::integer;
  v_numero  text;
  v_prog    integer;
  v_riga    public.documenti_fiscali%rowtype;
  v_id      uuid := gen_random_uuid();
  v_stato   text;
  c_ammessi text[] := array['fattura','fattura_pa','nota_credito','nota_debito',
                            'autofattura','fattura_riepilogativa','proforma',
                            'preventivo','ddt'];
  -- Documenti che vanno allo SDI: nascono in bozza, col numero vero della serie.
  c_fiscali text[] := array['fattura','fattura_pa','nota_credito','nota_debito',
                            'autofattura','fattura_riepilogativa'];
begin
  if public.user_can_access_company(p_company_id) is not true then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  if auth.uid() is null then
    raise exception 'documento_crea: serve un utente autenticato' using errcode = '42501';
  end if;

  v_tipo := nullif(btrim(p_dati->>'tipo'), '');
  if v_tipo is null then
    raise exception 'Manca il tipo di documento' using errcode = '22023';
  end if;

  -- Prima di tutto, e soprattutto prima del contatore.
  if not (v_tipo = any (c_ammessi)) then
    raise exception 'Il tipo di documento "%" non e'' ancora gestito. Tipi disponibili: %.',
      v_tipo, array_to_string(c_ammessi, ', ')
      using errcode = '22023';
  end if;

  if not public.puo_gestire_documento_fiscale(p_company_id, v_tipo) then
    raise exception 'Non hai il permesso di creare documenti fiscali (serve «Fatturazione»).' using errcode = '42501';
  end if;

  if v_tipo = any (c_fiscali) then
    -- Il numero vero nasce con la bozza (01/10/2026): il cliente può pagare
    -- citandolo prima dell'invio allo SDI. Stessa transazione dell'inserimento:
    -- se qualcosa fallisce, anche il contatore torna indietro. L'emissione resta
    -- a documento_emetti, che tiene questo numero.
    v_data := coalesce(nullif(btrim(p_dati->>'data_emissione'), '')::date, v_oggi);
    v_anno := extract(year from v_data)::integer;
    select n.numero, n.numero_progressivo into v_numero, v_prog
      from public.documento_numero_nella_serie(p_company_id, v_tipo, v_anno) n;
    v_stato := 'bozza';
  else
    -- Da qui in poi siamo dentro la stessa transazione: se qualcosa fallisce,
    -- anche l'incremento del contatore torna indietro.
    v_numero := public.genera_numero_documento_native(p_company_id, v_tipo, v_anno);
    v_prog := coalesce(nullif(regexp_replace(v_numero, '^.*-', ''), '')::integer, 1);
    v_stato := coalesce(nullif(p_dati->>'stato',''), 'bozza');
  end if;

  v_riga := jsonb_populate_record(
    null::public.documenti_fiscali,
    p_dati
      || jsonb_build_object(
           'company_id', p_company_id,
           'numero', v_numero,
           'numero_progressivo', v_prog,
           'anno', v_anno,
           'tipo', v_tipo,
           'stato', v_stato)
      - 'id' - 'created_at' - 'updated_at' - 'version' - 'deleted_at'
  );

  v_riga.id            := v_id;
  v_riga.created_at    := now();
  v_riga.updated_at    := now();
  v_riga.version       := 1;
  v_riga.deleted_at    := null;
  v_riga.data_emissione := coalesce(v_riga.data_emissione, v_oggi);
  v_riga.cliente_snapshot := coalesce(v_riga.cliente_snapshot, '{}'::jsonb);
  v_riga.righe            := coalesce(v_riga.righe, '[]'::jsonb);
  v_riga.riepilogo_iva    := coalesce(v_riga.riepilogo_iva, '[]'::jsonb);
  v_riga.subtotale          := coalesce(v_riga.subtotale, 0);
  v_riga.imponibile_totale  := coalesce(v_riga.imponibile_totale, 0);
  v_riga.iva_totale         := coalesce(v_riga.iva_totale, 0);
  v_riga.totale_documento   := coalesce(v_riga.totale_documento, 0);
  v_riga.totale_da_pagare   := coalesce(v_riga.totale_da_pagare, 0);

  insert into public.documenti_fiscali select v_riga.* returning id into v_id;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'numero_progressivo', v_prog);
end;
$function$;

revoke all on function public.documento_crea(uuid, jsonb) from public, anon;
grant execute on function public.documento_crea(uuid, jsonb) to authenticated;

-- 3 ─── documento_assegna_numero: numero alla bozza, o cambiato a mano ─────────
create or replace function public.documento_assegna_numero(
  p_documento_id uuid,
  p_numero_progressivo integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c_fiscali constant text[] := array['fattura','fattura_pa','nota_credito','nota_debito','autofattura','fattura_riepilogativa'];
  v_doc     public.documenti_fiscali%rowtype;
  v_anno    integer;
  v_numero  text;
  v_prog    integer;
begin
  if auth.uid() is null then
    raise exception 'documento_assegna_numero: serve un utente autenticato' using errcode = '42501';
  end if;
  select * into v_doc from public.documenti_fiscali where id = p_documento_id and deleted_at is null for update;
  if not found then
    raise exception 'Documento non trovato' using errcode = 'P0002';
  end if;
  if public.user_can_access_company(v_doc.company_id) is not true then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  if not public.puo_gestire_documento_fiscale(v_doc.company_id, v_doc.tipo) then
    raise exception 'Non hai il permesso di gestire i documenti fiscali (serve «Fatturazione»).' using errcode = '42501';
  end if;

  -- Proforma, preventivi e DDT hanno già il loro numero dalla creazione.
  if not (v_doc.tipo = any (c_fiscali)) then
    return jsonb_build_object('id', v_doc.id, 'numero', v_doc.numero,
                              'numero_progressivo', v_doc.numero_progressivo, 'anno', v_doc.anno);
  end if;
  if v_doc.stato <> 'bozza' then
    raise exception 'Il numero si cambia solo finché il documento è in bozza (questo è «%»).', v_doc.stato
      using errcode = '22023';
  end if;
  -- Già numerata e nessun numero nuovo chiesto (o lo stesso): resta com'è.
  if v_doc.numero not like 'Bozza %'
     and (p_numero_progressivo is null or p_numero_progressivo = v_doc.numero_progressivo) then
    return jsonb_build_object('id', v_doc.id, 'numero', v_doc.numero,
                              'numero_progressivo', v_doc.numero_progressivo, 'anno', v_doc.anno);
  end if;

  v_anno := extract(year from coalesce(v_doc.data_emissione, (now() at time zone 'Europe/Rome')::date))::integer;
  select n.numero, n.numero_progressivo into v_numero, v_prog
    from public.documento_numero_nella_serie(v_doc.company_id, v_doc.tipo, v_anno, p_numero_progressivo, v_doc.id) n;

  perform set_config('fatturazione.emissione', 'on', true);
  update public.documenti_fiscali
     set numero = v_numero, numero_progressivo = v_prog, anno = v_anno, updated_at = now()
   where id = v_doc.id;
  perform set_config('fatturazione.emissione', 'off', true);

  return jsonb_build_object('id', v_doc.id, 'numero', v_numero, 'numero_progressivo', v_prog, 'anno', v_anno);
end;
$function$;

revoke all on function public.documento_assegna_numero(uuid, integer) from public, anon;
grant execute on function public.documento_assegna_numero(uuid, integer) to authenticated;

-- 4 ─── rilascia_numero_documento: la serie giusta ────────────────────────────
create or replace function public.rilascia_numero_documento(p_documento_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_doc RECORD;
  v_company_id UUID;
  v_progressivo INTEGER;
  v_tipo TEXT;
  v_anno INTEGER;
  v_condivisa BOOLEAN;
  v_rilasciato BOOLEAN := FALSE;
  v_azienda_doc UUID := (SELECT x.company_id FROM public.documenti_fiscali x WHERE x.id = p_documento_id);
BEGIN
  -- [audit sicurezza 2026-08-27] guardia anti cross-tenant
  IF v_azienda_doc IS NOT NULL
     AND NOT public.user_can_access_company(v_azienda_doc) THEN
    RAISE EXCEPTION 'accesso negato: azienda non consentita' USING ERRCODE = '42501';
  END IF;

  -- Serve «Fatturazione» o il commercialista con scrittura, come per aprire
  -- l'editor. Senza utente (service role) si passa.
  IF v_azienda_doc IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role)
     AND (public.utente_bloccato()
          OR NOT (v_azienda_doc = ANY (public.aziende_con_permesso('can_view_billing'))
                  OR public.user_can_write_accountant_company(v_azienda_doc))) THEN
    RAISE EXCEPTION 'Non hai il permesso di gestire i documenti fiscali.' USING ERRCODE = '42501';
  END IF;

  SELECT id, company_id, numero_progressivo, tipo, anno, stato
    INTO v_doc
  FROM public.documenti_fiscali
  WHERE id = p_documento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_doc.stato != 'bozza' THEN
    RETURN FALSE;
  END IF;

  v_company_id := v_doc.company_id;
  v_progressivo := v_doc.numero_progressivo;
  v_tipo := v_doc.tipo;
  v_anno := v_doc.anno;
  v_condivisa := coalesce((SELECT a.nc_serie_condivisa FROM public.anagrafica_azienda a
                            WHERE a.company_id = v_company_id), false);

  -- Decrementa solo se il progressivo del doc e' il piu' alto emesso per
  -- quella serie/anno/azienda, e confrontando l'anno col contatore GIUSTO.
  IF v_tipo IN ('fattura', 'fattura_pa', 'autofattura', 'nota_debito', 'fattura_riepilogativa',
                'integrazione_servizi_estero', 'integrazione_beni_ue', 'integrazione_beni_extra_ue')
     OR (v_tipo = 'nota_credito' AND v_condivisa) THEN
    -- Serie delle fatture (con la nota di credito, se la serie è unica).
    UPDATE public.anagrafica_azienda
    SET ultimo_numero_fattura = ultimo_numero_fattura - 1
    WHERE company_id = v_company_id
      AND anno_corrente_fattura = v_anno
      AND ultimo_numero_fattura = v_progressivo;
    IF FOUND THEN v_rilasciato := TRUE; END IF;

  ELSIF v_tipo = 'preventivo' THEN
    UPDATE public.anagrafica_azienda
    SET ultimo_numero_preventivo = ultimo_numero_preventivo - 1
    WHERE company_id = v_company_id
      AND anno_corrente_preventivo = v_anno
      AND ultimo_numero_preventivo = v_progressivo;
    IF FOUND THEN v_rilasciato := TRUE; END IF;

  ELSIF v_tipo = 'proforma' THEN
    UPDATE public.anagrafica_azienda
    SET ultimo_numero_proforma = ultimo_numero_proforma - 1
    WHERE company_id = v_company_id
      AND anno_corrente_proforma = v_anno
      AND ultimo_numero_proforma = v_progressivo;
    IF FOUND THEN v_rilasciato := TRUE; END IF;

  -- Nota di credito con serie propria e DDT: serie continua, il generatore non
  -- le azzera a inizio anno → qui niente controllo d'anno, altrimenti dal 2027
  -- il numero non tornerebbe mai indietro.
  ELSIF v_tipo = 'nota_credito' THEN
    UPDATE public.anagrafica_azienda
    SET ultimo_numero_nc = ultimo_numero_nc - 1
    WHERE company_id = v_company_id
      AND ultimo_numero_nc = v_progressivo;
    IF FOUND THEN v_rilasciato := TRUE; END IF;

  ELSIF v_tipo = 'ddt' THEN
    UPDATE public.anagrafica_azienda
    SET ultimo_numero_ddt = ultimo_numero_ddt - 1
    WHERE company_id = v_company_id
      AND ultimo_numero_ddt = v_progressivo;
    IF FOUND THEN v_rilasciato := TRUE; END IF;

  ELSE
    RETURN FALSE;
  END IF;

  -- La bozza vuota se ne va comunque: se il numero non era l'ultimo, il buco
  -- resta ma il documento fantasma no.
  DELETE FROM public.documenti_fiscali WHERE id = p_documento_id;

  RETURN v_rilasciato;
END;
$function$;

revoke all on function public.rilascia_numero_documento(uuid) from public, anon;
grant execute on function public.rilascia_numero_documento(uuid) to authenticated;

-- 5 ─── Il super admin entrato nell'azienda legge le sue fatture ─────────────
drop policy if exists documenti_fiscali_lettura on public.documenti_fiscali;
create policy documenti_fiscali_lettura on public.documenti_fiscali
  for select to authenticated
  using (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
    and (
      (select public.has_role(auth.uid(), 'super_admin'::public.app_role))
      or company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
        'can_view_billing', 'can_view_tesoreria', 'can_view_scadenzario', 'can_view_prima_nota',
        'can_view_cruscotto', 'can_view_controllo_gestione', 'can_view_financial_reports'])))
      or (tipo = 'ddt'
          and company_id in (select unnest(public.aziende_con_uno_dei_permessi(array['can_view_warehouse', 'can_view_orders']))))
      or (company_id in (select unnest(public.aziende_con_permesso('can_view_order_amounts')))
          and (exists (select 1 from public.orders o where o.id = documenti_fiscali.ordine_id)
               or exists (select 1 from public.fattura_ordine fo join public.orders o on o.id = fo.ordine_id
                           where fo.fattura_id = documenti_fiscali.id)))
    )
  );
