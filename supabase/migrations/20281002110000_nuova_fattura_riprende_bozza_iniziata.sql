-- «Nuovo documento» riprende la bozza iniziata invece di aprirne un'altra
-- (02/10/2026, Renova). Ogni bozza nuova prende il numero successivo: una
-- lasciata a metà (browser chiuso prima della pulizia, ritorno indietro) faceva
-- saltare la numerazione, e la fattura di Claudio Bertoli nasceva FPR 74/26 con
-- la 73 ferma su una bozza senza cliente.
--
-- Se la richiesta è «vuota» (solo tipo e data) e nell'azienda c'è già una bozza
-- dello stesso tipo, di quest'anno, senza cliente, si restituisce quella, con
-- «riutilizzata: true». Duplicazioni, conversioni e documenti da ordine portano
-- dati e creano sempre un documento nuovo.
--
-- Il resto della funzione è identico a 20281001150000.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

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
    -- «Nuovo documento» senza nessun dato (né righe, né cliente, né ordine) non
    -- apre una bozza in più se ce n'è una iniziata e senza cliente: si riprende
    -- quella. Ogni bozza nuova ha il suo numero, e una lasciata a metà brucia
    -- un numero della serie (01/10/2026: FPR 73 abbandonata, Claudio Bertoli
    -- partito da FPR 74).
    if (p_dati - 'tipo' - 'data_emissione') = '{}'::jsonb then
      select d.* into v_riga
        from public.documenti_fiscali d
       where d.company_id = p_company_id
         and d.tipo = v_tipo
         and d.stato = 'bozza'
         and d.deleted_at is null
         and d.numero not like 'Bozza %'
         and d.anno = extract(year from v_oggi)::integer
         and d.anagrafica_id is null
         and coalesce(nullif(btrim(d.cliente_snapshot->>'ragione_sociale'), ''),
                      nullif(btrim(d.cliente_snapshot->>'nome'), ''),
                      nullif(btrim(d.cliente_snapshot->>'cognome'), '')) is null
       order by d.numero_progressivo
       limit 1
       for update skip locked;
      if found then
        return jsonb_build_object('id', v_riga.id, 'numero', v_riga.numero,
                                  'numero_progressivo', v_riga.numero_progressivo,
                                  'riutilizzata', true);
      end if;
    end if;
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
