-- ════════════════════════════════════════════════════════════════════════════
-- Ondata 0.3 — verifica della liquidazione IVA su un trimestre calcolato a mano
-- ════════════════════════════════════════════════════════════════════════════
-- Esegui come service_role / postgres (SQL Editor o MCP execute_sql).
--
-- Il test costruisce un trimestre con importi scelti a mano, chiede la
-- liquidazione, e confronta al centesimo. Se un solo numero non torna solleva
-- un'eccezione con l'atteso e l'ottenuto. Tutto dentro una transazione che
-- termina con ROLLBACK: passa in silenzio e non lascia una riga in produzione.
--
--   VENDITE                                       imponibile      IVA
--     F1   fattura           22%                    10.000,00   2.200,00
--     F2   fattura           10%                     5.000,00     500,00
--     NC1  nota di credito   22%   (in diminuzione)  1.000,00  -  220,00
--     F3   fattura  split payment 22%                2.000,00  (esclusa: 440,00)
--     BOZZA                                         99.000,00  (non conta)
--     F-T2 fattura di aprile                         7.000,00  (fuori periodo)
--                                              IVA a debito =  2.480,00
--   ACQUISTI
--     A1   TD01              22%                     3.000,00     660,00
--     A2   TD01               4%                     1.000,00      40,00
--     NCA1 TD04              22%   (in diminuzione)    500,00  -  110,00
--                                          IVA detraibile =      590,00
--                                                   SALDO =    1.890,00 a debito
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Il controllo di accesso della RPC è reale: serve un'identità che appartenga
-- davvero all'azienda. profiles.id ha una FK su auth.users, quindi non si può
-- inventare un utente — si usa un utente vero, e si isola il caso in un anno
-- lontano invece che in un'azienda finta.
--
-- Sostituisci i due UUID qui sotto con un utente del tuo ambiente e la sua
-- azienda (qui: l'utente demo e Demo Azienda S.r.l.).
--   utente  = 0a5dd3d4-05fe-4caa-b393-2b29f804cb1a
--   azienda = 778a2c76-1253-49f2-a5e8-283363ac3e29
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '0a5dd3d4-05fe-4caa-b393-2b29f804cb1a',
                    'role', 'authenticated')::text,
  true);

-- L'anno 2089 non contiene dati reali: tutto ciò che la liquidazione vede qui
-- sotto è stato messo da questo test.
DO $guardia$
BEGIN
  IF EXISTS (SELECT 1 FROM public.documenti_fiscali
             WHERE company_id = '778a2c76-1253-49f2-a5e8-283363ac3e29'::uuid AND anno = 2089)
     OR EXISTS (SELECT 1 FROM public.fatture_ricevute
                WHERE company_id = '778a2c76-1253-49f2-a5e8-283363ac3e29'::uuid
                  AND data_fattura BETWEEN '2089-01-01' AND '2089-12-31') THEN
    RAISE EXCEPTION 'l''anno 2089 non è vuoto: il test misurerebbe anche dati altrui';
  END IF;
END $guardia$;

INSERT INTO public.documenti_fiscali (company_id, tipo, numero, numero_progressivo, anno, stato,
  data_emissione, imponibile_totale, iva_totale, totale_documento, totale_da_pagare,
  esigibilita_iva, riepilogo_iva)
VALUES
 ('778a2c76-1253-49f2-a5e8-283363ac3e29','fattura','V/1',1,2089,'emessa','2089-01-15',10000,2200,12200,12200,'I',
   '[{"aliquota":"22","imponibile":10000,"imposta":2200,"esigibilita":"I"}]'),
 ('778a2c76-1253-49f2-a5e8-283363ac3e29','fattura','V/2',2,2089,'consegnata','2089-02-10',5000,500,5500,5500,'I',
   '[{"aliquota":"10","imponibile":5000,"imposta":500,"esigibilita":"I"}]'),
 ('778a2c76-1253-49f2-a5e8-283363ac3e29','nota_credito','V/NC1',3,2089,'emessa','2089-03-01',1000,220,1220,1220,'I',
   '[{"aliquota":"22","imponibile":1000,"imposta":220,"esigibilita":"I"}]'),
 ('778a2c76-1253-49f2-a5e8-283363ac3e29','fattura','V/3',4,2089,'emessa','2089-03-20',2000,440,2440,2440,'S',
   '[{"aliquota":"22","imponibile":2000,"imposta":440,"esigibilita":"S"}]'),
 ('778a2c76-1253-49f2-a5e8-283363ac3e29','fattura','V/BOZZA',5,2089,'bozza','2089-02-02',99000,21780,120780,120780,'I',
   '[{"aliquota":"22","imponibile":99000,"imposta":21780,"esigibilita":"I"}]'),
 ('778a2c76-1253-49f2-a5e8-283363ac3e29','fattura','V/T2',6,2089,'emessa','2089-04-05',7000,1540,8540,8540,'I',
   '[{"aliquota":"22","imponibile":7000,"imposta":1540,"esigibilita":"I"}]');

INSERT INTO public.fatture_ricevute (company_id, cedente_piva, cedente_ragione_sociale,
  tipo_documento, numero_fattura, data_fattura, imponibile_totale, iva_totale,
  totale_documento, stato, riepilogo_iva)
VALUES
 ('778a2c76-1253-49f2-a5e8-283363ac3e29','01234567890','ZZ Fornitore','TD01','A1','2089-01-20',3000,660,3660,'letta',
   '[{"aliquota":"22","imponibile":3000,"imposta":660}]'),
 ('778a2c76-1253-49f2-a5e8-283363ac3e29','01234567890','ZZ Fornitore','TD01','A2','2089-02-14',1000,40,1040,'contabilizzata',
   '[{"aliquota":"4","imponibile":1000,"imposta":40}]'),
 ('778a2c76-1253-49f2-a5e8-283363ac3e29','01234567890','ZZ Fornitore','TD04','NC-A1','2089-03-05',500,110,610,'letta',
   '[{"aliquota":"22","imponibile":500,"imposta":110}]');

DO $$
DECLARE
  c   uuid := '778a2c76-1253-49f2-a5e8-283363ac3e29';
  r   jsonb;
  err text[] := '{}';
  ok  text[] := '{}';

BEGIN
  -- ── 1. Il trimestre calcolato a mano, al centesimo ────────────────────────
  r := public.liquidazione_iva_periodo(c, 'trimestrale', 2089, NULL, 1);

  IF (r ->> 'iva_vendite')::numeric <> 2480.00 THEN
    err := err || format('IVA a debito: atteso 2480.00, ottenuto %s', r ->> 'iva_vendite');
  ELSE ok := ok || 'IVA a debito 2.480,00'::text; END IF;

  IF (r ->> 'iva_acquisti')::numeric <> 590.00 THEN
    err := err || format('IVA detraibile: atteso 590.00, ottenuto %s', r ->> 'iva_acquisti');
  ELSE ok := ok || 'IVA detraibile 590,00'::text; END IF;

  IF (r ->> 'saldo')::numeric <> 1890.00 THEN
    err := err || format('saldo: atteso 1890.00, ottenuto %s', r ->> 'saldo');
  ELSE ok := ok || 'saldo 1.890,00 a debito'::text; END IF;

  IF (r ->> 'imponibile_vendite')::numeric <> 14000.00 THEN
    err := err || format('imponibile vendite: atteso 14000.00, ottenuto %s', r ->> 'imponibile_vendite');
  ELSE ok := ok || 'imponibile vendite 14.000,00'::text; END IF;

  -- ── 2. Quello che NON deve entrare ────────────────────────────────────────
  IF (r -> 'escluso' ->> 'split_payment')::numeric <> 440.00 THEN
    err := err || format('split payment escluso: atteso 440.00, ottenuto %s', r -> 'escluso' ->> 'split_payment');
  ELSE ok := ok || 'split payment 440,00 escluso dal debito'::text; END IF;

  IF (r -> 'documenti' ->> 'vendite')::int <> 4 THEN
    err := err || format('documenti vendite: attesi 4 (bozza e aprile fuori), ottenuti %s', r -> 'documenti' ->> 'vendite');
  ELSE ok := ok || 'bozza e documento di aprile esclusi'::text; END IF;

  IF r ->> 'calcolabile' <> 'true' THEN
    err := err || 'il trimestre con documenti risulta non calcolabile'::text;
  ELSE ok := ok || 'calcolabile: true'::text; END IF;

  -- ── 3. Un trimestre senza documenti si dichiara, non risponde zero ────────
  r := public.liquidazione_iva_periodo(c, 'trimestrale', 2089, NULL, 3);
  IF r ->> 'calcolabile' <> 'false' THEN
    err := err || 'trimestre vuoto: dovrebbe dichiararsi non calcolabile'::text;
  ELSIF coalesce(r ->> 'motivo', '') = '' THEN
    err := err || 'trimestre vuoto: manca il motivo'::text;
  ELSE ok := ok || 'trimestre vuoto: rifiuto dichiarato con motivo'::text; END IF;

  -- ── 4. Il mese si comporta come il trimestre ──────────────────────────────
  r := public.liquidazione_iva_periodo(c, 'mensile', 2089, 1, NULL);
  IF (r ->> 'iva_vendite')::numeric <> 2200.00 OR (r ->> 'iva_acquisti')::numeric <> 660.00 THEN
    err := err || format('gennaio 2089: attesi 2200.00 / 660.00, ottenuti %s / %s',
                         r ->> 'iva_vendite', r ->> 'iva_acquisti');
  ELSE ok := ok || 'gennaio 2089: 2.200,00 / 660,00'::text; END IF;

  -- ── 5. Parametri fuori range: errore, non un numero ───────────────────────
  BEGIN
    r := public.liquidazione_iva_periodo(c, 'trimestrale', 2089, NULL, 9);
    err := err || 'trimestre 9 accettato invece di essere rifiutato'::text;
  EXCEPTION WHEN OTHERS THEN ok := ok || 'trimestre fuori range rifiutato'::text; END;

  -- ── 6. Un'altra azienda non si legge ──────────────────────────────────────
  BEGIN
    r := public.liquidazione_iva_periodo(
           '00000000-0000-0000-0000-000000000001', 'trimestrale', 2089, NULL, 1);
    err := err || 'liquidazione di un altro tenant restituita'::text;
  EXCEPTION WHEN OTHERS THEN ok := ok || 'altro tenant: accesso negato'::text; END;

  IF cardinality(err) > 0 THEN
    RAISE EXCEPTION E'LIQUIDAZIONE IVA — VERIFICA FALLITA:\n  %', array_to_string(err, E'\n  ');
  END IF;

  CREATE TEMP TABLE esito_iva ON COMMIT DROP AS SELECT unnest(ok) AS verifica_superata;
END $$;

-- L'elenco di ciò che è stato verificato. Se una sola asserzione fallisce non
-- si arriva qui: il blocco sopra solleva un'eccezione con l'atteso e l'ottenuto.
SELECT verifica_superata FROM esito_iva;

-- Niente resta in produzione: il test è una domanda, non una scrittura.
ROLLBACK;
