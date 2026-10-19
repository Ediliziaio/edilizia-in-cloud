-- Filtri calcolati PRIMA di count/limit/offset, senza riscrivere gli stati
-- fiscali o i documenti emessi. La view usa i permessi/RLS del chiamante.
create or replace view public.documenti_fiscali_elenco
with (security_invoker = true)
as
select d.*,
  coalesce(nullif(btrim(d.cliente_snapshot->>'ragione_sociale'), ''),
    btrim(concat_ws(' ', nullif(btrim(d.cliente_snapshot->>'nome'), ''), nullif(btrim(d.cliente_snapshot->>'cognome'), '')))) as elenco_cliente,
  coalesce(
    d.deleted_at is null
    and d.stato not in ('bozza', 'annullata', 'stornata', 'pagata')
    and d.data_scadenza < (now() at time zone 'Europe/Rome')::date
    and round(coalesce(d.totale_da_pagare, 0) - coalesce(d.importo_pagato, 0), 2) > 0,
    false
  ) as elenco_scaduta,
  -- Stessa priorità di faseSdi: gli esiti definitivi prevalgono sull'id
  -- di trasmissione; una ricevuta MC non è una fattura ancora da inviare.
  case
    when d.tipo not in (
      'fattura', 'fattura_pa', 'nota_credito', 'nota_debito', 'autofattura',
      'fattura_riepilogativa', 'parcella', 'fattura_accompagnatoria',
      'integrazione_servizi_estero', 'integrazione_beni_ue', 'integrazione_beni_extra_ue',
      'acconto_fattura', 'acconto_parcella', 'reverse_charge_interno',
      'autofattura_splafonamento', 'fattura_differita_b', 'autoconsumo'
    ) or d.tipo is null or d.stato is null or d.stato in ('bozza', 'annullata') then null
    when d.stato = 'in_invio' then 'invio_in_corso'
    when d.trasmissione = 'manuale' or btrim(coalesce(d.sdi_id_trasmissione, '')) like 'MAN-%' then 'manuale'
    when upper(btrim(coalesce(d.sdi_stato, ''))) = 'NS' then 'scartata'
    when upper(btrim(coalesce(d.sdi_stato, ''))) in ('RC', 'MC') then 'inviata'
    when upper(btrim(coalesce(d.sdi_stato, ''))) in ('EC01', 'DT') then 'accettata'
    when upper(btrim(coalesce(d.sdi_stato, ''))) = 'EC02' then 'rifiutata_ente'
    when upper(btrim(coalesce(d.sdi_stato, ''))) = 'AT'
      or btrim(coalesce(d.sdi_id_trasmissione, '')) <> '' then 'in_elaborazione'
    else 'da_inviare'
  end as elenco_fase_sdi
from public.documenti_fiscali d;

-- Solo lettura, solo utenti già autorizzati sulla tabella sottostante.
revoke all on public.documenti_fiscali_elenco from public, anon, authenticated;
grant select on public.documenti_fiscali_elenco to authenticated;
comment on view public.documenti_fiscali_elenco is
  'Elenco documenti con scadenza italiana e fase SDI; security_invoker, nessuna modifica ai dati fiscali.';
notify pgrst, 'reload schema';
