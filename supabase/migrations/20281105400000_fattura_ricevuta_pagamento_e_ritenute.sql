-- Fattura ricevuta: piano di pagamento, ritenuta d'acconto, cassa, bollo e trattenuta a garanzia, letti
-- all'ARRIVO e salvati sulla fattura (lotto 1 di docs/piano-costi-commessa.md, 01/11/2026).
--
-- Prima: la fattura ricevuta non aveva nessuna colonna per il pagamento. Rate e RiBa si ricavavano
-- dall'XML solo alla contabilizzazione (Bonarrigo: 20 RiBa nell'XML, 0 in cassa); la ritenuta d'acconto
-- dei professionisti non la leggeva nessuno (se l'XML non diceva l'importo della rata si pagava il lordo);
-- la trattenuta a garanzia di un subappaltatore spariva nell'imponibile.
--
-- Ora, per ogni fattura con XML (SDI, OpenAPI, ITALA, caricata a mano: un trigger solo, nessun canale
-- escluso):
--   piano_pagamento      [{scadenza, importo, modalita, iban}] tutte le rate (DettaglioPagamento)
--   condizioni_pagamento TP01 a rate, TP02 completo, TP03 anticipo
--   ritenuta_*           DatiRitenuta (anche più blocchi: si sommano gli importi)
--   cassa_previdenziale  ImportoContributoCassa
--   bollo_importo        ImportoBollo
--   trattenuta_garanzia  le righe negative che parlano di garanzia (valore assoluto)
--   netto_a_pagare       quanto si paga al fornitore: la somma delle rate se l'XML le dice, altrimenti
--                        totale documento meno ritenuta d'acconto
-- Fatture in Cloud (senza XML) li scrive dall'import (billing-import), il trigger non li tocca.
--
-- Le rate: crea_rate_fornitore usa il piano salvato quando l'XML non c'è (Fatture in Cloud), e per la
-- rata unica senza importo usa il netto a pagare, non il totale lordo. Le autofatture (TD16-19 e le
-- «self_invoice» di Fatture in Cloud) non sono debiti verso il fornitore: niente rate. TD08 è una nota
-- di credito come TD04.
--
-- Il controllo fiscale (fiscalita_guard) non scatta: si scrivono solo colonne nuove.

set local lock_timeout = '3s';
set local statement_timeout = '120s';

alter table public.fatture_ricevute
  add column if not exists piano_pagamento jsonb,
  add column if not exists condizioni_pagamento text,
  add column if not exists ritenuta_tipo text,
  add column if not exists ritenuta_aliquota numeric(6,3),
  add column if not exists ritenuta_importo numeric(14,2),
  add column if not exists ritenuta_causale text,
  add column if not exists cassa_previdenziale numeric(14,2),
  add column if not exists bollo_importo numeric(14,2),
  add column if not exists trattenuta_garanzia numeric(14,2),
  add column if not exists netto_a_pagare numeric(14,2);

comment on column public.fatture_ricevute.piano_pagamento is 'Rate dalla fattura: [{scadenza, importo, modalita (MPxx), iban}]. Dall''XML (trigger) o da Fatture in Cloud (import).';
comment on column public.fatture_ricevute.ritenuta_importo is 'Ritenuta d''acconto trattenuta al fornitore (DatiRitenuta): si versa con F24 il 16 del mese dopo il pagamento.';
comment on column public.fatture_ricevute.trattenuta_garanzia is 'Trattenuta a garanzia scritta in fattura come riga negativa: debito da pagare allo svincolo.';
comment on column public.fatture_ricevute.netto_a_pagare is 'Quanto si paga al fornitore: somma delle rate, o totale documento meno ritenuta d''acconto.';

-- Note di credito e autofatture, in un posto solo.
create or replace function public.e_nota_credito_ricevuta(p_tipo text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_tipo, '') in ('TD04', 'TD08', 'passive_credit_note')
$$;
create or replace function public.e_autofattura_ricevuta(p_tipo text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_tipo, '') in ('TD16', 'TD17', 'TD18', 'TD19', 'TD20', 'TD21', 'TD27', 'TD28', 'self_invoice')
$$;
revoke all on function public.e_nota_credito_ricevuta(text) from public, anon;
revoke all on function public.e_autofattura_ricevuta(text) from public, anon;
grant execute on function public.e_nota_credito_ricevuta(text) to authenticated, service_role;
grant execute on function public.e_autofattura_ricevuta(text) to authenticated, service_role;

-- Tutto quello che serve al pagamento, da un corpo dell'XML.
create or replace function public.dati_pagamento_fattura_xml(p_xml text, p_indice_corpo integer default 0)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_testo text;
  v_doc   xml;
  v_corpo xml;
  v_rit   xml;
  v_riga  xml;
  v_rit_importo numeric := 0;
  v_rit_tipo text; v_rit_aliq text; v_rit_caus text;
  v_cassa numeric := 0;
  v_bollo numeric;
  v_garanzia numeric := 0;
  v_num text; v_desc text;
  v_rate jsonb;
  v_progressivo boolean := false;
begin
  if p_xml is null or btrim(p_xml) = '' then return null; end if;
  v_testo := regexp_replace(p_xml, '^﻿', '');
  v_testo := regexp_replace(v_testo, '^\s*<\?xml[^>]*\?>', '');
  begin
    v_doc := xmlparse(document v_testo);
  exception when others then
    return null;
  end;
  v_corpo := (xpath('(//*[local-name()="FatturaElettronicaBody"])[' || (coalesce(p_indice_corpo, 0) + 1) || ']', v_doc))[1];
  if v_corpo is null then return null; end if;

  v_rate := public.rate_pagamento_da_xml(p_xml, p_indice_corpo);

  for v_rit in select unnest(xpath('//*[local-name()="DatiGeneraliDocumento"]/*[local-name()="DatiRitenuta"]', v_corpo)) loop
    v_num := nullif(btrim((xpath('string(/*/*[local-name()="ImportoRitenuta"])', v_rit))[1]::text), '');
    if v_num ~ '^-?\d+(\.\d+)?$' then v_rit_importo := v_rit_importo + v_num::numeric; end if;
    v_rit_tipo := coalesce(v_rit_tipo, nullif(btrim((xpath('string(/*/*[local-name()="TipoRitenuta"])', v_rit))[1]::text), ''));
    v_rit_aliq := coalesce(v_rit_aliq, nullif(btrim((xpath('string(/*/*[local-name()="AliquotaRitenuta"])', v_rit))[1]::text), ''));
    v_rit_caus := coalesce(v_rit_caus, nullif(btrim((xpath('string(/*/*[local-name()="CausalePagamento"])', v_rit))[1]::text), ''));
  end loop;

  for v_riga in select unnest(xpath('//*[local-name()="DatiGeneraliDocumento"]/*[local-name()="DatiCassaPrevidenziale"]', v_corpo)) loop
    v_num := nullif(btrim((xpath('string(/*/*[local-name()="ImportoContributoCassa"])', v_riga))[1]::text), '');
    if v_num ~ '^-?\d+(\.\d+)?$' then v_cassa := v_cassa + v_num::numeric; end if;
  end loop;

  v_num := nullif(btrim((xpath('string(//*[local-name()="DatiGeneraliDocumento"]/*[local-name()="DatiBollo"]/*[local-name()="ImportoBollo"])', v_corpo))[1]::text), '');
  if v_num ~ '^\d+(\.\d+)?$' then v_bollo := v_num::numeric; end if;

  -- Trattenuta a garanzia: righe negative che lo dicono nella descrizione. In un SAL progressivo («a
  -- dedurre certificati precedenti») la trattenuta scritta è quella di tutto il cantiere fino a oggi, non
  -- di questa fattura: non si attribuisce (visto il 01/11/2026: 39.964 € di garanzia su 10.041 €).
  for v_riga in select unnest(xpath('//*[local-name()="DettaglioLinee"]', v_corpo)) loop
    v_desc := (xpath('string(/*/*[local-name()="Descrizione"])', v_riga))[1]::text;
    v_num := nullif(btrim((xpath('string(/*/*[local-name()="PrezzoTotale"])', v_riga))[1]::text), '');
    if v_num ~ '^-\d+(\.\d+)?$' and v_desc ~* 'precedent' then v_progressivo := true; end if;
    if v_num ~ '^-\d+(\.\d+)?$' and v_desc ~* '(garanzi|ritenuta\s+(a|di)\s+garan|trattenut)' then
      v_garanzia := v_garanzia + abs(v_num::numeric);
    end if;
  end loop;
  if v_progressivo then v_garanzia := 0; end if;

  return jsonb_build_object(
    'rate', coalesce(v_rate, '[]'::jsonb),
    'condizioni', (select r->>'condizioni' from jsonb_array_elements(coalesce(v_rate, '[]'::jsonb)) r limit 1),
    'ritenuta_importo', nullif(round(v_rit_importo, 2), 0),
    'ritenuta_tipo', v_rit_tipo,
    'ritenuta_aliquota', case when v_rit_aliq ~ '^\d+(\.\d+)?$' then v_rit_aliq::numeric end,
    'ritenuta_causale', v_rit_caus,
    'cassa', nullif(round(v_cassa, 2), 0),
    'bollo', v_bollo,
    'garanzia', nullif(round(v_garanzia, 2), 0)
  );
end $$;
revoke all on function public.dati_pagamento_fattura_xml(text, integer) from public, anon;
grant execute on function public.dati_pagamento_fattura_xml(text, integer) to authenticated, service_role;

-- Il trigger: all'arrivo e quando cambia l'XML legge i dati; il netto si rifà quando cambiano rate,
-- ritenuta o totale.
create or replace function public.fattura_ricevuta_dati_pagamento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  d jsonb;
  v_somma numeric;
begin
  if new.xml_raw is not null and length(new.xml_raw) > 100
     and (tg_op = 'INSERT' or new.xml_raw is distinct from old.xml_raw or new.indice_corpo is distinct from old.indice_corpo
          or new.piano_pagamento is null) then
    d := public.dati_pagamento_fattura_xml(new.xml_raw, new.indice_corpo);
    if d is not null then
      new.piano_pagamento := nullif(
        (select coalesce(jsonb_agg(r - 'condizioni'), '[]'::jsonb) from jsonb_array_elements(d->'rate') r), '[]'::jsonb);
      new.condizioni_pagamento := d->>'condizioni';
      new.ritenuta_importo := (d->>'ritenuta_importo')::numeric;
      new.ritenuta_tipo := d->>'ritenuta_tipo';
      new.ritenuta_aliquota := (d->>'ritenuta_aliquota')::numeric;
      new.ritenuta_causale := d->>'ritenuta_causale';
      new.cassa_previdenziale := (d->>'cassa')::numeric;
      new.bollo_importo := (d->>'bollo')::numeric;
      new.trattenuta_garanzia := (d->>'garanzia')::numeric;
    end if;
  end if;

  select sum((r->>'importo')::numeric) into v_somma
    from jsonb_array_elements(coalesce(new.piano_pagamento, '[]'::jsonb)) r
   where (r->>'importo') ~ '^-?\d+(\.\d+)?$';
  new.netto_a_pagare := round(coalesce(v_somma, new.totale_documento - coalesce(new.ritenuta_importo, 0)), 2);
  return new;
end $$;
revoke all on function public.fattura_ricevuta_dati_pagamento() from public, anon, authenticated;

drop trigger if exists trg_fattura_ricevuta_dati_pagamento on public.fatture_ricevute;
create trigger trg_fattura_ricevuta_dati_pagamento
  before insert or update of xml_raw, indice_corpo, piano_pagamento, ritenuta_importo, totale_documento
  on public.fatture_ricevute
  for each row execute function public.fattura_ricevuta_dati_pagamento();

-- Le rate: dal piano salvato (anche Fatture in Cloud), netto e niente autofatture.
create or replace function public.crea_rate_fornitore(p_cost uuid, p_fattura uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  c        public.company_costs%rowtype;
  f        public.fatture_ricevute%rowtype;
  v_rate   jsonb := '[]'::jsonb;
  v_r      record;
  v_creati integer := 0;
  v_pagata boolean;
begin
  select * into c from public.company_costs where id = p_cost;
  if not found then return 0; end if;
  if p_fattura is not null then
    select * into f from public.fatture_ricevute where id = p_fattura;
    if not found then return 0; end if;
    -- Note di credito e autofatture non sono debiti verso il fornitore.
    if public.e_nota_credito_ricevuta(f.tipo_documento) or public.e_autofattura_ricevuta(f.tipo_documento) then
      return 0;
    end if;
  end if;

  if exists (
    select 1 from public.rate_fornitori r
     where r.company_cost_id = p_cost
       and r.fattura_ricevuta_id is not distinct from p_fattura
  ) then
    return 0;
  end if;

  v_pagata := coalesce(c.is_paid, false);

  if p_fattura is not null then
    if f.xml_raw is not null then
      v_rate := public.rate_pagamento_da_xml(f.xml_raw, f.indice_corpo);
    end if;
    -- Senza XML (Fatture in Cloud): il piano salvato dall'import.
    if jsonb_array_length(v_rate) = 0 and jsonb_typeof(f.piano_pagamento) = 'array' then
      v_rate := f.piano_pagamento;
    end if;
  end if;

  if jsonb_array_length(v_rate) > 0 then
    for v_r in
      select e, ordinale::int as n
        from jsonb_array_elements(v_rate) with ordinality as x(e, ordinale)
    loop
      insert into public.rate_fornitori
        (company_id, company_cost_id, fattura_ricevuta_id, numero, scadenza, importo,
         metodo, iban, stato, pagata_il, origine)
      values
        (c.company_id, p_cost, p_fattura, v_r.n,
         (v_r.e->>'scadenza')::date,
         -- Rata unica senza importo: il netto a pagare (totale meno ritenuta), non il lordo.
         coalesce((v_r.e->>'importo')::numeric,
                  case when jsonb_array_length(v_rate) = 1 then coalesce(f.netto_a_pagare, f.totale_documento) end),
         coalesce(public.metodo_da_codice_mp(v_r.e->>'modalita'), c.payment_method),
         v_r.e->>'iban',
         case when v_pagata then 'pagata' else 'da_pagare' end,
         case when v_pagata then c.paid_date end,
         case when f.xml_raw is not null then 'xml' else 'fattura' end);
      v_creati := v_creati + 1;
    end loop;
  else
    insert into public.rate_fornitori
      (company_id, company_cost_id, fattura_ricevuta_id, numero, scadenza, importo,
       metodo, stato, pagata_il, origine)
    values
      (c.company_id, p_cost, p_fattura, 1,
       nullif(c.due_date, date '9999-12-31'),
       coalesce(case when p_fattura is not null then coalesce(f.netto_a_pagare, f.totale_documento) end,
                round(c.amount * (1 + coalesce(c.vat_rate, 0) / 100.0), 2)),
       c.payment_method,
       case when v_pagata then 'pagata' else 'da_pagare' end,
       case when v_pagata then c.paid_date end,
       case when p_fattura is not null then 'fattura' else 'costo' end);
    v_creati := 1;
  end if;

  return v_creati;
end
$function$;

-- Le fatture già arrivate con l'XML: si leggono una volta, scrivendo solo le colonne nuove e a trigger
-- spenti (session_replication_role col comando SET: niente registro azioni, niente ricalcoli altrui).
-- Quelle senza XML (Fatture in Cloud) restano col netto vuoto: chi legge usa il totale; le riempie il
-- prossimo import.
set local session_replication_role = replica;
update public.fatture_ricevute f
   set piano_pagamento = nullif((select coalesce(jsonb_agg(r - 'condizioni'), '[]'::jsonb)
                                   from jsonb_array_elements(x.d->'rate') r), '[]'::jsonb),
       condizioni_pagamento = x.d->>'condizioni',
       ritenuta_importo = (x.d->>'ritenuta_importo')::numeric,
       ritenuta_tipo = x.d->>'ritenuta_tipo',
       ritenuta_aliquota = (x.d->>'ritenuta_aliquota')::numeric,
       ritenuta_causale = x.d->>'ritenuta_causale',
       cassa_previdenziale = (x.d->>'cassa')::numeric,
       bollo_importo = (x.d->>'bollo')::numeric,
       trattenuta_garanzia = (x.d->>'garanzia')::numeric
  from (select id, public.dati_pagamento_fattura_xml(xml_raw, indice_corpo) d
          from public.fatture_ricevute
         where xml_raw is not null and length(xml_raw) > 100) x
 where f.id = x.id and x.d is not null;
update public.fatture_ricevute f
   set netto_a_pagare = round(coalesce(
         (select sum((r->>'importo')::numeric) from jsonb_array_elements(coalesce(f.piano_pagamento, '[]'::jsonb)) r
           where (r->>'importo') ~ '^-?\d+(\.\d+)?$'),
         f.totale_documento - coalesce(f.ritenuta_importo, 0)), 2)
 where f.xml_raw is not null and length(f.xml_raw) > 100;
set local session_replication_role = origin;
