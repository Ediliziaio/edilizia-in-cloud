-- Le fatture emesse da EiC entrano nel Controllo di Gestione (9 novembre 2026).
--
-- Una fattura emessa può stare in due tabelle: `invoices` (importate da XML o
-- dai provider) e `documenti_fiscali` (fatte dentro EiC). Nessun codice copia
-- le seconde nelle prime, e il Controllo di Gestione leggeva solo `invoices`:
-- ricavi, crediti verso clienti e fatturato delle commesse non vedevano le
-- fatture native. Il Registro IVA invece le ha sempre viste.
--
-- Da qui c'è una vista sola, `v_cg_fatture_emesse`, e tutti leggono quella.
-- Dove la stessa fattura sta in entrambe le tabelle (stesso numero, stessa
-- data, stesso verso) vale la riga di `invoices`, che ha cliente e commessa già
-- collegati: la nativa si scarta e non si conta due volte.
--
-- Cosa non entra: bozze, annullate, rifiutate dal cliente o dallo SDI, proforma,
-- preventivi, DDT, autofatture e integrazioni (queste ultime sono acquisti).
--
-- Corregge anche due difetti del dettaglio della voce «Ricavi»: sommava le note
-- di credito in positivo e contava le fatture cancellate, quindi non tornava
-- col totale del conto economico. E i crediti verso clienti contavano le
-- fatture cancellate.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace view public.v_cg_fatture_emesse as
select i.id,
       i.company_id,
       'invoices'::text as origine,
       i.invoice_number as numero,
       i.issue_date as data,
       case when i.document_type = 'credit_note' then -1 else 1 end as segno,
       coalesce(i.total, 0::numeric) - coalesce(i.tax_amount, 0::numeric) as imponibile,
       coalesce(i.tax_amount, 0::numeric) as iva,
       greatest(coalesce(i.total, 0::numeric) - coalesce(i.paid_amount, 0::numeric), 0::numeric) as residuo,
       i.client_id as cliente_id,
       i.client_company_name as controparte,
       i.order_id,
       i.document_type
  from invoices i
 where (i.status <> all (array['cancelled'::text, 'draft'::text, 'annullata'::text, 'bozza'::text]))
   and i.issue_date is not null
   and i.deleted_at is null
union all
select d.id,
       d.company_id,
       'documenti_fiscali'::text as origine,
       d.numero,
       d.data_emissione as data,
       case when d.tipo = 'nota_credito' then -1 else 1 end as segno,
       coalesce(d.imponibile_totale, 0::numeric) as imponibile,
       coalesce(d.iva_totale, 0::numeric) as iva,
       case when d.stato = 'pagata' then 0::numeric
            else greatest(coalesce(d.totale_da_pagare, d.totale_documento, 0::numeric)
                          - coalesce(d.importo_pagato, 0::numeric), 0::numeric)
       end as residuo,
       -- `invoices.client_id` punta ai contatti, `anagrafica_id` a un'altra
       -- tabella: metterli nella stessa colonna farebbe confondere gli id.
       null::uuid as cliente_id,
       d.cliente_snapshot ->> 'ragione_sociale' as controparte,
       d.ordine_id as order_id,
       case when d.tipo = 'nota_credito' then 'credit_note'::text else 'invoice'::text end as document_type
  from documenti_fiscali d
 where d.deleted_at is null
   and d.data_emissione is not null
   and d.stato <> all (array['bozza'::text, 'annullata'::text, 'rifiutata'::text])
   and d.tipo = any (array['fattura'::text, 'fattura_pa'::text, 'fattura_riepilogativa'::text,
                           'nota_credito'::text, 'nota_debito'::text])
   and not exists (
     select 1
       from invoices g
      where g.company_id = d.company_id
        and g.invoice_number = d.numero
        and g.issue_date = d.data_emissione
        and g.deleted_at is null
        and (g.status <> all (array['cancelled'::text, 'draft'::text, 'annullata'::text, 'bozza'::text]))
        and (g.document_type = 'credit_note') = (d.tipo = 'nota_credito')
   );

alter view public.v_cg_fatture_emesse set (security_invoker = on);
revoke all on public.v_cg_fatture_emesse from public, anon;
grant select on public.v_cg_fatture_emesse to authenticated, service_role;

comment on view public.v_cg_fatture_emesse is
  'Tutte le fatture emesse di un''azienda, importate e fatte in EiC, una riga per fattura. imponibile e residuo sono sempre positivi: il verso lo dà segno (09/11/2026).';

-- ── I ricavi ───────────────────────────────────────────────────────────────
create or replace view public.v_cg_ricavi_classificati as
select f.company_id,
       f.data,
       f.segno::numeric * f.imponibile as importo_imponibile,
       f.segno::numeric * f.iva as iva_amount,
       f.document_type as invoice_type,
       extract(year from f.data)::integer as anno,
       extract(month from f.data)::integer as mese,
       f.cliente_id,
       f.order_id,
       'invoice'::text as source
  from public.v_cg_fatture_emesse f;

alter view public.v_cg_ricavi_classificati set (security_invoker = on);

comment on view public.v_cg_ricavi_classificati is
  'Ricavi del Controllo di Gestione: fatture emesse importate e fatte in EiC, note di credito col segno meno (09/11/2026). Le commesse stanno in v_cg_portafoglio_commesse: sono portafoglio, non ricavo.';

-- ── Il lavoro in corso: il fatturato di ogni commessa ──────────────────────
create or replace view public.v_cg_lavori_in_corso as
select q.company_id,
       q.order_id,
       q.quote_number,
       q.client_name,
       q.status,
       q.base,
       q.valore_commessa,
       round(q.maturato, 2) as maturato,
       round(q.fatturato, 2) as fatturato,
       round(greatest(q.maturato - q.fatturato, 0), 2) as lavori_in_corso,
       -- Il contrario: fatturato più di quello che si è eseguito. È un acconto
       -- preso dal cliente, cioè un debito, non un ricavo.
       round(greatest(q.fatturato - q.maturato, 0), 2) as anticipi
  from (
    select o.company_id,
           o.id as order_id,
           o.quote_number,
           o.client_name,
           o.status,
           coalesce(o.total_amount, 0) as valore_commessa,
           case when fs.importi > 0 then 'fasi_importi' else 'fasi_percentuale' end as base,
           case when fs.importi > 0
                then fs.maturato_importi
                else coalesce(o.total_amount, 0) * fs.pct_media / 100.0
           end as maturato,
           coalesce(ft.imponibile, 0) as fatturato
      from orders o
      join (
        select f.order_id,
               sum(coalesce(f.importo_venduto, 0)) as importi,
               sum(coalesce(f.importo_venduto, 0)
                   * least(greatest(coalesce(f.percentuale, 0), 0), 100) / 100.0) as maturato_importi,
               avg(least(greatest(coalesce(f.percentuale, 0), 0), 100)) as pct_media,
               max(coalesce(f.percentuale, 0)) as pct_max
          from order_work_phases f
         group by f.order_id
      ) fs on fs.order_id = o.id
      left join (
        select e.order_id,
               sum(e.segno::numeric * e.imponibile) as imponibile
          from public.v_cg_fatture_emesse e
         where e.order_id is not null
         group by e.order_id
      ) ft on ft.order_id = o.id
     where o.deleted_at is null
       and coalesce(o.status, '') <> 'bozza'
       and coalesce(o.total_amount, 0) > 0
       -- Serve una base d'avanzamento: senza, non si inventa.
       and (fs.importi > 0 or fs.pct_max > 0)
  ) q;

alter view public.v_cg_lavori_in_corso set (security_invoker = on);

-- ── Le tre funzioni che leggevano `invoices` direttamente ──────────────────
-- Il testo vivo di queste funzioni è diverso dalle vecchie migrazioni: si
-- sostituisce solo il pezzo tra due punti fermi, e ci si ferma se non ci sono.
do $patch$
declare
  v_def text;
  v_ini integer;
  v_fin integer;
  v_inizio constant text := 'Una nota di credito abbassa il credito: non è un importo da incassare.';
  v_fine constant text := '-- Crediti tributari / anticipi a fornitori';
begin
  v_def := pg_get_functiondef('public.cg_get_stato_patrimoniale_riclassificato(uuid,integer,date)'::regprocedure);
  if position('v_cg_fatture_emesse' in v_def) > 0 then
    return;
  end if;
  v_ini := position(v_inizio in v_def);
  v_fin := position(v_fine in v_def);
  if v_ini = 0 or v_fin <= v_ini then
    raise exception 'Stato patrimoniale: il blocco dei crediti è cambiato, questa migrazione va rivista';
  end if;
  v_def := left(v_def, v_ini - 1 + length(v_inizio)) || $new$

  SELECT COALESCE(sum(f.segno * f.residuo), 0)
  INTO v_crediti_clienti
  FROM public.v_cg_fatture_emesse f
  WHERE f.company_id = v_company_id
    AND f.data <= v_rif;

  $new$ || substr(v_def, v_fin);
  execute v_def;
end;
$patch$;

do $patch$
declare
  v_def text;
  v_ini integer;
  v_fin integer;
  v_inizio constant text := 'SELECT count(*) INTO v_n_invoices FROM public.invoices';
  v_fine constant text := 'SELECT count(DISTINCT mese) INTO v_n_mesi_cedolini';
begin
  v_def := pg_get_functiondef('public.cg_get_health_check(uuid,integer)'::regprocedure);
  if position('v_cg_fatture_emesse' in v_def) > 0 then
    return;
  end if;
  v_ini := position(v_inizio in v_def);
  v_fin := position(v_fine in v_def);
  if v_ini = 0 or v_fin <= v_ini then
    raise exception 'Controllo dati: il conteggio delle fatture è cambiato, questa migrazione va rivista';
  end if;
  v_def := left(v_def, v_ini - 1) || $new$SELECT count(*) INTO v_n_invoices FROM public.v_cg_fatture_emesse
   WHERE company_id = v_company_id AND extract(year FROM data)::int = p_anno;

  $new$ || substr(v_def, v_fin);
  execute v_def;
end;
$patch$;

do $patch$
declare
  v_def text;
  v_ini integer;
  v_fin integer;
  v_inizio constant text := 'v_label := ''Ricavi delle vendite'';';
  v_fine constant text := '-- ── Costo personale (06)';
begin
  v_def := pg_get_functiondef('public.cg_get_dettaglio_voce_mese(uuid,integer,integer,text)'::regprocedure);
  if position('v_cg_fatture_emesse' in v_def) > 0 then
    return;
  end if;
  v_ini := position(v_inizio in v_def);
  v_fin := position(v_fine in v_def);
  if v_ini = 0 or v_fin <= v_ini then
    raise exception 'Dettaglio voce: il blocco dei ricavi è cambiato, questa migrazione va rivista';
  end if;
  v_def := left(v_def, v_ini - 1 + length(v_inizio)) || $new$

    -- `source_table` resta 'invoices' anche per le native: è l'etichetta
    -- «Fatture» che la pagina mostra, non il nome di una tabella da aprire.
    SELECT jsonb_agg(jsonb_build_object(
              'id', f.id, 'source_table', 'invoices', 'data', f.data,
              'descrizione', COALESCE(f.numero, f.id::text),
              'controparte', f.controparte,
              'voce_chiave', f.document_type, 'categoria', NULL,
              'importo', f.segno * f.imponibile
            ) ORDER BY f.data DESC),
           COALESCE(sum(f.segno * f.imponibile), 0)
    INTO v_righe, v_totale
    FROM public.v_cg_fatture_emesse f
    WHERE f.company_id = v_company_id
      AND extract(year FROM f.data)::int = p_anno
      AND (p_mese IS NULL OR extract(month FROM f.data)::int = p_mese);

    SELECT jsonb_agg(jsonb_build_object(
              'etichetta', etichetta, 'totale', tot, 'count', n
           ) ORDER BY tot DESC)
    INTO v_raggr
    FROM (
      SELECT COALESCE(f.controparte, '— senza cliente —') AS etichetta,
             sum(f.segno * f.imponibile) AS tot,
             count(*) AS n
      FROM public.v_cg_fatture_emesse f
      WHERE f.company_id = v_company_id
        AND extract(year FROM f.data)::int = p_anno
        AND (p_mese IS NULL OR extract(month FROM f.data)::int = p_mese)
      GROUP BY COALESCE(f.controparte, '— senza cliente —')
    ) r;

  $new$ || substr(v_def, v_fin);
  execute v_def;
end;
$patch$;
