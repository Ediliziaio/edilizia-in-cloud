-- Console clienti marketing — il motore (manuale operativo v1.0 dell'11/09/2026).
--
-- Il manuale trasforma il giudizio da ads manager in regole applicate ogni
-- giorno. Qui ci sono, in questo ordine:
--   1. l'anagrafica del cliente marketing (settore, classe, budget, orari, chi
--      richiama) come colonne aggiuntive di aedix_service_clients;
--   2. i benchmark per settore (Parte 4.2) con la stagionalità del CPL: nei
--      mesi di carenza di richieste il costo per lead sale, e il target segue;
--   3. le soglie per cliente (Allegato A), storicizzate: il titolare le mette
--      a mano, il sistema le allinea allo storico dal giorno 91 (Parte 18) e
--      le adatta al mese;
--   4. la spesa giornaliera per canale (dalla sincronizzazione Meta e dai
--      costi a mano);
--   5. le metriche del giorno (Parte 2-3: finestre 7/14/30 giorni, spesa
--      senza lead, semaforo a sei componenti, Indice di Esecuzione);
--   6. le regole «se… allora…» (Parte 8) con gli allarmi: una regola aperta
--      per volta per cliente, isteresi, silenzio dopo la chiusura, tetto di
--      cinque al giorno, filtri di leggibilità (Parte 5);
--   7. i dati del rapporto del mattino (Parte 12) in un JSON solo;
--   8. i cron: metriche alle 05:30, regole ogni due ore, rapporto alle 06:00
--      ora di Roma (due job UTC, la funzione tiene quello giusto), ritaratura
--      il lunedì.
-- Le regole che chiedono dati che il CRM non ha ancora (motivi di scarto,
-- presenza agli appuntamenti, moduli nuovi) restano in tabella con
-- implementata = false: si accendono quando arriva il dato.

-- ---------------------------------------------------------------------------
-- 1. Anagrafica del cliente marketing
-- ---------------------------------------------------------------------------
ALTER TABLE public.aedix_service_clients
  ADD COLUMN IF NOT EXISTS mkt_settore text,
  ADD COLUMN IF NOT EXISTS mkt_classe char(1),
  ADD COLUMN IF NOT EXISTS mkt_budget_mensile numeric(12,2),
  ADD COLUMN IF NOT EXISTS mkt_ticket_medio numeric(12,2),
  ADD COLUMN IF NOT EXISTS mkt_chi_richiama text,
  ADD COLUMN IF NOT EXISTS mkt_orario_servizio jsonb NOT NULL DEFAULT '{"lun_ven":["08:30","19:00"],"sab":["09:00","13:00"],"dom":null}'::jsonb,
  ADD COLUMN IF NOT EXISTS mkt_pausa_fino_a date,
  ADD COLUMN IF NOT EXISTS mkt_perimetro_provvigione text NOT NULL DEFAULT 'totale',
  ADD COLUMN IF NOT EXISTS mkt_scaglioni_annui boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mkt_deroga_budget text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aedix_service_clients_mkt_settore_check') THEN
    ALTER TABLE public.aedix_service_clients ADD CONSTRAINT aedix_service_clients_mkt_settore_check
      CHECK (mkt_settore IS NULL OR mkt_settore IN ('serramenti','fotovoltaico','bagni','ristrutturazioni','facciate','clima','altro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aedix_service_clients_mkt_classe_check') THEN
    ALTER TABLE public.aedix_service_clients ADD CONSTRAINT aedix_service_clients_mkt_classe_check
      CHECK (mkt_classe IS NULL OR mkt_classe IN ('A','B','C'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aedix_service_clients_mkt_chi_richiama_check') THEN
    ALTER TABLE public.aedix_service_clients ADD CONSTRAINT aedix_service_clients_mkt_chi_richiama_check
      CHECK (mkt_chi_richiama IS NULL OR mkt_chi_richiama IN ('cliente','call_center','voce_ai','noi'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aedix_service_clients_mkt_perimetro_check') THEN
    ALTER TABLE public.aedix_service_clients ADD CONSTRAINT aedix_service_clients_mkt_perimetro_check
      CHECK (mkt_perimetro_provvigione IN ('attribuito','totale'));
  END IF;
END $$;

COMMENT ON COLUMN public.aedix_service_clients.mkt_settore IS 'Settore del cliente marketing: sceglie i benchmark e la stagionalità del CPL.';
COMMENT ON COLUMN public.aedix_service_clients.mkt_budget_mensile IS 'Budget pubblicitario mensile concordato: base per lead attesi, copertura e sotto-consegna.';
COMMENT ON COLUMN public.aedix_service_clients.mkt_orario_servizio IS 'Orario di servizio del cliente: il cronometro del primo contatto conta solo queste ore.';

-- ---------------------------------------------------------------------------
-- 2. Benchmark per settore e stagionalità (Parte 4.2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mkt_settori_benchmark (
  settore text PRIMARY KEY,
  etichetta text NOT NULL,
  cpl_min numeric(10,2) NOT NULL, cpl_max numeric(10,2) NOT NULL,
  validita_min numeric(5,4) NOT NULL, validita_max numeric(5,4) NOT NULL,
  appuntamento_min numeric(5,4) NOT NULL, appuntamento_max numeric(5,4) NOT NULL,
  costo_appuntamento_min numeric(10,2) NOT NULL, costo_appuntamento_max numeric(10,2) NOT NULL,
  chiusura_min numeric(5,4) NOT NULL, chiusura_max numeric(5,4) NOT NULL,
  ticket_min numeric(12,2) NOT NULL, ticket_max numeric(12,2) NOT NULL,
  cac_min numeric(10,2) NOT NULL, cac_max numeric(10,2) NOT NULL,
  -- Moltiplicatori del CPL mese per mese (gennaio → dicembre): 1 = mese tipico.
  -- Ipotesi di partenza dichiarate (edilizia: agosto e dicembre scarsi,
  -- primavera e autunno pieni; il clima si vende d'estate). Si tarano sui dati.
  stagionalita numeric(4,2)[] NOT NULL,
  aggiornato_il timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.mkt_settori_benchmark
  (settore, etichetta, cpl_min, cpl_max, validita_min, validita_max, appuntamento_min, appuntamento_max, costo_appuntamento_min, costo_appuntamento_max, chiusura_min, chiusura_max, ticket_min, ticket_max, cac_min, cac_max, stagionalita) VALUES
  ('serramenti',      'Serramenti / infissi',        10, 25, 0.60, 0.75, 0.20, 0.35,  55, 170, 0.15, 0.30,   6000,  12000,  300, 1000, ARRAY[1.15,1.00,0.90,0.90,0.95,1.00,1.10,1.35,0.95,0.90,1.00,1.25]),
  ('fotovoltaico',    'Fotovoltaico residenziale',    8, 20, 0.50, 0.70, 0.20, 0.35,  50, 160, 0.15, 0.25,   9000,  18000,  300, 1000, ARRAY[1.05,0.95,0.85,0.85,0.90,0.95,1.00,1.30,0.95,1.00,1.05,1.20]),
  ('bagni',           'Ristrutturazione bagni',      12, 30, 0.55, 0.70, 0.20, 0.35,  65, 220, 0.20, 0.30,  10000,  15000,  300, 1100, ARRAY[1.05,0.95,0.90,0.95,1.00,1.00,1.10,1.35,0.95,0.90,1.00,1.20]),
  ('ristrutturazioni','Ristrutturazioni complete',   15, 35, 0.50, 0.65, 0.15, 0.30,  90, 380, 0.15, 0.25,  40000, 120000,  450, 2200, ARRAY[1.00,0.90,0.90,0.95,1.00,1.05,1.15,1.40,0.95,0.90,1.00,1.20]),
  ('facciate',        'Facciate / cappotto',         20, 45, 0.45, 0.65, 0.15, 0.25, 140, 550, 0.10, 0.20,  60000, 200000,  900, 3500, ARRAY[1.10,1.00,0.90,0.90,0.95,1.00,1.15,1.40,0.95,0.95,1.05,1.25]),
  ('clima',           'Pompe di calore / clima',     10, 22, 0.55, 0.70, 0.25, 0.40,  45, 140, 0.20, 0.30,   8000,  16000,  200,  650, ARRAY[1.10,1.05,1.00,0.90,0.80,0.80,0.90,1.15,1.05,1.10,1.10,1.20]),
  ('altro',           'Altro (banda larga)',         10, 45, 0.45, 0.75, 0.15, 0.40,  45, 550, 0.10, 0.30,   5000, 200000,  200, 3500, ARRAY[1.05,1.00,0.95,0.95,1.00,1.00,1.05,1.30,0.95,0.95,1.00,1.15])
ON CONFLICT (settore) DO NOTHING;

CREATE OR REPLACE FUNCTION public.mkt_fattore_stagionale(p_settore text, p_mese integer)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce((SELECT b.stagionalita[greatest(1, least(12, p_mese))] FROM public.mkt_settori_benchmark b WHERE b.settore = coalesce(p_settore, 'altro')), 1.0);
$$;

-- ---------------------------------------------------------------------------
-- 3. Soglie per cliente (Allegato A), storicizzate
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mkt_soglie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_client_id uuid NOT NULL REFERENCES public.aedix_service_clients(id) ON DELETE CASCADE,
  valida_dal date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date,
  origine text NOT NULL CHECK (origine IN ('settore','storico','manuale')),
  cpl_target numeric(10,2) NOT NULL CHECK (cpl_target > 0),
  cpl_giallo numeric(10,2) NOT NULL,
  cpl_rosso numeric(10,2) NOT NULL,
  moltiplicatore_zero_giallo numeric(4,2) NOT NULL DEFAULT 3.0,
  moltiplicatore_zero_rosso numeric(4,2) NOT NULL DEFAULT 5.0,
  lead_attesi_giorno numeric(6,2),
  costo_appuntamento_target numeric(10,2),
  cac_target numeric(10,2),
  roas_minimo numeric(5,2) NOT NULL DEFAULT 3.0,
  -- true = il target base viene moltiplicato per la stagionalità del settore
  stagionalita_applicata boolean NOT NULL DEFAULT true,
  -- una soglia manuale non viene sovrascritta dalla ritaratura: riceve una proposta
  blocca_ritaratura boolean NOT NULL DEFAULT false,
  cpl_suggerito numeric(10,2),
  suggerito_il timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_client_id, valida_dal)
);
CREATE INDEX IF NOT EXISTS idx_mkt_soglie_cliente ON public.mkt_soglie (service_client_id, valida_dal DESC);

-- La soglia in vigore per un cliente in un giorno. Senza righe: banda di
-- settore (punto medio), come vuole il rodaggio (Parte 4.4).
CREATE OR REPLACE FUNCTION public.mkt_soglia_di(p_service_client_id uuid, p_giorno date DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date)
RETURNS TABLE (
  id uuid, origine text, cpl_target numeric, cpl_giallo numeric, cpl_rosso numeric,
  moltiplicatore_zero_giallo numeric, moltiplicatore_zero_rosso numeric, lead_attesi_giorno numeric,
  costo_appuntamento_target numeric, cac_target numeric, roas_minimo numeric, stagionalita_applicata boolean,
  cpl_suggerito numeric, fattore_stagionale numeric, cpl_target_effettivo numeric, cpl_giallo_effettivo numeric, cpl_rosso_effettivo numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH c AS (
    SELECT sc.id, coalesce(sc.mkt_settore, 'altro') AS settore, sc.mkt_budget_mensile AS budget
      FROM public.aedix_service_clients sc WHERE sc.id = p_service_client_id
  ),
  s AS (
    SELECT * FROM public.mkt_soglie m WHERE m.service_client_id = p_service_client_id AND m.valida_dal <= p_giorno
     ORDER BY m.valida_dal DESC LIMIT 1
  ),
  b AS (SELECT * FROM public.mkt_settori_benchmark WHERE settore = (SELECT settore FROM c)),
  base AS (
    SELECT s.id, coalesce(s.origine, 'settore') AS origine,
           coalesce(s.cpl_target, round((b.cpl_min + b.cpl_max) / 2, 2)) AS cpl_target,
           coalesce(s.cpl_giallo, round((b.cpl_min + b.cpl_max) / 2 * 1.5, 2)) AS cpl_giallo,
           coalesce(s.cpl_rosso, round((b.cpl_min + b.cpl_max) / 2 * 2.0, 2)) AS cpl_rosso,
           coalesce(s.moltiplicatore_zero_giallo, 3.0) AS mzg, coalesce(s.moltiplicatore_zero_rosso, 5.0) AS mzr,
           s.lead_attesi_giorno, s.costo_appuntamento_target, s.cac_target, coalesce(s.roas_minimo, 3.0) AS roas_minimo,
           coalesce(s.stagionalita_applicata, true) AS stag, s.cpl_suggerito,
           public.mkt_fattore_stagionale((SELECT settore FROM c), extract(month FROM p_giorno)::int) AS fattore,
           (SELECT budget FROM c) AS budget
      FROM b LEFT JOIN s ON true
  )
  SELECT base.id, base.origine, base.cpl_target, base.cpl_giallo, base.cpl_rosso, base.mzg, base.mzr,
         coalesce(base.lead_attesi_giorno,
                  CASE WHEN base.budget > 0 THEN round(base.budget / extract(day FROM (date_trunc('month', p_giorno) + interval '1 month - 1 day'))::numeric / (base.cpl_target * CASE WHEN base.stag THEN base.fattore ELSE 1 END), 2) END),
         base.costo_appuntamento_target, base.cac_target, base.roas_minimo, base.stag, base.cpl_suggerito,
         base.fattore,
         round(base.cpl_target * CASE WHEN base.stag THEN base.fattore ELSE 1 END, 2),
         round(base.cpl_giallo * CASE WHEN base.stag THEN base.fattore ELSE 1 END, 2),
         round(base.cpl_rosso  * CASE WHEN base.stag THEN base.fattore ELSE 1 END, 2)
    FROM base;
$$;

-- ---------------------------------------------------------------------------
-- 4. Spesa giornaliera per canale
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mkt_spesa_giornaliera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  giorno date NOT NULL,
  canale text NOT NULL CHECK (canale IN ('meta','google','tiktok','altro')),
  account_esterno_id text NOT NULL DEFAULT '',
  spesa numeric(12,2) NOT NULL DEFAULT 0,
  impression bigint NOT NULL DEFAULT 0,
  click bigint NOT NULL DEFAULT 0,
  lead_dichiarati integer NOT NULL DEFAULT 0,
  frequenza numeric(6,3),
  sincronizzato_il timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, giorno, canale, account_esterno_id)
);
CREATE INDEX IF NOT EXISTS idx_mkt_spesa_company_giorno ON public.mkt_spesa_giornaliera (company_id, giorno DESC);

-- ---------------------------------------------------------------------------
-- 5. Metriche del giorno
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mkt_metriche_giorno (
  service_client_id uuid NOT NULL REFERENCES public.aedix_service_clients(id) ON DELETE CASCADE,
  giorno date NOT NULL,
  stato_cliente text,
  giorni_dall_inizio integer,
  spesa_giorno numeric(12,2), spesa_7g numeric(12,2), spesa_14g numeric(12,2), spesa_mese numeric(12,2),
  budget_giornaliero numeric(12,2),
  lead_grezzi_giorno integer, lead_grezzi_7g integer, lead_validi_7g integer, lead_validi_14g integer, lead_validi_30g integer,
  lead_dichiarati_7g integer,
  cpl_grezzo_7g numeric(10,2), cpl_valido_7g numeric(10,2),
  cpl_target numeric(10,2), cpl_giallo numeric(10,2), cpl_rosso numeric(10,2), fattore_stagionale numeric(4,2),
  appuntamenti_14g integer, costo_appuntamento_14g numeric(10,2),
  tasso_validita_7g numeric(5,4), tasso_appuntamento_14g numeric(5,4), tasso_presenza_30g numeric(5,4),
  scarto_attribuzione_7g numeric(5,4),
  mediana_primo_contatto_min_7g integer,
  lead_fermi integer, lead_fermo_piu_vecchio_ore integer,
  spesa_senza_lead numeric(12,2), rapporto_zero numeric(8,2), sotto_consegna boolean,
  copertura_budget numeric(6,3),
  vendite_mese integer, venduto_mese numeric(14,2), venduto_medio_3m numeric(14,2), vendite_30g integer,
  preventivi_sospesi integer, opp_mese integer, opp_senza_esito_mese integer,
  giorni_accesso_14g integer, giorni_dall_ultimo_accesso integer,
  meta_stato text, meta_account boolean,
  indice_esecuzione integer, indice_componenti jsonb,
  semaforo char(1), semaforo_componenti jsonb,
  dati_freschi boolean NOT NULL DEFAULT true, ultimo_sync timestamptz, spesa_disponibile boolean NOT NULL DEFAULT true,
  calcolato_il timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service_client_id, giorno)
);

-- Minuti di orario di servizio fra due istanti (ora di Roma). Fuori orario e
-- nei giorni chiusi il cronometro è fermo: un lead del sabato sera «parte»
-- lunedì all'apertura, come vuole la Parte 7.3.
CREATE OR REPLACE FUNCTION public.mkt_minuti_lavorativi(p_da timestamptz, p_a timestamptz, p_orario jsonb DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_orario jsonb := coalesce(p_orario, '{"lun_ven":["08:30","19:00"],"sab":["09:00","13:00"],"dom":null}'::jsonb);
  v_da timestamp := p_da AT TIME ZONE 'Europe/Rome';
  v_a timestamp := p_a AT TIME ZONE 'Europe/Rome';
  v_g date;
  v_fine date;
  v_fascia jsonb;
  v_apre timestamp; v_chiude timestamp;
  v_min numeric := 0;
  v_n integer := 0;
BEGIN
  IF p_da IS NULL OR p_a IS NULL OR v_a <= v_da THEN RETURN 0; END IF;
  v_g := v_da::date;
  v_fine := least(v_a::date, v_da::date + 92);
  WHILE v_g <= v_fine LOOP
    v_fascia := CASE extract(isodow FROM v_g)::int
                  WHEN 6 THEN v_orario->'sab'
                  WHEN 7 THEN v_orario->'dom'
                  ELSE v_orario->'lun_ven' END;
    IF v_fascia IS NOT NULL AND jsonb_typeof(v_fascia) = 'array' AND jsonb_array_length(v_fascia) = 2 THEN
      v_apre := v_g + (v_fascia->>0)::time;
      v_chiude := v_g + (v_fascia->>1)::time;
      IF v_chiude > v_apre THEN
        v_min := v_min + greatest(0, extract(epoch FROM (least(v_a, v_chiude) - greatest(v_da, v_apre))) / 60);
      END IF;
    END IF;
    v_g := v_g + 1;
    v_n := v_n + 1;
  END LOOP;
  RETURN round(v_min)::integer;
END $$;

-- Ricalcola le metriche del giorno per tutti i clienti marketing. Le finestre
-- (7/14/30 giorni) finiscono ieri, così i confronti fra giorni sono onesti; i
-- valori «vivi» (lead fermi, spesa senza lead, collegamenti) sono al momento
-- del calcolo. Chi la chiama: il cron, o un super admin dalla console.
CREATE OR REPLACE FUNCTION public.mkt_calcola_metriche(p_giorno date DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'non autorizzato';
  END IF;

  WITH par AS (
    SELECT p_giorno AS g,
           (p_giorno::timestamp AT TIME ZONE 'Europe/Rome') AS t0,
           ((p_giorno - 1)::timestamp AT TIME ZONE 'Europe/Rome') AS t1,
           ((p_giorno - 7)::timestamp AT TIME ZONE 'Europe/Rome') AS t7,
           ((p_giorno - 14)::timestamp AT TIME ZONE 'Europe/Rome') AS t14,
           ((p_giorno - 30)::timestamp AT TIME ZONE 'Europe/Rome') AS t30,
           ((p_giorno - 90)::timestamp AT TIME ZONE 'Europe/Rome') AS t90,
           (date_trunc('month', p_giorno)::date::timestamp AT TIME ZONE 'Europe/Rome') AS tm0,
           date_trunc('month', p_giorno)::date AS m0,
           extract(day FROM (date_trunc('month', p_giorno) + interval '1 month - 1 day'))::int AS giorni_mese,
           greatest(1, extract(day FROM p_giorno)::int - 1) AS giorni_trascorsi
  ),
  cli AS (
    SELECT sc.id, sc.company_id, sc.stato, sc.data_inizio, coalesce(sc.mkt_settore, 'altro') AS settore,
           sc.mkt_budget_mensile AS budget, sc.mkt_orario_servizio AS orario,
           (SELECT g FROM par) - coalesce(sc.data_inizio, (SELECT g FROM par)) AS giorni_dall_inizio
      FROM public.aedix_service_clients sc
      JOIN public.aedix_product_lines l ON l.id = sc.product_line_id
     WHERE sc.company_id IS NOT NULL AND l.categoria IN ('agenzia','performance') AND sc.stato IN ('attivo','pausa')
  ),
  base AS (
    SELECT cli.*, par.*, sg.cpl_target_effettivo, sg.cpl_giallo_effettivo, sg.cpl_rosso_effettivo, sg.fattore_stagionale,
           sg.moltiplicatore_zero_giallo AS mzg, sg.moltiplicatore_zero_rosso AS mzr,
           bm.appuntamento_min, bm.appuntamento_max,
           -- spesa: sincronizzata per canale + costi a mano
           sp.*, ld.*, ul.ultimo_lead, op.*, ap.*, pr.*, ac.*, te.*, ve.*
      FROM cli CROSS JOIN par
      LEFT JOIN LATERAL public.mkt_soglia_di(cli.id, par.g) sg ON true
      LEFT JOIN public.mkt_settori_benchmark bm ON bm.settore = cli.settore
      CROSS JOIN LATERAL (
        SELECT coalesce(sum(s.spesa) FILTER (WHERE s.giorno = par.g - 1), 0) AS spesa_ieri,
               coalesce(sum(s.spesa) FILTER (WHERE s.giorno >= par.g - 7 AND s.giorno < par.g), 0) AS spesa_7g,
               coalesce(sum(s.spesa) FILTER (WHERE s.giorno >= par.g - 14 AND s.giorno < par.g), 0) AS spesa_14g,
               coalesce(sum(s.spesa) FILTER (WHERE s.giorno >= par.m0 AND s.giorno < par.g), 0) AS spesa_mese,
               coalesce(sum(s.lead_dichiarati) FILTER (WHERE s.giorno >= par.g - 7 AND s.giorno < par.g), 0) AS lead_dichiarati_7g,
               max(s.sincronizzato_il) AS ultimo_sync,
               coalesce(bool_or(s.sincronizzato_il IS NOT NULL), false) AS spesa_disponibile
          FROM (
            SELECT m.giorno, m.spesa, m.lead_dichiarati, m.sincronizzato_il
              FROM public.mkt_spesa_giornaliera m WHERE m.company_id = cli.company_id AND m.giorno >= par.g - 31
            UNION ALL
            SELECT k.date, coalesce(k.spend_amount, 0), 0, NULL::timestamptz
              FROM public.campaign_costs k WHERE k.company_id = cli.company_id AND k.date >= par.g - 31
          ) s
      ) sp
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE l.t >= par.t1 AND l.t < par.t0) AS lead_grezzi_ieri,
               count(*) FILTER (WHERE l.t >= par.t7 AND l.t < par.t0) AS lead_grezzi_7g,
               count(*) FILTER (WHERE l.valido AND l.t >= par.t7 AND l.t < par.t0) AS lead_validi_7g,
               count(*) FILTER (WHERE l.valido AND l.t >= par.t14 AND l.t < par.t0) AS lead_validi_14g,
               count(*) FILTER (WHERE l.valido AND l.t >= par.t30 AND l.t < par.t0) AS lead_validi_30g
          FROM (
            SELECT mc.created_at AS t,
                   (nullif(regexp_replace(coalesce(mc.phone, ''), '\D', '', 'g'), '') IS NOT NULL
                    AND NOT EXISTS (
                      SELECT 1 FROM public.marketing_contacts d
                       WHERE d.company_id = mc.company_id AND d.id <> mc.id
                         AND d.created_at < mc.created_at AND d.created_at >= mc.created_at - interval '30 days'
                         AND regexp_replace(coalesce(d.phone, ''), '\D', '', 'g') = regexp_replace(mc.phone, '\D', '', 'g'))) AS valido
              FROM public.marketing_contacts mc
             WHERE mc.company_id = cli.company_id AND mc.created_at >= par.t30 AND mc.created_at < par.t0
               AND coalesce(mc.source, '') NOT ILIKE 'fatturazione%'
               AND coalesce(mc.source_channel, '') NOT IN ('cold_import', 'cliente_servizio')
          ) l
      ) ld
      CROSS JOIN LATERAL (
        SELECT max(mc.created_at) AS ultimo_lead
          FROM public.marketing_contacts mc
         WHERE mc.company_id = cli.company_id
           AND coalesce(mc.source, '') NOT ILIKE 'fatturazione%'
           AND coalesce(mc.source_channel, '') NOT IN ('cold_import', 'cliente_servizio')
      ) ul
      CROSS JOIN LATERAL (
        SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY x.min_pc) FILTER (WHERE x.created >= par.t7 AND x.min_pc IS NOT NULL))::int AS mediana_min_7g,
               count(*) FILTER (WHERE x.created >= par.t14) AS opp_14g,
               count(*) FILTER (WHERE x.created >= par.t14 AND x.prima IS NOT NULL) AS lavorate_14g,
               count(*) FILTER (WHERE x.created >= par.t14 AND x.created < par.t7) AS opp_da_esito,
               count(*) FILTER (WHERE x.created >= par.t14 AND x.created < par.t7 AND x.con_esito) AS opp_con_esito,
               count(*) FILTER (WHERE x.status = 'open' AND x.prima IS NULL AND x.min_att > 1440) AS lead_fermi,
               coalesce(max(x.min_att) FILTER (WHERE x.status = 'open' AND x.prima IS NULL), 0) AS fermo_max_min,
               avg(x.tentativi) FILTER (WHERE x.created >= par.t14 AND NOT x.con_app) AS tentativi_medi,
               count(*) FILTER (WHERE x.created >= par.tm0 AND x.status = 'open' AND x.prima IS NULL AND x.con_esito = false) AS senza_esito_mese,
               count(*) FILTER (WHERE x.created >= par.tm0) AS opp_mese
          FROM (
            SELECT o.created_at AS created, o.status,
                   p.prima,
                   CASE WHEN p.prima IS NOT NULL THEN public.mkt_minuti_lavorativi(o.created_at, p.prima, cli.orario) END AS min_pc,
                   public.mkt_minuti_lavorativi(o.created_at, now(), cli.orario) AS min_att,
                   (o.status <> 'open' OR p.fasi > 1) AS con_esito,
                   coalesce(p.note, 0) AS tentativi,
                   coalesce(p.app, false) AS con_app
              FROM public.marketing_opportunities o
              CROSS JOIN LATERAL (
                SELECT least(
                         (SELECT min(h.entered_at) FROM public.marketing_opportunity_stage_history h WHERE h.opportunity_id = o.id AND h.entered_at > o.created_at + interval '2 minutes'),
                         (SELECT min(a.created_at) FROM public.marketing_contact_activities a
                           WHERE a.contact_id = o.contact_id AND a.company_id = o.company_id AND a.created_at > o.created_at + interval '2 minutes'
                             AND a.activity_type NOT IN ('contact_created','opportunity_created','contact_assigned','opportunity_assigned','updated','opportunity_auto_created'))
                       ) AS prima,
                       (SELECT count(*) FROM public.marketing_opportunity_stage_history h WHERE h.opportunity_id = o.id) AS fasi,
                       (SELECT count(*) FROM public.marketing_contact_activities a WHERE a.contact_id = o.contact_id AND a.company_id = o.company_id AND a.activity_type IN ('note_added','status_changed','quote_sent')) AS note,
                       EXISTS (SELECT 1 FROM public.appointments ap WHERE ap.opportunity_id = o.id AND coalesce(ap.status,'') NOT IN ('annullato','cancelled','cancellato')) AS app
              ) p
             WHERE o.company_id = cli.company_id AND o.deleted_at IS NULL AND o.created_at >= par.t30
          ) x
      ) op
      CROSS JOIN LATERAL (
        SELECT (SELECT count(DISTINCT y.opportunity_id) FROM (
                  SELECT h.opportunity_id FROM public.marketing_opportunity_stage_history h
                    JOIN public.marketing_pipeline_stages s ON s.id = h.stage_id
                   WHERE h.company_id = cli.company_id AND h.entered_at >= par.t14 AND h.entered_at < par.t0
                     AND (s.name ILIKE '%appuntament%' OR s.name ILIKE '%incontro%' OR s.name ILIKE '%sopralluogo%')
                     AND s.name NOT ILIKE '%da fissare%' AND s.name NOT ILIKE '%rifissare%' AND s.name NOT ILIKE '%chiamata%'
                  UNION ALL
                  SELECT coalesce(a.opportunity_id, a.id) FROM public.appointments a
                   WHERE a.company_id = cli.company_id AND a.created_at >= par.t14 AND a.created_at < par.t0
                     AND coalesce(a.status, '') NOT IN ('annullato','cancelled','cancellato') AND NOT coalesce(a.is_blocked_slot, false)
                ) y) AS appuntamenti_14g,
               (SELECT count(*) FROM public.appointments a
                 WHERE a.company_id = cli.company_id AND a.appointment_date >= par.g - 30 AND a.appointment_date < par.g
                   AND coalesce(a.status, '') NOT IN ('annullato','cancelled','cancellato') AND NOT coalesce(a.is_blocked_slot, false)) AS app_30g,
               (SELECT count(*) FROM public.appointments a
                 WHERE a.company_id = cli.company_id AND a.appointment_date >= par.g - 30 AND a.appointment_date < par.g
                   AND (a.is_completed OR coalesce(a.status, '') IN ('completato','da_preventivare','preventivo_inviato'))) AS app_fatti_30g
      ) ap
      CROSS JOIN LATERAL (
        SELECT (SELECT count(*) FROM public.appointments a
                 WHERE a.company_id = cli.company_id AND a.appointment_date >= par.g - 21 AND a.appointment_date < par.g - 7
                   AND (a.is_completed OR coalesce(a.status, '') IN ('completato','da_preventivare','preventivo_inviato'))) AS app_per_preventivo,
               (SELECT count(*) FROM public.appointments a
                 WHERE a.company_id = cli.company_id AND a.appointment_date >= par.g - 21 AND a.appointment_date < par.g - 7
                   AND (a.is_completed OR coalesce(a.status, '') IN ('completato','da_preventivare','preventivo_inviato'))
                   AND EXISTS (SELECT 1 FROM public.quotes q WHERE q.company_id = a.company_id
                                 AND (q.opportunity_id = a.opportunity_id OR (a.contact_id IS NOT NULL AND q.contact_id = a.contact_id))
                                 AND q.created_at >= a.appointment_date::timestamp AND q.created_at < a.appointment_date::timestamp + interval '7 days')) AS app_con_preventivo,
               (SELECT count(*) FROM public.quotes q WHERE q.company_id = cli.company_id AND q.status = 'inviata' AND coalesce(q.sent_at, q.created_at) < now() - interval '10 days') AS preventivi_sospesi
      ) pr
      CROSS JOIN LATERAL (
        SELECT (SELECT count(DISTINCT (coalesce(us.last_active_at, us.started_at) AT TIME ZONE 'Europe/Rome')::date)
                  FROM public.user_sessions us WHERE us.company_id = cli.company_id AND coalesce(us.last_active_at, us.started_at) >= par.t14) AS giorni_accesso_14g,
               (SELECT (par.g - (max(u.last_sign_in_at) AT TIME ZONE 'Europe/Rome')::date)
                  FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.company_id = cli.company_id) AS giorni_dall_ultimo_accesso
      ) ac
      CROSS JOIN LATERAL (
        SELECT (SELECT i.status FROM public.integrations i WHERE i.company_id = cli.company_id AND i.provider = 'meta'
                 ORDER BY (i.status = 'connected') DESC, i.updated_at DESC LIMIT 1) AS meta_stato,
               EXISTS (SELECT 1 FROM public.meta_assets a WHERE a.company_id = cli.company_id AND a.asset_type = 'ad_account' AND a.selected) AS meta_account
      ) te
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE coalesce(o.won_at, o.updated_at) >= par.tm0) AS vendite_mese,
               coalesce(sum(o.value) FILTER (WHERE coalesce(o.won_at, o.updated_at) >= par.tm0), 0) AS venduto_mese,
               count(*) FILTER (WHERE coalesce(o.won_at, o.updated_at) >= par.t30) AS vendite_30g,
               coalesce(sum(o.value) FILTER (WHERE coalesce(o.won_at, o.updated_at) >= par.tm0 - interval '3 months' AND coalesce(o.won_at, o.updated_at) < par.tm0), 0) / 3 AS venduto_medio_3m
          FROM public.marketing_opportunities o
         WHERE o.company_id = cli.company_id AND o.deleted_at IS NULL AND o.status = 'won'
           AND coalesce(o.won_at, o.updated_at) >= par.tm0 - interval '3 months'
      ) ve
  ),
  calc AS (
    SELECT b.*,
           -- senza spesa registrata il CPL non è zero: non si sa
           CASE WHEN b.lead_grezzi_7g > 0 AND b.spesa_7g > 0 THEN round(b.spesa_7g / b.lead_grezzi_7g, 2) END AS cpl_grezzo_7g,
           CASE WHEN b.lead_validi_7g > 0 AND b.spesa_7g > 0 THEN round(b.spesa_7g / b.lead_validi_7g, 2) END AS cpl_valido_7g,
           CASE WHEN b.lead_grezzi_7g > 0 THEN round(b.lead_validi_7g::numeric / b.lead_grezzi_7g, 4) END AS tasso_validita_7g,
           CASE WHEN b.lead_validi_14g > 0 THEN round(b.appuntamenti_14g::numeric / b.lead_validi_14g, 4) END AS tasso_appuntamento_14g,
           CASE WHEN b.appuntamenti_14g > 0 AND b.spesa_14g > 0 THEN round(b.spesa_14g / b.appuntamenti_14g, 2) END AS costo_appuntamento_14g,
           CASE WHEN b.app_30g > 0 THEN round(b.app_fatti_30g::numeric / b.app_30g, 4) END AS tasso_presenza_30g,
           CASE WHEN b.lead_dichiarati_7g > 0 THEN round(b.lead_grezzi_7g::numeric / b.lead_dichiarati_7g, 4) END AS scarto_attribuzione_7g,
           CASE WHEN b.budget > 0 THEN round(b.budget / b.giorni_mese, 2) END AS budget_giornaliero,
           CASE WHEN b.budget > 0 AND b.giorni_trascorsi > 0 THEN least(999, round(b.spesa_mese / b.budget * b.giorni_mese / b.giorni_trascorsi, 3)) END AS copertura_budget,
           -- spesa dall'ultimo lead in poi (i giorni interi dopo il giorno dell'ultimo lead;
           -- senza lead da 30 giorni: tutta la spesa dei 30 giorni)
           (SELECT coalesce(sum(s.spesa), 0) FROM (
              SELECT m.giorno, m.spesa FROM public.mkt_spesa_giornaliera m WHERE m.company_id = b.company_id AND m.giorno >= b.g - 30
              UNION ALL SELECT k.date, coalesce(k.spend_amount, 0) FROM public.campaign_costs k WHERE k.company_id = b.company_id AND k.date >= b.g - 30
            ) s WHERE s.giorno > coalesce((b.ultimo_lead AT TIME ZONE 'Europe/Rome')::date, b.g - 31)) AS spesa_senza_lead,
           (b.ultimo_sync IS NULL OR b.ultimo_sync >= now() - interval '8 hours') AS dati_freschi
      FROM base b
  ),
  calc2 AS (
    SELECT c.*,
           CASE WHEN c.cpl_target_effettivo > 0 THEN round(c.spesa_senza_lead / c.cpl_target_effettivo, 2) END AS rapporto_zero,
           (c.budget_giornaliero > 0 AND c.spesa_ieri < 0.5 * c.budget_giornaliero) AS sotto_consegna,
           -- Indice di Esecuzione (Parte 10): componenti 0-1, pesi 30/20/15/10/15/10, sui dati disponibili
           (SELECT jsonb_strip_nulls(jsonb_build_object(
              'velocita', CASE WHEN c.mediana_min_7g IS NOT NULL THEN round(greatest(0, least(1, (480 - c.mediana_min_7g) / 450.0)), 2) END,
              'lavorati', CASE WHEN c.opp_14g > 0 THEN round(greatest(0, least(1, (c.lavorate_14g::numeric / c.opp_14g - 0.6) / 0.4)), 2) END,
              'esito',    CASE WHEN c.opp_da_esito > 0 THEN round(greatest(0, least(1, (c.opp_con_esito::numeric / c.opp_da_esito - 0.5) / 0.45)), 2) END,
              'tentativi', CASE WHEN c.tentativi_medi IS NOT NULL THEN round(greatest(0, least(1, (c.tentativi_medi - 1) / 4.0)), 2) END,
              'preventivi', CASE WHEN c.app_per_preventivo > 0 THEN round(greatest(0, least(1, (c.app_con_preventivo::numeric / c.app_per_preventivo - 0.4) / 0.45)), 2) END,
              'accessi',  CASE WHEN c.giorni_accesso_14g IS NOT NULL THEN round(greatest(0, least(1, (c.giorni_accesso_14g - 3) / 7.0)), 2) END))) AS componenti
      FROM calc c
  ),
  calc3 AS (
    SELECT c.*,
           (SELECT CASE WHEN sum(w.peso) > 0 THEN round(sum(w.peso * (c.componenti->>w.k)::numeric) / sum(w.peso) * 100)::int END
              FROM (VALUES ('velocita', 30), ('lavorati', 20), ('esito', 15), ('tentativi', 10), ('preventivi', 15), ('accessi', 10)) AS w(k, peso)
             WHERE c.componenti ? w.k) AS indice,
           -- semaforo a sei componenti (Parte 6.1): V verde, G giallo, R rosso, N non leggibile
           CASE WHEN c.stato = 'pausa' THEN 'N'
                WHEN c.lead_fermi >= 5 OR c.fermo_max_min > 2880 OR c.mediana_min_7g > 240 THEN 'R'
                WHEN c.lead_fermi BETWEEN 1 AND 4 OR c.mediana_min_7g > 30 THEN 'G'
                WHEN c.mediana_min_7g IS NULL AND c.lead_fermi = 0 AND c.opp_14g = 0 THEN 'N'
                ELSE 'V' END AS s_velocita,
           CASE WHEN c.stato = 'pausa' OR NOT c.dati_freschi OR NOT c.spesa_disponibile OR c.rapporto_zero IS NULL THEN 'N'
                WHEN c.sotto_consegna THEN 'G'
                WHEN c.rapporto_zero >= c.mzr THEN 'R'
                WHEN c.rapporto_zero >= c.mzg THEN 'G'
                ELSE 'V' END AS s_flusso,
           CASE WHEN c.stato = 'pausa' OR c.giorni_dall_inizio < 31 OR NOT c.dati_freschi OR c.cpl_valido_7g IS NULL OR c.lead_validi_7g < 10 THEN 'N'
                WHEN c.cpl_valido_7g > c.cpl_rosso_effettivo THEN 'R'
                WHEN c.cpl_valido_7g > c.cpl_target_effettivo THEN 'G'
                ELSE 'V' END AS s_costo,
           CASE WHEN c.stato = 'pausa' OR c.giorni_dall_inizio < 31 OR c.tasso_appuntamento_14g IS NULL OR c.lead_validi_14g < 20 THEN 'N'
                WHEN c.tasso_appuntamento_14g < c.appuntamento_min * 0.5 THEN 'R'
                WHEN c.tasso_appuntamento_14g < c.appuntamento_min THEN 'G'
                ELSE 'V' END AS s_qualita,
           CASE WHEN c.meta_stato = 'token_expired' OR (c.meta_stato IS NOT NULL AND c.meta_stato <> 'connected') THEN 'R'
                WHEN c.scarto_attribuzione_7g IS NOT NULL AND c.scarto_attribuzione_7g < 0.8 THEN 'R'
                WHEN c.budget > 0 AND c.spesa_ieri = 0 AND c.spesa_7g > 0 AND c.stato = 'attivo' THEN 'R'
                WHEN c.scarto_attribuzione_7g IS NOT NULL AND c.scarto_attribuzione_7g < 0.9 THEN 'G'
                WHEN c.meta_stato IS NULL OR NOT c.meta_account THEN 'G'
                ELSE 'V' END AS s_tecnico
      FROM calc2 c
  ),
  calc4 AS (
    SELECT c.*,
           CASE WHEN c.stato = 'pausa' OR c.indice IS NULL THEN 'N' WHEN c.indice >= 75 THEN 'V' WHEN c.indice >= 50 THEN 'G' ELSE 'R' END AS s_esecuzione
      FROM calc3 c
  )
  INSERT INTO public.mkt_metriche_giorno AS m (
    service_client_id, giorno, stato_cliente, giorni_dall_inizio,
    spesa_giorno, spesa_7g, spesa_14g, spesa_mese, budget_giornaliero,
    lead_grezzi_giorno, lead_grezzi_7g, lead_validi_7g, lead_validi_14g, lead_validi_30g, lead_dichiarati_7g,
    cpl_grezzo_7g, cpl_valido_7g, cpl_target, cpl_giallo, cpl_rosso, fattore_stagionale,
    appuntamenti_14g, costo_appuntamento_14g, tasso_validita_7g, tasso_appuntamento_14g, tasso_presenza_30g, scarto_attribuzione_7g,
    mediana_primo_contatto_min_7g, lead_fermi, lead_fermo_piu_vecchio_ore,
    spesa_senza_lead, rapporto_zero, sotto_consegna, copertura_budget,
    vendite_mese, venduto_mese, venduto_medio_3m, vendite_30g, preventivi_sospesi, opp_mese, opp_senza_esito_mese,
    giorni_accesso_14g, giorni_dall_ultimo_accesso, meta_stato, meta_account,
    indice_esecuzione, indice_componenti, semaforo, semaforo_componenti,
    dati_freschi, ultimo_sync, spesa_disponibile, calcolato_il)
  SELECT c.id, c.g, c.stato, c.giorni_dall_inizio,
         c.spesa_ieri, c.spesa_7g, c.spesa_14g, c.spesa_mese, c.budget_giornaliero,
         c.lead_grezzi_ieri, c.lead_grezzi_7g, c.lead_validi_7g, c.lead_validi_14g, c.lead_validi_30g, c.lead_dichiarati_7g,
         c.cpl_grezzo_7g, c.cpl_valido_7g, c.cpl_target_effettivo, c.cpl_giallo_effettivo, c.cpl_rosso_effettivo, c.fattore_stagionale,
         c.appuntamenti_14g, c.costo_appuntamento_14g, c.tasso_validita_7g, c.tasso_appuntamento_14g, c.tasso_presenza_30g, c.scarto_attribuzione_7g,
         c.mediana_min_7g, c.lead_fermi, round(c.fermo_max_min / 60.0)::int,
         c.spesa_senza_lead, c.rapporto_zero, c.sotto_consegna, c.copertura_budget,
         c.vendite_mese, c.venduto_mese, c.venduto_medio_3m, c.vendite_30g, c.preventivi_sospesi, c.opp_mese, c.senza_esito_mese,
         c.giorni_accesso_14g, c.giorni_dall_ultimo_accesso, c.meta_stato, c.meta_account,
         c.indice, c.componenti,
         CASE WHEN c.stato = 'pausa' THEN 'N'
              WHEN 'R' IN (c.s_velocita, c.s_flusso, c.s_costo, c.s_qualita, c.s_tecnico, c.s_esecuzione) THEN 'R'
              WHEN 'G' IN (c.s_velocita, c.s_flusso, c.s_costo, c.s_qualita, c.s_tecnico, c.s_esecuzione) THEN 'G'
              WHEN 'V' IN (c.s_velocita, c.s_flusso, c.s_costo, c.s_qualita, c.s_tecnico, c.s_esecuzione) THEN 'V'
              ELSE 'N' END,
         jsonb_build_object('velocita', c.s_velocita, 'flusso', c.s_flusso, 'costo', c.s_costo, 'qualita', c.s_qualita, 'tecnico', c.s_tecnico, 'esecuzione', c.s_esecuzione),
         c.dati_freschi, c.ultimo_sync, c.spesa_disponibile, now()
    FROM calc4 c
  ON CONFLICT (service_client_id, giorno) DO UPDATE SET
    stato_cliente = EXCLUDED.stato_cliente, giorni_dall_inizio = EXCLUDED.giorni_dall_inizio,
    spesa_giorno = EXCLUDED.spesa_giorno, spesa_7g = EXCLUDED.spesa_7g, spesa_14g = EXCLUDED.spesa_14g, spesa_mese = EXCLUDED.spesa_mese, budget_giornaliero = EXCLUDED.budget_giornaliero,
    lead_grezzi_giorno = EXCLUDED.lead_grezzi_giorno, lead_grezzi_7g = EXCLUDED.lead_grezzi_7g, lead_validi_7g = EXCLUDED.lead_validi_7g, lead_validi_14g = EXCLUDED.lead_validi_14g, lead_validi_30g = EXCLUDED.lead_validi_30g, lead_dichiarati_7g = EXCLUDED.lead_dichiarati_7g,
    cpl_grezzo_7g = EXCLUDED.cpl_grezzo_7g, cpl_valido_7g = EXCLUDED.cpl_valido_7g, cpl_target = EXCLUDED.cpl_target, cpl_giallo = EXCLUDED.cpl_giallo, cpl_rosso = EXCLUDED.cpl_rosso, fattore_stagionale = EXCLUDED.fattore_stagionale,
    appuntamenti_14g = EXCLUDED.appuntamenti_14g, costo_appuntamento_14g = EXCLUDED.costo_appuntamento_14g, tasso_validita_7g = EXCLUDED.tasso_validita_7g, tasso_appuntamento_14g = EXCLUDED.tasso_appuntamento_14g, tasso_presenza_30g = EXCLUDED.tasso_presenza_30g, scarto_attribuzione_7g = EXCLUDED.scarto_attribuzione_7g,
    mediana_primo_contatto_min_7g = EXCLUDED.mediana_primo_contatto_min_7g, lead_fermi = EXCLUDED.lead_fermi, lead_fermo_piu_vecchio_ore = EXCLUDED.lead_fermo_piu_vecchio_ore,
    spesa_senza_lead = EXCLUDED.spesa_senza_lead, rapporto_zero = EXCLUDED.rapporto_zero, sotto_consegna = EXCLUDED.sotto_consegna, copertura_budget = EXCLUDED.copertura_budget,
    vendite_mese = EXCLUDED.vendite_mese, venduto_mese = EXCLUDED.venduto_mese, venduto_medio_3m = EXCLUDED.venduto_medio_3m, vendite_30g = EXCLUDED.vendite_30g, preventivi_sospesi = EXCLUDED.preventivi_sospesi,
    opp_mese = EXCLUDED.opp_mese, opp_senza_esito_mese = EXCLUDED.opp_senza_esito_mese,
    giorni_accesso_14g = EXCLUDED.giorni_accesso_14g, giorni_dall_ultimo_accesso = EXCLUDED.giorni_dall_ultimo_accesso, meta_stato = EXCLUDED.meta_stato, meta_account = EXCLUDED.meta_account,
    indice_esecuzione = EXCLUDED.indice_esecuzione, indice_componenti = EXCLUDED.indice_componenti, semaforo = EXCLUDED.semaforo, semaforo_componenti = EXCLUDED.semaforo_componenti,
    dati_freschi = EXCLUDED.dati_freschi, ultimo_sync = EXCLUDED.ultimo_sync, spesa_disponibile = EXCLUDED.spesa_disponibile, calcolato_il = now();

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Regole e allarmi (Parte 8, Parte 5.4, anti-rumore della specifica 4.3)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mkt_regole (
  id text PRIMARY KEY,
  nome text NOT NULL,
  gravita text NOT NULL CHECK (gravita IN ('nota','giallo','rosso','grave')),
  azione text NOT NULL,
  proprietario text NOT NULL CHECK (proprietario IN ('sistema','noi','cliente')),
  scadenza_ore integer,
  attiva boolean NOT NULL DEFAULT true,
  implementata boolean NOT NULL DEFAULT true,
  richiede_dati_freschi boolean NOT NULL DEFAULT false,
  stati_cliente_esclusi text[] NOT NULL DEFAULT ARRAY['pausa','cessato'],
  in_rodaggio boolean NOT NULL DEFAULT true,   -- false = non scatta nei primi 30 giorni
  campione_minimo integer,
  parametri jsonb NOT NULL DEFAULT '{}'::jsonb,
  ordine integer NOT NULL DEFAULT 100
);

INSERT INTO public.mkt_regole (id, nome, gravita, azione, proprietario, scadenza_ore, richiede_dati_freschi, in_rodaggio, campione_minimo, implementata, ordine) VALUES
  ('R1',  'Lead fermo da più di 24 ore di servizio',            'giallo', 'Scrivere al referente con il link al lead',                                                        'sistema', 0,    false, true,  NULL, true,  10),
  ('R2',  'Lead fermo da più di 48 ore',                         'rosso',  'Chiamare il referente, non scrivere (script 1)',                                                   'noi',     12,   false, true,  NULL, true,  11),
  ('R3',  'Cinque o più lead fermi insieme',                     'grave',  'Chiamare il titolare, non il referente: si apre la conversazione sul patto operativo (script 1)',  'noi',     24,   false, true,  NULL, true,  12),
  ('R4',  'Mediana di risposta oltre 4 ore per 3 giorni su 7',   'giallo', 'Rivedere la presa in carico: reperibilità, voce AI o presa in carico nostra a pagamento',           'noi',     72,   false, true,  NULL, true,  13),
  ('R5',  'Oltre il 20% dei lead del mese senza esito',          'giallo', 'Chiamare il titolare e sistemare i dati prima di qualunque analisi',                                'noi',     72,   false, true,  NULL, true,  14),
  ('R6',  'Spesa senza lead oltre 3× il CPL target',              'giallo', 'Controllo tecnico in cinque punti (Parte 9.2). Nessuna comunicazione al cliente',                  'noi',     24,   true,  true,  NULL, true,  20),
  ('R7',  'Campagna in sotto-consegna',                           'giallo', 'Verificare pubblico troppo stretto, offerta d''asta, limitazioni dell''account',                     'noi',     24,   true,  true,  NULL, true,  21),
  ('R8',  'Spesa senza lead oltre 5× il CPL target',              'rosso',  'Mettere in pausa l''inserzione peggiore e attivare la creativa di riserva',                        'noi',     4,    true,  true,  NULL, true,  22),
  ('R9',  'CPL valido oltre 1,5× il target per 3 giorni',          'giallo', 'Cambiare la creatività, non il budget. Tenere il pubblico',                                         'noi',     48,   true,  false, 10,   true,  23),
  ('R10', 'CPL valido oltre 2× il target',                        'rosso',  'Pausa dell''inserzione fuori costo, creativa di riserva, avviso al cliente con il numero (script 2)', 'noi',   24,   true,  false, 10,   true,  24),
  ('R11', 'CPL valido sotto il target del 30% per 7 giorni',      'nota',   'Proporre un aumento del budget con il conto del ritorno',                                            'noi',     72,   true,  false, 10,   true,  25),
  ('R12', 'Budget all''80% con più di 5 giorni al termine',        'giallo', 'Avvisare il cliente con la proiezione: fermare o integrare',                                         'noi',     0,    true,  true,  NULL, true,  26),
  ('R13', 'Budget superato',                                      'rosso',  'Nessun aumento senza autorizzazione scritta del cliente registrata in console',                       'sistema', 0,    true,  true,  NULL, true,  27),
  ('R14', 'Scarti oltre il 25% nella settimana',                  'giallo', 'Analisi dei motivi di scarto: raggio, messaggio o domanda di qualifica nel modulo',                  'noi',     72,   false, false, NULL, false, 30),
  ('R15', 'Scarti sotto il 3% con più di 20 lead',                'rosso',  'Chiamata di verifica: nessuno sta guardando i lead',                                                 'noi',     48,   false, false, 20,   false, 31),
  ('R16', 'Tasso di appuntamento sotto la banda per 2 settimane', 'giallo', 'Ascoltare tre chiamate o leggere lo scambio WhatsApp prima di toccare la campagna',                 'noi',     168,  false, false, 40,   true,  32),
  ('R17', 'Tasso di chiusura sotto il 10% con 20 appuntamenti',   'nota',   'Non è la campagna: proporre un percorso di vendita, con i dati stampati (script 3)',               'noi',     NULL, false, false, 20,   false, 33),
  ('R18', 'Presenza agli appuntamenti sotto il 70%',              'giallo', 'Promemoria automatico a -24 h e -2 h, conferma la sera prima',                                       'noi',     168,  false, false, 10,   true,  34),
  ('R19', 'Collegamento Meta caduto',                             'rosso',  'Ripristinare il collegamento (il token è nostro o del cliente: la scheda lo dice)',                  'noi',     4,    false, true,  NULL, true,  40),
  ('R20', 'Nel CRM meno dell''80% dei lead dichiarati',            'rosso',  'Verificare moduli collegati, moduli nuovi non mappati, duplicati scartati per errore',              'noi',     24,   true,  true,  NULL, true,  41),
  ('R21', 'Modulo nuovo non mappato',                             'nota',   'Mappare o escludere esplicitamente il modulo',                                                       'noi',     48,   false, true,  NULL, false, 42),
  ('R22', 'Sincronizzazione della spesa ferma da 8 ore',          'nota',   'Semafori su costo e flusso congelati: mai un allarme su dati vecchi',                                'sistema', 0,    false, true,  NULL, true,  43),
  ('R23', 'Campagna attiva ma spesa a zero',                      'rosso',  'Controllare rifiuto dell''annuncio, carta scaduta, account limitato',                                'noi',     4,    true,  true,  NULL, true,  44),
  ('R24', 'Nessun accesso al gestionale da 3 giorni lavorativi',  'giallo', 'Messaggio al referente',                                                                             'sistema', 0,    false, true,  NULL, true,  50),
  ('R25', 'Nessun accesso da 7 giorni',                           'rosso',  'Chiamare: è il primo segnale di abbandono (script 4)',                                              'noi',     48,   false, true,  NULL, true,  51),
  ('R26', 'Indice di Esecuzione sotto 50 per 2 settimane',        'giallo', 'Conversazione sul patto operativo con i dati stampati',                                              'noi',     168,  false, false, NULL, true,  52),
  ('R27', 'Più di 5 preventivi fermi da oltre 10 giorni',         'nota',   'Nota nel rapporto e nel report al cliente: denaro fermo già pagato',                                 'sistema', 168,  false, true,  NULL, true,  53),
  ('R28', 'Nessuna vendita in 30 giorni con 20 lead validi',      'giallo', 'Revisione straordinaria: prima ipotesi, vendite non registrate',                                     'noi',     72,   false, false, 20,   true,  60),
  ('R29', 'Provvigione non pagata dopo 7 giorni dalla scadenza',  'giallo', 'Sollecito scritto',                                                                                  'sistema', 0,    false, true,  NULL, true,  61),
  ('R30', 'Provvigione non pagata dopo 15 giorni',                'rosso',  'Chiamata: si concorda una data (script 5)',                                                          'noi',     24,   false, true,  NULL, true,  62),
  ('R31', 'Provvigione non pagata dopo 30 giorni',                'grave',  'Sospensione delle campagne, comunicata per iscritto con 48 ore di preavviso',                        'noi',     0,    false, true,  NULL, true,  63),
  ('R32', 'Ritorno sotto 3× sulla coorte a 90 giorni',            'giallo', 'Aprire il fascicolo della garanzia prima che lo apra il cliente; verificare l''Indice di Esecuzione','noi',     120,  false, false, NULL, false, 64),
  ('R33', 'Venduto oltre il 150% della media dei 3 mesi',         'nota',   'Proporre un aumento del budget, una seconda zona o un secondo settore',                              'noi',     168,  false, false, NULL, true,  65)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.mkt_allarmi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_client_id uuid NOT NULL REFERENCES public.aedix_service_clients(id) ON DELETE CASCADE,
  regola text NOT NULL REFERENCES public.mkt_regole(id),
  gravita text NOT NULL CHECK (gravita IN ('nota','giallo','rosso','grave')),
  titolo text NOT NULL,
  dettaglio jsonb NOT NULL DEFAULT '{}'::jsonb,
  azione text NOT NULL,
  proprietario text NOT NULL,
  scadenza timestamptz,
  aperto_il timestamptz NOT NULL DEFAULT now(),
  aggiornato_il timestamptz NOT NULL DEFAULT now(),
  mostrato boolean NOT NULL DEFAULT true,
  motivo_non_mostrato text,
  conferme_chiusura integer NOT NULL DEFAULT 0,
  rimandato_a date,
  chiuso_il timestamptz,
  esito text CHECK (esito IN ('risolto','falso_positivo','ignorato','scaduto')),
  nota_chiusura text,
  chiuso_da uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_allarmi_aperto_unico ON public.mkt_allarmi (service_client_id, regola) WHERE chiuso_il IS NULL;
CREATE INDEX IF NOT EXISTS idx_mkt_allarmi_cliente_aperti ON public.mkt_allarmi (service_client_id, aperto_il DESC) WHERE chiuso_il IS NULL;
CREATE INDEX IF NOT EXISTS idx_mkt_allarmi_chiusi ON public.mkt_allarmi (service_client_id, regola, chiuso_il DESC) WHERE chiuso_il IS NOT NULL;

-- Peso della gravità: per ordinare e per capire se un allarme è peggiorato.
CREATE OR REPLACE FUNCTION public.mkt_peso_gravita(p text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p WHEN 'grave' THEN 4 WHEN 'rosso' THEN 3 WHEN 'giallo' THEN 2 ELSE 1 END;
$$;

-- Valuta le regole sulle metriche del giorno e apre/aggiorna/chiude gli
-- allarmi. Una regola aperta per volta per cliente; si chiude dopo due
-- valutazioni consecutive con la condizione falsa; dopo la chiusura tace 24
-- ore salvo peggioramento; massimo cinque allarmi mostrati per cliente al
-- giorno; le regole sul CPL vogliono il campione minimo (Parte 5.2).
CREATE OR REPLACE FUNCTION public.mkt_valuta_regole(p_giorno date DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aperti integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'non autorizzato';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS cand (
    service_client_id uuid, regola text, gravita text, titolo text, dettaglio jsonb, mostrabile boolean, motivo text
  ) ON COMMIT DROP;
  TRUNCATE cand;

  WITH m AS (
    SELECT mg.*, sc.cliente_nome, sc.stato AS stato_sc, coalesce(sc.mkt_settore, 'altro') AS settore, sc.mkt_budget_mensile AS budget,
           sc.mkt_pausa_fino_a, sc.mkt_chi_richiama,
           bm.appuntamento_min,
           -- 3 giorni su 7 con mediana > 4 h; CPL > 1,5× per 3 giorni; sotto target 30% per 7 giorni; indice < 50 per 14 giorni
           (SELECT count(*) FROM public.mkt_metriche_giorno h WHERE h.service_client_id = mg.service_client_id AND h.giorno > p_giorno - 7 AND h.giorno <= p_giorno AND h.mediana_primo_contatto_min_7g > 240) AS gg_mediana_alta,
           (SELECT count(*) FROM public.mkt_metriche_giorno h WHERE h.service_client_id = mg.service_client_id AND h.giorno > p_giorno - 3 AND h.giorno <= p_giorno AND h.lead_validi_7g >= 10 AND h.cpl_valido_7g > h.cpl_giallo) AS gg_cpl_giallo,
           (SELECT count(*) FROM public.mkt_metriche_giorno h WHERE h.service_client_id = mg.service_client_id AND h.giorno > p_giorno - 7 AND h.giorno <= p_giorno AND h.lead_validi_7g >= 10 AND h.cpl_valido_7g < h.cpl_target * 0.7) AS gg_cpl_basso,
           (SELECT count(*) FROM public.mkt_metriche_giorno h WHERE h.service_client_id = mg.service_client_id AND h.giorno > p_giorno - 14 AND h.giorno <= p_giorno AND h.indice_esecuzione < 50) AS gg_indice_basso,
           (SELECT count(*) FROM public.mkt_metriche_giorno h WHERE h.service_client_id = mg.service_client_id AND h.giorno > p_giorno - 14 AND h.giorno <= p_giorno AND h.lead_validi_14g >= 40 AND h.tasso_appuntamento_14g < bm.appuntamento_min) AS gg_app_basso,
           -- provvigioni dovute e non incassate: la scadenza è 30 giorni dopo la fine del mese
           (SELECT max((b.periodo + interval '1 month')::date + 30) FROM public.aedix_service_billings b
             WHERE b.service_client_id = mg.service_client_id AND coalesce(b.importo_dovuto, 0) > coalesce(b.importo_incassato, 0)) AS scadenza_piu_vecchia
      FROM public.mkt_metriche_giorno mg
      JOIN public.aedix_service_clients sc ON sc.id = mg.service_client_id
      LEFT JOIN public.mkt_settori_benchmark bm ON bm.settore = coalesce(sc.mkt_settore, 'altro')
     WHERE mg.giorno = p_giorno
  ),
  regole AS (SELECT * FROM public.mkt_regole WHERE attiva AND implementata),
  c AS (
    -- Ogni riga: una regola che oggi è vera per quel cliente. Il titolo dice i numeri.
    SELECT m.service_client_id, r.id AS regola, r.gravita,
           CASE r.id
             WHEN 'R1'  THEN format('%s lead fermi da più di 24 ore di servizio (il più vecchio da %s h)', m.lead_fermi, m.lead_fermo_piu_vecchio_ore)
             WHEN 'R2'  THEN format('un lead fermo da %s ore di servizio', m.lead_fermo_piu_vecchio_ore)
             WHEN 'R3'  THEN format('%s lead fermi contemporaneamente', m.lead_fermi)
             WHEN 'R4'  THEN format('mediana di risposta oltre 4 ore per %s giorni su 7 (oggi %s min)', m.gg_mediana_alta, m.mediana_primo_contatto_min_7g)
             WHEN 'R5'  THEN format('%s lead del mese su %s senza nessun esito (%s%%)', m.opp_senza_esito_mese, m.opp_mese, round(m.opp_senza_esito_mese::numeric / nullif(m.opp_mese, 0) * 100))
             WHEN 'R6'  THEN format('%s € spesi senza nessuna richiesta: %s× il costo normale di una richiesta (%s €)', m.spesa_senza_lead, m.rapporto_zero, m.cpl_target)
             WHEN 'R7'  THEN format('ieri %s € spesi su %s € di budget giornaliero', m.spesa_giorno, m.budget_giornaliero)
             WHEN 'R8'  THEN format('%s € spesi senza nessuna richiesta: %s× il costo normale di una richiesta (%s €)', m.spesa_senza_lead, m.rapporto_zero, m.cpl_target)
             WHEN 'R9'  THEN format('costo per richiesta a %s € (target %s €) da 3 giorni, %s richieste in 7 giorni', m.cpl_valido_7g, m.cpl_target, m.lead_validi_7g)
             WHEN 'R10' THEN format('costo per richiesta a %s €, target %s €: %s×, %s richieste in 7 giorni', m.cpl_valido_7g, m.cpl_target, round(m.cpl_valido_7g / nullif(m.cpl_target, 0), 1), m.lead_validi_7g)
             WHEN 'R11' THEN format('costo per richiesta a %s € contro %s € di target da 7 giorni: c''è spazio per crescere', m.cpl_valido_7g, m.cpl_target)
             WHEN 'R12' THEN format('%s%% del budget consumato, proiezione %s € su %s €', round(m.spesa_mese / nullif(m.budget, 0) * 100), round(m.copertura_budget * m.budget), m.budget)
             WHEN 'R13' THEN format('spesa del mese %s € oltre il budget di %s €', m.spesa_mese, m.budget)
             WHEN 'R16' THEN format('tasso di appuntamento %s%% sotto la banda (%s%%) da 2 settimane', round(m.tasso_appuntamento_14g * 100), round(m.appuntamento_min * 100))
             WHEN 'R18' THEN format('presenza agli appuntamenti %s%% negli ultimi 30 giorni', round(m.tasso_presenza_30g * 100))
             WHEN 'R19' THEN format('collegamento Meta: %s', coalesce(m.meta_stato, 'assente'))
             WHEN 'R20' THEN format('nel CRM %s lead su %s dichiarati da Meta negli ultimi 7 giorni (%s%%)', m.lead_grezzi_7g, m.lead_dichiarati_7g, round(m.scarto_attribuzione_7g * 100))
             WHEN 'R22' THEN format('spesa sincronizzata l''ultima volta alle %s', to_char(m.ultimo_sync AT TIME ZONE 'Europe/Rome', 'DD/MM HH24:MI'))
             WHEN 'R23' THEN format('ieri 0 € di spesa con %s € di budget giornaliero e %s € spesi nella settimana', m.budget_giornaliero, m.spesa_7g)
             WHEN 'R24' THEN format('nessun accesso da %s giorni', m.giorni_dall_ultimo_accesso)
             WHEN 'R25' THEN CASE WHEN m.giorni_dall_ultimo_accesso IS NULL THEN 'nessun utente del cliente è mai entrato nel gestionale' ELSE format('nessun accesso da %s giorni', m.giorni_dall_ultimo_accesso) END
             WHEN 'R26' THEN format('Indice di Esecuzione %s da 14 giorni', m.indice_esecuzione)
             WHEN 'R27' THEN format('%s preventivi inviati da più di 10 giorni senza risposta', m.preventivi_sospesi)
             WHEN 'R28' THEN format('%s richieste buone in 30 giorni e nessuna vendita registrata', m.lead_validi_30g)
             WHEN 'R29' THEN format('provvigione scaduta il %s', to_char(m.scadenza_piu_vecchia, 'DD/MM'))
             WHEN 'R30' THEN format('provvigione scaduta da %s giorni', p_giorno - m.scadenza_piu_vecchia)
             WHEN 'R31' THEN format('provvigione scaduta da %s giorni', p_giorno - m.scadenza_piu_vecchia)
             WHEN 'R33' THEN format('venduto del mese %s € contro una media di %s €', round(m.venduto_mese), round(m.venduto_medio_3m))
           END AS titolo,
           jsonb_strip_nulls(jsonb_build_object(
             'lead_fermi', m.lead_fermi, 'fermo_ore', m.lead_fermo_piu_vecchio_ore, 'mediana_min', m.mediana_primo_contatto_min_7g,
             'spesa_senza_lead', m.spesa_senza_lead, 'rapporto_zero', m.rapporto_zero, 'cpl_target', m.cpl_target, 'cpl_valido_7g', m.cpl_valido_7g,
             'lead_validi_7g', m.lead_validi_7g, 'spesa_mese', m.spesa_mese, 'budget', m.budget, 'copertura', m.copertura_budget,
             'scarto_attribuzione', m.scarto_attribuzione_7g, 'giorni_senza_accesso', m.giorni_dall_ultimo_accesso, 'indice', m.indice_esecuzione)) AS dettaglio,
           -- le tre domande (Parte 5.4): dato sufficiente? Scatta solo se il campione c'è
           (r.campione_minimo IS NULL OR m.lead_validi_7g >= r.campione_minimo OR (r.id = 'R28' AND m.lead_validi_30g >= r.campione_minimo) OR (r.id = 'R16' AND m.lead_validi_14g >= r.campione_minimo)) AS mostrabile,
           CASE WHEN r.campione_minimo IS NOT NULL AND NOT (m.lead_validi_7g >= r.campione_minimo OR (r.id = 'R28' AND m.lead_validi_30g >= r.campione_minimo) OR (r.id = 'R16' AND m.lead_validi_14g >= r.campione_minimo)) THEN 'campione_minimo' END AS motivo
      FROM m
      JOIN regole r ON true
     WHERE NOT (m.stato_cliente = ANY (r.stati_cliente_esclusi))
       AND (r.in_rodaggio OR m.giorni_dall_inizio >= 31)
       AND (NOT r.richiede_dati_freschi OR (m.dati_freschi AND m.spesa_disponibile))
       AND CASE r.id
             WHEN 'R1'  THEN m.lead_fermi >= 1 AND m.lead_fermi < 5 AND m.lead_fermo_piu_vecchio_ore <= 48
             WHEN 'R2'  THEN m.lead_fermi >= 1 AND m.lead_fermi < 5 AND m.lead_fermo_piu_vecchio_ore > 48
             WHEN 'R3'  THEN m.lead_fermi >= 5
             WHEN 'R4'  THEN m.gg_mediana_alta >= 3
             WHEN 'R5'  THEN m.opp_mese >= 10 AND m.opp_senza_esito_mese > 0.2 * m.opp_mese
             WHEN 'R6'  THEN m.rapporto_zero >= 3 AND m.rapporto_zero < 5 AND NOT coalesce(m.sotto_consegna, false)
             WHEN 'R7'  THEN coalesce(m.sotto_consegna, false) AND m.budget_giornaliero > 0 AND m.stato_cliente = 'attivo'
             WHEN 'R8'  THEN m.rapporto_zero >= 5 AND NOT coalesce(m.sotto_consegna, false)
             WHEN 'R9'  THEN m.gg_cpl_giallo >= 3 AND m.cpl_valido_7g <= m.cpl_rosso
             WHEN 'R10' THEN m.cpl_valido_7g > m.cpl_rosso
             WHEN 'R11' THEN m.gg_cpl_basso >= 7
             WHEN 'R12' THEN m.budget > 0 AND m.spesa_mese >= 0.8 * m.budget AND m.spesa_mese <= m.budget AND (extract(day FROM (date_trunc('month', p_giorno) + interval '1 month - 1 day'))::int - extract(day FROM p_giorno)::int) > 5
             WHEN 'R13' THEN m.budget > 0 AND m.spesa_mese > m.budget
             WHEN 'R16' THEN m.gg_app_basso >= 14
             WHEN 'R18' THEN m.tasso_presenza_30g IS NOT NULL AND m.tasso_presenza_30g < 0.7
             WHEN 'R19' THEN m.meta_stato IS NOT NULL AND m.meta_stato <> 'connected'
             WHEN 'R20' THEN m.lead_dichiarati_7g >= 5 AND m.scarto_attribuzione_7g < 0.8
             WHEN 'R22' THEN m.spesa_disponibile AND NOT m.dati_freschi
             WHEN 'R23' THEN m.budget > 0 AND m.spesa_giorno = 0 AND m.spesa_7g > 0 AND m.stato_cliente = 'attivo'
             WHEN 'R24' THEN m.giorni_dall_ultimo_accesso BETWEEN 3 AND 6
             WHEN 'R25' THEN coalesce(m.giorni_dall_ultimo_accesso, 999) >= 7 AND m.giorni_dall_inizio >= 7
             WHEN 'R26' THEN m.gg_indice_basso >= 14
             WHEN 'R27' THEN m.preventivi_sospesi > 5
             WHEN 'R28' THEN m.vendite_30g = 0 AND m.lead_validi_30g >= 20
             WHEN 'R29' THEN m.scadenza_piu_vecchia IS NOT NULL AND p_giorno - m.scadenza_piu_vecchia BETWEEN 7 AND 14
             WHEN 'R30' THEN m.scadenza_piu_vecchia IS NOT NULL AND p_giorno - m.scadenza_piu_vecchia BETWEEN 15 AND 29
             WHEN 'R31' THEN m.scadenza_piu_vecchia IS NOT NULL AND p_giorno - m.scadenza_piu_vecchia >= 30
             WHEN 'R33' THEN m.venduto_medio_3m > 0 AND m.venduto_mese > 1.5 * m.venduto_medio_3m
             ELSE false
           END
  )
  INSERT INTO cand SELECT * FROM c WHERE c.titolo IS NOT NULL;

  -- Una regola aperta per volta: se c'è già, si aggiorna (e se è peggiorata sale di gravità).
  UPDATE public.mkt_allarmi a
     SET titolo = c.titolo, dettaglio = c.dettaglio,
         gravita = CASE WHEN public.mkt_peso_gravita(c.gravita) > public.mkt_peso_gravita(a.gravita) THEN c.gravita ELSE a.gravita END,
         conferme_chiusura = 0, aggiornato_il = now(),
         mostrato = c.mostrabile, motivo_non_mostrato = c.motivo
    FROM cand c
   WHERE a.service_client_id = c.service_client_id AND a.regola = c.regola AND a.chiuso_il IS NULL;

  -- Nuovi allarmi, salvo il silenzio di 24 ore dopo una chiusura con la stessa gravità o peggio.
  INSERT INTO public.mkt_allarmi (service_client_id, regola, gravita, titolo, dettaglio, azione, proprietario, scadenza, mostrato, motivo_non_mostrato)
  SELECT c.service_client_id, c.regola, c.gravita, c.titolo, c.dettaglio, r.azione, r.proprietario,
         CASE WHEN r.scadenza_ore IS NULL THEN NULL WHEN r.scadenza_ore = 0 THEN now() ELSE now() + make_interval(hours => r.scadenza_ore) END,
         c.mostrabile, c.motivo
    FROM cand c JOIN public.mkt_regole r ON r.id = c.regola
   WHERE NOT EXISTS (SELECT 1 FROM public.mkt_allarmi a WHERE a.service_client_id = c.service_client_id AND a.regola = c.regola AND a.chiuso_il IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.mkt_allarmi a WHERE a.service_client_id = c.service_client_id AND a.regola = c.regola
                       AND a.chiuso_il >= now() - interval '24 hours' AND public.mkt_peso_gravita(a.gravita) >= public.mkt_peso_gravita(c.gravita));
  GET DIAGNOSTICS v_aperti = ROW_COUNT;

  -- Isteresi: gli aperti che oggi non risultano più veri si chiudono alla seconda valutazione di fila.
  UPDATE public.mkt_allarmi a
     SET conferme_chiusura = a.conferme_chiusura + 1, aggiornato_il = now()
   WHERE a.chiuso_il IS NULL
     AND a.service_client_id IN (SELECT service_client_id FROM public.mkt_metriche_giorno WHERE giorno = p_giorno)
     AND NOT EXISTS (SELECT 1 FROM cand c WHERE c.service_client_id = a.service_client_id AND c.regola = a.regola);
  UPDATE public.mkt_allarmi a
     SET chiuso_il = now(), esito = 'risolto', aggiornato_il = now()
   WHERE a.chiuso_il IS NULL AND a.conferme_chiusura >= 2;

  -- Tetto: al massimo cinque allarmi mostrati per cliente, per gravità; gli altri restano registrati.
  WITH ord AS (
    SELECT a.id, row_number() OVER (PARTITION BY a.service_client_id ORDER BY public.mkt_peso_gravita(a.gravita) DESC, a.aperto_il) AS rn
      FROM public.mkt_allarmi a WHERE a.chiuso_il IS NULL AND a.motivo_non_mostrato IS DISTINCT FROM 'campione_minimo'
       AND (a.rimandato_a IS NULL OR a.rimandato_a <= p_giorno)
  )
  UPDATE public.mkt_allarmi a
     SET mostrato = (ord.rn <= 5), motivo_non_mostrato = CASE WHEN ord.rn <= 5 THEN NULL ELSE 'tetto_cinque' END
    FROM ord WHERE ord.id = a.id;

  RETURN v_aperti;
END $$;

-- Un giro completo: metriche e poi regole. È quello che chiama il cron.
CREATE OR REPLACE FUNCTION public.mkt_aggiorna(p_giorno date DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_m integer; v_a integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'non autorizzato';
  END IF;
  v_m := public.mkt_calcola_metriche(p_giorno);
  v_a := public.mkt_valuta_regole(p_giorno);
  RETURN jsonb_build_object('clienti', v_m, 'allarmi_nuovi', v_a, 'giorno', p_giorno, 'alle', now());
END $$;

-- Chiudere un allarme dalla console: fatto, non era un problema (alimenta la
-- taratura), oppure rimandato a domani.
CREATE OR REPLACE FUNCTION public.mkt_chiudi_allarme(p_id uuid, p_esito text, p_nota text DEFAULT NULL, p_rimanda_a date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'non autorizzato'; END IF;
  IF p_esito = 'rimandato' THEN
    UPDATE public.mkt_allarmi SET rimandato_a = coalesce(p_rimanda_a, (now() AT TIME ZONE 'Europe/Rome')::date + 1), mostrato = false, motivo_non_mostrato = 'rimandato', aggiornato_il = now()
     WHERE id = p_id AND chiuso_il IS NULL;
  ELSE
    UPDATE public.mkt_allarmi SET chiuso_il = now(), esito = p_esito, nota_chiusura = p_nota, chiuso_da = auth.uid(), aggiornato_il = now()
     WHERE id = p_id AND chiuso_il IS NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Ritaratura delle soglie (Parte 4.4 e 18): ogni lunedì, dal giorno 91
-- ---------------------------------------------------------------------------
-- Il CPL target proposto è la mediana del CPL valido giornaliero degli ultimi
-- 90 giorni, tolta la stagionalità di ciascun giorno (così il target «base» è
-- pulito e la console lo rimoltiplica per il mese in corso). Con almeno 30
-- richieste buone. Soglia manuale: riceve la proposta e non cambia; le altre
-- si aggiornano quando la differenza supera il 10%.
CREATE OR REPLACE FUNCTION public.mkt_ritara_soglie()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_mediana numeric;
  v_validi integer;
  v_n integer := 0;
  v_oggi date := (now() AT TIME ZONE 'Europe/Rome')::date;
  v_ultima record;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'non autorizzato';
  END IF;
  FOR r IN
    SELECT sc.id, sc.company_id, coalesce(sc.mkt_settore, 'altro') AS settore
      FROM public.aedix_service_clients sc JOIN public.aedix_product_lines l ON l.id = sc.product_line_id
     WHERE sc.company_id IS NOT NULL AND l.categoria IN ('agenzia','performance') AND sc.stato = 'attivo'
       AND sc.data_inizio IS NOT NULL AND sc.data_inizio <= v_oggi - 90
  LOOP
    WITH g AS (
      SELECT d::date AS giorno FROM generate_series(v_oggi - 90, v_oggi - 1, interval '1 day') d
    ),
    sp AS (
      SELECT s.giorno, sum(s.spesa) AS spesa FROM (
        SELECT m.giorno, m.spesa FROM public.mkt_spesa_giornaliera m WHERE m.company_id = r.company_id AND m.giorno >= v_oggi - 90
        UNION ALL SELECT k.date, coalesce(k.spend_amount, 0) FROM public.campaign_costs k WHERE k.company_id = r.company_id AND k.date >= v_oggi - 90
      ) s GROUP BY s.giorno
    ),
    ld AS (
      SELECT (mc.created_at AT TIME ZONE 'Europe/Rome')::date AS giorno, count(*) AS n
        FROM public.marketing_contacts mc
       WHERE mc.company_id = r.company_id AND mc.created_at >= ((v_oggi - 90)::timestamp AT TIME ZONE 'Europe/Rome')
         AND nullif(regexp_replace(coalesce(mc.phone, ''), '\D', '', 'g'), '') IS NOT NULL
         AND coalesce(mc.source, '') NOT ILIKE 'fatturazione%'
         AND coalesce(mc.source_channel, '') NOT IN ('cold_import', 'cliente_servizio')
       GROUP BY 1
    )
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY sp.spesa / ld.n / public.mkt_fattore_stagionale(r.settore, extract(month FROM g.giorno)::int)),
           coalesce(sum(ld.n), 0)
      INTO v_mediana, v_validi
      FROM g JOIN sp ON sp.giorno = g.giorno JOIN ld ON ld.giorno = g.giorno
     WHERE sp.spesa > 0;

    IF v_mediana IS NULL OR v_validi < 30 THEN CONTINUE; END IF;
    v_mediana := round(v_mediana, 2);

    SELECT * INTO v_ultima FROM public.mkt_soglie s WHERE s.service_client_id = r.id ORDER BY s.valida_dal DESC LIMIT 1;

    IF v_ultima.id IS NOT NULL AND (v_ultima.origine = 'manuale' OR v_ultima.blocca_ritaratura) THEN
      UPDATE public.mkt_soglie SET cpl_suggerito = v_mediana, suggerito_il = now() WHERE id = v_ultima.id;
    ELSIF v_ultima.id IS NULL OR abs(v_ultima.cpl_target - v_mediana) / v_ultima.cpl_target > 0.10 THEN
      INSERT INTO public.mkt_soglie (service_client_id, valida_dal, origine, cpl_target, cpl_giallo, cpl_rosso,
                                     moltiplicatore_zero_giallo, moltiplicatore_zero_rosso, costo_appuntamento_target, cac_target, roas_minimo, stagionalita_applicata, note)
      VALUES (r.id, v_oggi, 'storico', v_mediana, round(v_mediana * 1.5, 2), round(v_mediana * 2, 2),
              coalesce(v_ultima.moltiplicatore_zero_giallo, 3), coalesce(v_ultima.moltiplicatore_zero_rosso, 5),
              v_ultima.costo_appuntamento_target, v_ultima.cac_target, coalesce(v_ultima.roas_minimo, 3), true,
              format('ritaratura automatica: mediana 90 giorni su %s richieste buone', v_validi))
      ON CONFLICT (service_client_id, valida_dal) DO UPDATE SET cpl_target = EXCLUDED.cpl_target, cpl_giallo = EXCLUDED.cpl_giallo, cpl_rosso = EXCLUDED.cpl_rosso, note = EXCLUDED.note;
      v_n := v_n + 1;
    ELSE
      UPDATE public.mkt_soglie SET cpl_suggerito = v_mediana, suggerito_il = now() WHERE id = v_ultima.id;
    END IF;
  END LOOP;
  RETURN v_n;
END $$;

-- ---------------------------------------------------------------------------
-- 8. I dati del rapporto del mattino (Parte 12), in un JSON solo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mkt_rapporto_mattino(p_giorno date DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH guardia AS (
    SELECT (SELECT public.is_super_admin()) OR coalesce((SELECT auth.jwt() ->> 'role'), '') = 'service_role' OR auth.uid() IS NULL AS ok
  ),
  m AS (
    SELECT mg.*, sc.cliente_nome, sc.mkt_classe AS classe, sc.provvigione_scaglioni, sc.mkt_budget_mensile AS budget, sc.company_id,
           (SELECT avg(h.lead_grezzi_giorno) FROM public.mkt_metriche_giorno h WHERE h.service_client_id = mg.service_client_id AND h.giorno > p_giorno - 7 AND h.giorno <= p_giorno) AS media_lead_7g,
           -- venduto del mese per la provvigione: fatture se collegate, altrimenti vendite del CRM
           coalesce((SELECT sum((CASE WHEN i.document_type = 'credit_note' THEN -1 ELSE 1 END) * coalesce(i.subtotal, 0))
                       FROM public.invoices i WHERE i.company_id = sc.company_id AND i.deleted_at IS NULL
                        AND i.issue_date >= date_trunc('month', p_giorno)::date AND i.issue_date < (date_trunc('month', p_giorno) + interval '1 month')::date
                        AND coalesce(i.status, '') NOT IN ('draft','cancelled','annullata')),
                    CASE WHEN EXISTS (SELECT 1 FROM public.invoices i WHERE i.company_id = sc.company_id AND i.deleted_at IS NULL) THEN 0 END,
                    mg.venduto_mese) AS venduto_base
      FROM public.mkt_metriche_giorno mg
      JOIN public.aedix_service_clients sc ON sc.id = mg.service_client_id
     WHERE mg.giorno = p_giorno AND (SELECT ok FROM guardia)
  ),
  clienti AS (
    SELECT m.service_client_id, m.cliente_nome, m.classe, m.stato_cliente, m.semaforo, m.semaforo_componenti,
           m.lead_grezzi_giorno, round(m.media_lead_7g, 1) AS media_lead_7g, m.lead_grezzi_7g, m.lead_validi_7g,
           m.spesa_giorno, m.spesa_7g, m.spesa_mese, m.budget, m.copertura_budget,
           m.cpl_valido_7g, m.cpl_grezzo_7g, m.cpl_target, m.cpl_giallo, m.cpl_rosso, m.fattore_stagionale,
           m.lead_fermi, m.lead_fermo_piu_vecchio_ore, m.mediana_primo_contatto_min_7g,
           m.appuntamenti_14g, m.costo_appuntamento_14g, m.tasso_appuntamento_14g,
           m.vendite_mese, m.venduto_mese, m.venduto_base,
           public.aedix_provvigione_scaglioni(greatest(0, m.venduto_base), m.provvigione_scaglioni) AS provvigione_mese,
           m.indice_esecuzione, m.giorni_dall_ultimo_accesso, m.dati_freschi, m.ultimo_sync, m.spesa_disponibile, m.rapporto_zero, m.spesa_senza_lead
      FROM m
  ),
  allarmi AS (
    SELECT a.id, a.service_client_id, c.cliente_nome, c.classe, a.regola, a.gravita, a.titolo, a.azione, a.proprietario, a.scadenza, a.aperto_il, a.mostrato, a.motivo_non_mostrato
      FROM public.mkt_allarmi a JOIN clienti c ON c.service_client_id = a.service_client_id
     WHERE a.chiuso_il IS NULL AND (a.rimandato_a IS NULL OR a.rimandato_a <= p_giorno)
  ),
  ordinati AS (
    SELECT al.*, row_number() OVER (ORDER BY public.mkt_peso_gravita(al.gravita) DESC, coalesce(al.classe, 'B'), al.aperto_il) AS rn
      FROM allarmi al WHERE al.mostrato AND al.gravita IN ('grave','rosso','giallo')
  )
  SELECT jsonb_build_object(
    'giorno', p_giorno,
    'stato', jsonb_build_object(
      'attivi', (SELECT count(*) FROM clienti WHERE stato_cliente = 'attivo'),
      'verdi', (SELECT count(*) FROM clienti WHERE stato_cliente = 'attivo' AND semaforo = 'V'),
      'gialli', (SELECT count(*) FROM clienti WHERE stato_cliente = 'attivo' AND semaforo = 'G'),
      'rossi', (SELECT count(*) FROM clienti WHERE stato_cliente = 'attivo' AND semaforo = 'R'),
      'non_leggibili', (SELECT count(*) FROM clienti WHERE stato_cliente = 'attivo' AND semaforo = 'N'),
      'aggiornato_alle', (SELECT max(calcolato_il) FROM m),
      'dati_vecchi', (SELECT coalesce(jsonb_agg(jsonb_build_object('cliente', cliente_nome, 'fermo_dalle', ultimo_sync)), '[]'::jsonb) FROM clienti WHERE spesa_disponibile AND NOT dati_freschi)),
    'clienti', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY (c.stato_cliente = 'attivo') DESC, public.mkt_peso_gravita(CASE c.semaforo WHEN 'R' THEN 'rosso' WHEN 'G' THEN 'giallo' ELSE 'nota' END) DESC, c.lead_grezzi_7g DESC), '[]'::jsonb) FROM clienti c),
    'azioni', (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.rn), '[]'::jsonb) FROM ordinati o WHERE o.rn <= 5),
    'da_guardare', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY public.mkt_peso_gravita(x.gravita) DESC, x.aperto_il), '[]'::jsonb) FROM (
                      SELECT * FROM ordinati o WHERE o.rn > 5
                      UNION ALL SELECT al.*, NULL::bigint FROM allarmi al WHERE al.mostrato AND al.gravita = 'nota'
                    ) x),
    'altri_allarmi', (SELECT count(*) FROM allarmi WHERE NOT mostrato),
    'ieri', jsonb_build_object(
      'lead', (SELECT coalesce(sum(lead_grezzi_giorno), 0) FROM clienti WHERE stato_cliente = 'attivo'),
      'media_7g', (SELECT round(coalesce(sum(media_lead_7g), 0), 1) FROM clienti WHERE stato_cliente = 'attivo'),
      'spesa', (SELECT coalesce(sum(spesa_giorno), 0) FROM clienti WHERE stato_cliente = 'attivo'),
      'vendite_registrate', (SELECT count(*) FROM public.marketing_opportunities o JOIN m ON m.company_id = o.company_id
                              WHERE o.deleted_at IS NULL AND o.status = 'won' AND coalesce(o.won_at, o.updated_at) >= ((p_giorno - 1)::timestamp AT TIME ZONE 'Europe/Rome') AND coalesce(o.won_at, o.updated_at) < (p_giorno::timestamp AT TIME ZONE 'Europe/Rome')),
      'valore_vendite', (SELECT coalesce(sum(o.value), 0) FROM public.marketing_opportunities o JOIN m ON m.company_id = o.company_id
                          WHERE o.deleted_at IS NULL AND o.status = 'won' AND coalesce(o.won_at, o.updated_at) >= ((p_giorno - 1)::timestamp AT TIME ZONE 'Europe/Rome') AND coalesce(o.won_at, o.updated_at) < (p_giorno::timestamp AT TIME ZONE 'Europe/Rome'))),
    'denaro', jsonb_build_object(
      'provvigioni_mese', (SELECT coalesce(sum(provvigione_mese), 0) FROM clienti WHERE stato_cliente = 'attivo'),
      'fatture_scadute', (SELECT coalesce(jsonb_agg(jsonb_build_object('cliente', sc.cliente_nome, 'importo', b.importo_dovuto - coalesce(b.importo_incassato, 0), 'scaduta_da_giorni', p_giorno - ((b.periodo + interval '1 month')::date + 30))), '[]'::jsonb)
                            FROM public.aedix_service_billings b JOIN public.aedix_service_clients sc ON sc.id = b.service_client_id
                           WHERE b.service_client_id IN (SELECT service_client_id FROM clienti)
                             AND coalesce(b.importo_dovuto, 0) > coalesce(b.importo_incassato, 0) AND (b.periodo + interval '1 month')::date + 30 < p_giorno)),
    'silenzi', (SELECT coalesce(jsonb_agg(jsonb_build_object('cliente', cliente_nome, 'giorni_senza_lead', giorni_senza_lead, 'giorni_senza_accesso', giorni_dall_ultimo_accesso)), '[]'::jsonb)
                  FROM (SELECT c.cliente_nome, c.giorni_dall_ultimo_accesso,
                               (p_giorno - (SELECT (max(mc.created_at) AT TIME ZONE 'Europe/Rome')::date FROM public.marketing_contacts mc JOIN m ON m.service_client_id = c.service_client_id WHERE mc.company_id = m.company_id
                                             AND coalesce(mc.source, '') NOT ILIKE 'fatturazione%' AND coalesce(mc.source_channel, '') NOT IN ('cold_import','cliente_servizio'))) AS giorni_senza_lead
                          FROM clienti c WHERE c.stato_cliente = 'attivo') s
                 WHERE coalesce(s.giorni_senza_lead, 99) > 3 AND coalesce(s.giorni_dall_ultimo_accesso, 99) > 3)
  );
$$;

-- ---------------------------------------------------------------------------
-- 9. Permessi e RLS: solo super admin dalla console, ruolo di servizio dai job
-- ---------------------------------------------------------------------------
ALTER TABLE public.mkt_settori_benchmark ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_soglie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_spesa_giornaliera ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_metriche_giorno ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_regole ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_allarmi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mkt_settori_benchmark_super_admin ON public.mkt_settori_benchmark;
CREATE POLICY mkt_settori_benchmark_super_admin ON public.mkt_settori_benchmark FOR ALL TO authenticated USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
DROP POLICY IF EXISTS mkt_soglie_super_admin ON public.mkt_soglie;
CREATE POLICY mkt_soglie_super_admin ON public.mkt_soglie FOR ALL TO authenticated USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
DROP POLICY IF EXISTS mkt_spesa_giornaliera_super_admin ON public.mkt_spesa_giornaliera;
CREATE POLICY mkt_spesa_giornaliera_super_admin ON public.mkt_spesa_giornaliera FOR ALL TO authenticated USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
DROP POLICY IF EXISTS mkt_metriche_giorno_super_admin ON public.mkt_metriche_giorno;
CREATE POLICY mkt_metriche_giorno_super_admin ON public.mkt_metriche_giorno FOR ALL TO authenticated USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
DROP POLICY IF EXISTS mkt_regole_super_admin ON public.mkt_regole;
CREATE POLICY mkt_regole_super_admin ON public.mkt_regole FOR ALL TO authenticated USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
DROP POLICY IF EXISTS mkt_allarmi_super_admin ON public.mkt_allarmi;
CREATE POLICY mkt_allarmi_super_admin ON public.mkt_allarmi FOR ALL TO authenticated USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));

REVOKE ALL ON FUNCTION public.mkt_fattore_stagionale(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_soglia_di(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_minuti_lavorativi(timestamptz, timestamptz, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_calcola_metriche(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_peso_gravita(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_valuta_regole(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_aggiorna(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_chiudi_allarme(uuid, text, text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_ritara_soglie() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_rapporto_mattino(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_fattore_stagionale(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mkt_soglia_di(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mkt_minuti_lavorativi(timestamptz, timestamptz, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mkt_calcola_metriche(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mkt_peso_gravita(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mkt_valuta_regole(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mkt_aggiorna(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mkt_chiudi_allarme(uuid, text, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mkt_ritara_soglie() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mkt_rapporto_mattino(date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. I cron (UTC): metriche 05:30 Roma, regole ogni 2 ore, rapporto 06:00 Roma,
--     ritaratura il lunedì. Il rapporto ha due job (04:00 e 05:00 UTC) perché
--     l'ora legale cambia: la funzione tiene solo quello che cade alle 06:00.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mkt-calcola-metriche') THEN
    PERFORM cron.schedule('mkt-calcola-metriche', '30 3 * * *', $job$ SELECT public.mkt_aggiorna(); $job$);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mkt-motore-regole') THEN
    PERFORM cron.schedule('mkt-motore-regole', '50 5,7,9,11,13,15,17,19 * * *', $job$ SELECT public.mkt_aggiorna(); $job$);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mkt-ritara-soglie') THEN
    PERFORM cron.schedule('mkt-ritara-soglie', '0 3 * * 1', $job$ SELECT public.mkt_ritara_soglie(); $job$);
  END IF;
  -- Il rapporto del mattino passa dalle 08:00 alle 06:00 ora di Roma.
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'clienti-marketing-mattino';
  IF v_id IS NOT NULL THEN PERFORM cron.unschedule(v_id); END IF;
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'clienti-marketing-mattino-inverno';
  IF v_id IS NOT NULL THEN PERFORM cron.unschedule(v_id); END IF;
  PERFORM cron.schedule('clienti-marketing-mattino', '0 4 * * *', $job$
      SELECT net.http_post(
        url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/ops-canarino',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)
        ),
        body := '{"modo":"clienti-marketing","ora_roma":6}'::jsonb,
        timeout_milliseconds := 60000
      );
    $job$);
  PERFORM cron.schedule('clienti-marketing-mattino-inverno', '0 5 * * *', $job$
      SELECT net.http_post(
        url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/ops-canarino',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)
        ),
        body := '{"modo":"clienti-marketing","ora_roma":6}'::jsonb,
        timeout_milliseconds := 60000
      );
    $job$);
END $$;
