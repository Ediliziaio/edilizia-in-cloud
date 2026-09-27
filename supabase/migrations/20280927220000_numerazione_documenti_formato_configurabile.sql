-- Numerazione documenti a formato configurabile + serie unica fattura/NC.
-- Serve a Renova Solution (primo cliente sul nostro SDI): la sua serie è
-- «FPR NN/26», unica per fatture (TD01) e note di credito (TD04). Default
-- invariato per tutte le altre aziende (formato_numero NULL → 'PREFISSO-YYYY-NNNN').

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.anagrafica_azienda add column if not exists formato_numero text;
alter table public.anagrafica_azienda add column if not exists nc_serie_condivisa boolean not null default false;

comment on column public.anagrafica_azienda.formato_numero is
  'Template del numero della SERIE FATTURE (fattura + NC condivisa). NULL = ''{prefisso}-{yyyy}-{nnnn}''. Segnaposto: {prefisso} {n} {nnnn} {yyyy} {yy}.';
comment on column public.anagrafica_azienda.nc_serie_condivisa is
  'Se true, la nota di credito prende il numero successivo della serie fatture (una serie sola), come Renova (FPR).';

-- Rende il numero da un template. Default = comportamento storico.
create or replace function public.formatta_numero_documento(p_formato text, p_prefisso text, p_prog integer, p_anno integer)
returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(
           coalesce(p_formato, '{prefisso}-{yyyy}-{nnnn}'),
           '{prefisso}', p_prefisso),
           '{yyyy}', p_anno::text),
           '{yy}', right(p_anno::text, 2)),
           '{nnnn}', lpad(p_prog::text, 4, '0')),
           '{n}', p_prog::text);
$$;

-- Contatore + formato. Il default (formato_numero NULL, nc_serie_condivisa false)
-- resta identico a prima: verificato in transazione annullata (FT-2026-0001, NC-2026-0001).
create or replace function public.genera_numero_documento_native(p_company_id uuid, p_tipo text, p_anno integer default (extract(year from now()))::integer)
returns text language plpgsql set search_path to 'public' as $function$
declare
  v_prefisso text;
  v_contatore integer;
  v_ana public.anagrafica_azienda%rowtype;
  v_condivisa boolean;
  v_formato text;
begin
  select * into v_ana from public.anagrafica_azienda where company_id = p_company_id for update;
  if not found then
    raise exception 'Anagrafica azienda non trovata per company_id: %', p_company_id;
  end if;
  -- Serie unica: la nota di credito segue il contatore delle fatture.
  v_condivisa := (p_tipo = 'nota_credito' and coalesce(v_ana.nc_serie_condivisa, false));

  case p_tipo
    when 'fattura', 'fattura_pa', 'autofattura', 'nota_debito', 'fattura_riepilogativa',
         'integrazione_servizi_estero', 'integrazione_beni_ue', 'integrazione_beni_extra_ue' then
      v_prefisso := coalesce(v_ana.prefisso_fattura, 'FT');
      if coalesce(v_ana.anno_corrente_fattura, 0) < p_anno then
        update public.anagrafica_azienda set ultimo_numero_fattura = 1, anno_corrente_fattura = p_anno
         where company_id = p_company_id returning ultimo_numero_fattura into v_contatore;
      else
        update public.anagrafica_azienda set ultimo_numero_fattura = ultimo_numero_fattura + 1
         where company_id = p_company_id returning ultimo_numero_fattura into v_contatore;
      end if;

    when 'nota_credito' then
      if v_condivisa then
        v_prefisso := coalesce(v_ana.prefisso_fattura, 'FT');
        if coalesce(v_ana.anno_corrente_fattura, 0) < p_anno then
          update public.anagrafica_azienda set ultimo_numero_fattura = 1, anno_corrente_fattura = p_anno
           where company_id = p_company_id returning ultimo_numero_fattura into v_contatore;
        else
          update public.anagrafica_azienda set ultimo_numero_fattura = ultimo_numero_fattura + 1
           where company_id = p_company_id returning ultimo_numero_fattura into v_contatore;
        end if;
      else
        v_prefisso := coalesce(v_ana.prefisso_nc, 'NC');
        update public.anagrafica_azienda set ultimo_numero_nc = ultimo_numero_nc + 1
         where company_id = p_company_id returning ultimo_numero_nc into v_contatore;
      end if;

    when 'ddt' then
      v_prefisso := coalesce(v_ana.prefisso_ddt, 'DDT');
      update public.anagrafica_azienda set ultimo_numero_ddt = ultimo_numero_ddt + 1
       where company_id = p_company_id returning ultimo_numero_ddt into v_contatore;

    when 'preventivo' then
      v_prefisso := coalesce(v_ana.prefisso_preventivo, 'PRV');
      if coalesce(v_ana.anno_corrente_preventivo, 0) < p_anno then
        update public.anagrafica_azienda set ultimo_numero_preventivo = 1, anno_corrente_preventivo = p_anno
         where company_id = p_company_id returning ultimo_numero_preventivo into v_contatore;
      else
        update public.anagrafica_azienda set ultimo_numero_preventivo = ultimo_numero_preventivo + 1
         where company_id = p_company_id returning ultimo_numero_preventivo into v_contatore;
      end if;

    when 'proforma' then
      v_prefisso := coalesce(v_ana.prefisso_proforma, 'PF');
      if coalesce(v_ana.anno_corrente_proforma, 0) < p_anno then
        update public.anagrafica_azienda set ultimo_numero_proforma = 1, anno_corrente_proforma = p_anno
         where company_id = p_company_id returning ultimo_numero_proforma into v_contatore;
      else
        update public.anagrafica_azienda set ultimo_numero_proforma = ultimo_numero_proforma + 1
         where company_id = p_company_id returning ultimo_numero_proforma into v_contatore;
      end if;

    else
      v_prefisso := 'DOC';
      update public.anagrafica_azienda set ultimo_numero_fattura = ultimo_numero_fattura + 1
       where company_id = p_company_id returning ultimo_numero_fattura into v_contatore;
  end case;

  -- Il template si applica solo alla serie fatture (incl. NC condivisa). Il resto: default.
  if p_tipo in ('fattura','fattura_pa','autofattura','nota_debito','fattura_riepilogativa',
                'integrazione_servizi_estero','integrazione_beni_ue','integrazione_beni_extra_ue') or v_condivisa then
    v_formato := v_ana.formato_numero;
  end if;
  return public.formatta_numero_documento(v_formato, v_prefisso, v_contatore, p_anno);
end;
$function$;

-- documento_emetti: identico a prima, con tre correzioni per la serie configurabile:
--   1) la serie di ordinamento include la NC quando nc_serie_condivisa (serie unica);
--   2) il ramo «anno prima» compone il numero col template (non più cablato);
--   3) il progressivo intero si legge dal CONTATORE, non dal testo (il regex
--      '^.*-' esplodeva su «FPR 73/26» che non ha trattino).
create or replace function public.documento_emetti(p_documento_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  c_fiscali  constant text[] := array['fattura','fattura_pa','nota_credito','nota_debito',
                                      'autofattura','fattura_riepilogativa'];
  c_serie_ft constant text[] := array['fattura','fattura_pa','nota_debito','autofattura',
                                      'fattura_riepilogativa'];
  v_doc      public.documenti_fiscali%rowtype;
  v_ana      public.anagrafica_azienda%rowtype;
  v_oggi     date := (now() at time zone 'Europe/Rome')::date;
  v_data     date;
  v_anno     integer;
  v_serie    text[];
  v_numero   text;
  v_prog     integer;
  v_prefisso text;
  v_altra    record;
begin
  if auth.uid() is null then
    raise exception 'documento_emetti: serve un utente autenticato' using errcode = '42501';
  end if;

  select * into v_doc from public.documenti_fiscali
   where id = p_documento_id and deleted_at is null
   for update;
  if not found then
    raise exception 'Documento non trovato' using errcode = 'P0002';
  end if;
  if public.user_can_access_company(v_doc.company_id) is not true then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  if not public.puo_gestire_documento_fiscale(v_doc.company_id, v_doc.tipo) then
    raise exception 'Non hai il permesso di emettere documenti fiscali (serve «Fatturazione»).' using errcode = '42501';
  end if;
  if v_doc.stato <> 'bozza' then
    raise exception 'Solo i documenti in bozza possono essere emessi (questo è «%»).', v_doc.stato
      using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(v_doc.righe, '[]'::jsonb)) = 0 and v_doc.tipo <> 'nota_credito' then
    raise exception 'Il documento deve avere almeno una riga' using errcode = '22023';
  end if;
  if coalesce(btrim(v_doc.cliente_snapshot->>'ragione_sociale'), '') = '' then
    raise exception 'Il cliente è obbligatorio per emettere il documento' using errcode = '22023';
  end if;

  v_data := coalesce(v_doc.data_emissione, v_oggi);
  if v_data > v_oggi then
    raise exception 'La data del documento (%) è nel futuro: una fattura porta la data in cui la emetti, e lo SDI scarta quelle con data successiva all''invio.',
      to_char(v_data, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  -- Preventivi, proforma e DDT: il numero l'hanno già, si emettono come prima.
  if not (v_doc.tipo = any (c_fiscali)) then
    perform set_config('fatturazione.emissione', 'on', true);
    update public.documenti_fiscali
       set stato = 'emessa', data_emissione = v_data, updated_at = now()
     where id = v_doc.id;
    perform set_config('fatturazione.emissione', 'off', true);
    return jsonb_build_object('id', v_doc.id, 'numero', v_doc.numero);
  end if;

  v_anno := extract(year from v_data)::integer;

  -- Un'emissione alla volta per azienda: lo stesso lucchetto della numerazione.
  select * into v_ana from public.anagrafica_azienda
   where company_id = v_doc.company_id
   for update;
  if not found then
    raise exception 'Anagrafica azienda non configurata: completala in Impostazioni → Fatturazione.'
      using errcode = 'P0002';
  end if;

  -- (1) Serie unica: con nc_serie_condivisa la NC ordina nella serie delle fatture.
  if coalesce(v_ana.nc_serie_condivisa, false) then
    v_serie := c_serie_ft || array['nota_credito'];
  else
    v_serie := case when v_doc.tipo = 'nota_credito' then array['nota_credito'] else c_serie_ft end;
  end if;

  if v_doc.numero like 'Bozza %' then
    if (v_doc.tipo <> 'nota_credito' or coalesce(v_ana.nc_serie_condivisa, false))
       and v_anno < coalesce(v_ana.anno_corrente_fattura, v_anno) then
      -- Fattura (o NC in serie unica) con la data dell'anno prima, emessa dopo il
      -- cambio d'anno: continua la serie di quell'anno, senza toccare il contatore nuovo.
      v_prefisso := coalesce(v_ana.prefisso_fattura, 'FT');
      select coalesce(max(numero_progressivo), 0) + 1 into v_prog
        from public.documenti_fiscali
       where company_id = v_doc.company_id and tipo = any (v_serie) and anno = v_anno
         and numero not like 'Bozza %';
      -- (2) numero col template dell'azienda (default = 'PREFISSO-YYYY-NNNN')
      v_numero := public.formatta_numero_documento(v_ana.formato_numero, v_prefisso, v_prog, v_anno);
    else
      v_numero := public.genera_numero_documento_native(v_doc.company_id, v_doc.tipo, v_anno);
      -- (3) progressivo dal contatore appena incrementato, non dal testo.
      select case when v_doc.tipo = 'nota_credito' and not coalesce(v_ana.nc_serie_condivisa, false)
                  then ultimo_numero_nc else ultimo_numero_fattura end
        into v_prog from public.anagrafica_azienda where company_id = v_doc.company_id;
    end if;
  else
    -- Bozza nata prima del 24/09/2026: il numero l'aveva già.
    v_numero := v_doc.numero;
    v_prog := v_doc.numero_progressivo;
    if v_doc.anno is not null and v_doc.anno <> v_anno then
      raise exception 'Il numero % è della serie % ma la data è del %: elimina questa bozza e creane una nuova, prenderà il numero giusto.',
        v_doc.numero, v_doc.anno, v_anno using errcode = '22023';
    end if;
  end if;

  -- La numerazione segue le date (nessuna incoerenza numero/data nella stessa serie).
  select numero, data_emissione into v_altra
    from public.documenti_fiscali
   where company_id = v_doc.company_id and tipo = any (v_serie) and anno = v_anno
     and id <> v_doc.id and deleted_at is null and stato not in ('bozza', 'annullata')
     and numero_progressivo < v_prog and data_emissione > v_data
   order by data_emissione desc
   limit 1;
  if found then
    raise exception 'La % è del %: una fattura con numero successivo non può avere una data precedente. Usa una data dal % in poi.',
      v_altra.numero, to_char(v_altra.data_emissione, 'DD/MM/YYYY'), to_char(v_altra.data_emissione, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;
  select numero, data_emissione into v_altra
    from public.documenti_fiscali
   where company_id = v_doc.company_id and tipo = any (v_serie) and anno = v_anno
     and id <> v_doc.id and deleted_at is null and stato not in ('bozza', 'annullata')
     and numero_progressivo > v_prog and data_emissione < v_data
   order by data_emissione asc
   limit 1;
  if found then
    raise exception 'La % è del %: questa bozza ha un numero più basso e non può avere una data successiva. Usa una data fino al %, oppure elimina la bozza e creane una nuova.',
      v_altra.numero, to_char(v_altra.data_emissione, 'DD/MM/YYYY'), to_char(v_altra.data_emissione, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  perform set_config('fatturazione.emissione', 'on', true);
  update public.documenti_fiscali
     set numero = v_numero,
         numero_progressivo = v_prog,
         anno = v_anno,
         data_emissione = v_data,
         stato = 'emessa',
         updated_at = now()
   where id = v_doc.id;
  perform set_config('fatturazione.emissione', 'off', true);

  return jsonb_build_object('id', v_doc.id, 'numero', v_numero, 'numero_progressivo', v_prog, 'anno', v_anno);
end;
$function$;

-- Il helper nuovo è chiuso a PUBLIC/anon (regola del progetto); lo usano le funzioni di numerazione.
revoke all on function public.formatta_numero_documento(text, text, integer, integer) from public, anon;
grant execute on function public.formatta_numero_documento(text, text, integer, integer) to authenticated, service_role;
