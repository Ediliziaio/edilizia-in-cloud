-- 20290322130000_piano_ricavi_documenti_fiscali.sql
--
-- Il piano reale della commessa generale (generale_piano_righe_reali) prendeva i ricavi solo da
-- `invoices` e dai rogiti delle unità. Le fatture fatte nel modulo fiscale (`documenti_fiscali`)
-- contavano già nel «fatturato» della Panoramica (generale_fatture_nette) ma non nel piano, né
-- nel margine reale né nel grafico «Previsto contro reale» (14/11/2026).
--
-- Ora entrano anche loro, al netto dell'IVA, le note di credito col segno meno; una fattura
-- presente in tutti e due i posti (stessa commessa, stesso giorno, stesso totale) conta una volta
-- sola, come in generale_fatture_nette. Un'unità con una fattura fiscale non conta più il rogito.

do $migrazione$
declare
  definizione text := pg_get_functiondef('public.generale_piano_righe_reali(uuid,boolean,boolean)'::regprocedure);
  ancora constant text := '    union all
    -- Unità rogitate (modulo Unità, 20281031120000): il prezzo di rogito è il ricavo.';
  nuovo constant text := '    union all
    -- Fatture del modulo fiscale (20290322130000): nette, note di credito col meno; se la stessa
    -- fattura c''è anche in invoices (stessa commessa, giorno e totale) conta quella di invoices.
    select ''documento_fiscale'', d.id, d.ordine_id, d.data_emissione,
           ''ricavi'', null::text,
           concat_ws('' · '', case when d.tipo = ''nota_credito'' then ''Nota di credito '' else ''Fattura '' end || coalesce(d.numero, ''''),
                     nullif(btrim(coalesce(d.cliente_snapshot->>''ragione_sociale'', d.cliente_snapshot->>''nome'', '''')), '''')),
           case when d.tipo = ''nota_credito'' then -1 else 1 end * coalesce(d.imponibile_totale, d.totale_documento, 0)
      from public.documenti_fiscali d
      join s on s.id = d.ordine_id and s.company_id = d.company_id
     where p_ricavi
       and d.deleted_at is null
       and d.tipo in (''fattura'', ''fattura_pa'', ''nota_credito'')
       and coalesce(d.stato, '''') not in (''bozza'', ''annullata'', ''rifiutata'')
       and not exists (select 1 from public.invoices i4
                        where i4.order_id = d.ordine_id and i4.deleted_at is null
                          and i4.issue_date = d.data_emissione
                          and abs(coalesce(i4.total, 0) - coalesce(d.totale_documento, 0)) < 0.01
                          and i4.document_type in (''invoice'', ''fattura'', ''fattura_accompagnatoria'', ''parcella'')
                          and i4.status not in (''cancelled'', ''canceled'', ''annullata'', ''credited''))
    union all
    -- Unità rogitate (modulo Unità, 20281031120000): il prezzo di rogito è il ricavo.';
  rogito_vecchio constant text := '                          and i2.status not in (''cancelled'', ''canceled'', ''annullata'', ''credited''))
  )';
  rogito_nuovo constant text := '                          and i2.status not in (''cancelled'', ''canceled'', ''annullata'', ''credited''))
       and not exists (select 1 from public.documenti_fiscali d2
                        where d2.ordine_id = u.order_id and d2.deleted_at is null
                          and d2.tipo in (''fattura'', ''fattura_pa'')
                          and coalesce(d2.stato, '''') not in (''bozza'', ''annullata'', ''rifiutata''))
  )';
begin
  if position('documento_fiscale' in definizione) > 0 then
    return; -- già fatto
  end if;
  if position(ancora in definizione) = 0 or position(rogito_vecchio in definizione) = 0 then
    raise exception 'generale_piano_righe_reali: non trovo i punti da cambiare';
  end if;
  execute replace(replace(definizione, ancora, nuovo), rogito_vecchio, rogito_nuovo);
end
$migrazione$;
