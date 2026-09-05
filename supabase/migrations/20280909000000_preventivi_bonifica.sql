-- ============================================================================
-- Preventivi: stati riallineati, numerazione sicura, libreria di partenza,
-- versione automatica all'invio
-- ============================================================================
-- Audit del 05/09/2026 (artifact "Audit Preventivi"). Quattro correzioni al
-- database; le altre (conversione, sconto lato server, opzioni PDF) stanno
-- nelle edge function.
-- ============================================================================

-- ─── 1. Stati nella forma vecchia ───────────────────────────────────────────
-- Il trigger aa_quotes_normalizza_stato riporta ogni stato alla forma canonica
-- (accettata, inviata…) ma solo sulle righe che passano di lì: 32 preventivi
-- erano rimasti con «accettato», «inviato», «visto», «firmato», «rifiutato»,
-- «scaduto». Per loro la scheda non mostrava Reinvia/Converti, la conversione
-- li rifiutava e la vista unificata non li contava. Si riallineano SENZA far
-- scattare automazioni e notifiche: è una bonifica, non un evento.
ALTER TABLE public.quotes DISABLE TRIGGER trg_fire_quote_automation;
ALTER TABLE public.quotes DISABLE TRIGGER trg_quotes_preventivo_inviato;
ALTER TABLE public.quotes DISABLE TRIGGER trg_activity_quotes;
ALTER TABLE public.quotes DISABLE TRIGGER trg_log_quote_status_change;
ALTER TABLE public.quotes DISABLE TRIGGER trg_quotes_opp_value;
ALTER TABLE public.quotes DISABLE TRIGGER set_quote_expires_at;

UPDATE public.quotes
   SET status = public.normalizza_stato_preventivo(status)
 WHERE status IS NOT NULL
   AND status <> public.normalizza_stato_preventivo(status);

ALTER TABLE public.quotes ENABLE TRIGGER trg_fire_quote_automation;
ALTER TABLE public.quotes ENABLE TRIGGER trg_quotes_preventivo_inviato;
ALTER TABLE public.quotes ENABLE TRIGGER trg_activity_quotes;
ALTER TABLE public.quotes ENABLE TRIGGER trg_log_quote_status_change;
ALTER TABLE public.quotes ENABLE TRIGGER trg_quotes_opp_value;
ALTER TABLE public.quotes ENABLE TRIGGER set_quote_expires_at;

-- ─── 2. Numerazione ─────────────────────────────────────────────────────────
-- Prima: COUNT(*)+1 sull'anno, senza lock né vincolo. Due salvataggi insieme
-- davano lo stesso numero; lo svuotamento del cestino abbassava il conteggio e
-- il numero successivo poteva coincidere con uno già emesso. Ora un contatore
-- per azienda e anno, incrementato sotto lock, e un indice univoco: un numero
-- doppio non può più entrare, e se la RPC fallisce il client si ferma invece
-- di inventarne uno (QuoteBuilder).
CREATE TABLE IF NOT EXISTS public.quote_number_counters (
  company_id uuid    NOT NULL,
  anno       integer NOT NULL,
  ultimo     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, anno)
);
ALTER TABLE public.quote_number_counters ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.quote_number_counters IS
  'Ultimo progressivo OFF-<anno>-NNN emesso per azienda. Toccato solo da generate_quote_number (SECURITY DEFINER, sotto advisory lock). Nessuna policy: gli utenti non lo leggono né lo scrivono.';

CREATE OR REPLACE FUNCTION public.generate_quote_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_anno    integer := EXTRACT(YEAR FROM now())::integer;
  v_ultimo  integer;
BEGIN
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  -- Un solo salvataggio alla volta per azienda e anno, dentro la transazione.
  PERFORM pg_advisory_xact_lock(hashtext('quote_number:' || p_company_id::text || ':' || v_anno::text));

  -- Primo uso dell'anno: si riparte dal massimo già emesso (cestinati compresi,
  -- così un numero purgato non torna in circolo), non dal conteggio.
  INSERT INTO public.quote_number_counters (company_id, anno, ultimo)
  SELECT p_company_id, v_anno,
         COALESCE(MAX(substring(quote_number from '^OFF-[0-9]{4}-([0-9]+)$')::integer), 0)
    FROM public.quotes
   WHERE company_id = p_company_id
     AND quote_number ~ ('^OFF-' || v_anno::text || '-[0-9]+$')
  ON CONFLICT (company_id, anno) DO NOTHING;

  UPDATE public.quote_number_counters
     SET ultimo = ultimo + 1
   WHERE company_id = p_company_id AND anno = v_anno
  RETURNING ultimo INTO v_ultimo;

  RETURN 'OFF-' || v_anno::text || '-' || lpad(v_ultimo::text, 3, '0');
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quotes_company_number
  ON public.quotes (company_id, quote_number)
  WHERE deleted_at IS NULL AND quote_number IS NOT NULL;

-- ─── 3. Libreria di partenza per ogni azienda ───────────────────────────────
-- Zero moduli globali: un'azienda nuova apriva «Libreria Template Preventivi»
-- e trovava una pagina vuota, e il PDF usciva senza condizioni né parte
-- legale. Ogni azienda riceve copertina, condizioni contrattuali, termini
-- legali e un'offerta predefinita che li compone — tutto modificabile.
CREATE OR REPLACE FUNCTION public.seed_quote_templates(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cover uuid; v_terms uuid; v_legal uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.quote_templates WHERE company_id = p_company_id AND kind = 'offerta') THEN
    RETURN;
  END IF;

  INSERT INTO public.quote_templates (company_id, kind, name, description, is_active, is_default, body_format,
    cover_title, cover_subtitle, show_cover_image)
  VALUES (p_company_id, 'copertina', 'Copertina standard',
    'Prima pagina dell''offerta: titolo con il nome del cliente e sottotitolo con il numero del preventivo.',
    true, false, 'markdown',
    'Offerta per {{cliente.nome_completo}}', 'Preventivo {{preventivo.numero}} · {{azienda.ragione_sociale}}', false)
  RETURNING id INTO v_cover;

  INSERT INTO public.quote_templates (company_id, kind, name, description, is_active, is_default, body_format, body_html)
  VALUES (p_company_id, 'condizioni', 'Condizioni contrattuali',
    'Oggetto, prezzi e pagamenti, tempi, variazioni, garanzia, validità. Modificabile.',
    true, false, 'markdown',
$md$# Condizioni contrattuali

## 1. Oggetto
{{azienda.ragione_sociale}} si impegna a eseguire i lavori e le forniture descritti nel preventivo {{preventivo.numero}} per {{cliente.nome_completo}} presso {{cantiere.indirizzo}}.

## 2. Prezzi e pagamenti
Importo complessivo {{preventivo.totale}} (IVA {{preventivo.iva}}). Piano di pagamento: {{preventivo.piano_pagamenti}}. In caso di ritardo nei pagamenti si applicano gli interessi di mora ai sensi del D.Lgs. 231/2002.

## 3. Tempi di esecuzione
I tempi indicati nel preventivo decorrono dalla conferma dell'ordine e dal versamento dell'acconto, e si intendono in giorni lavorativi salvo cause di forza maggiore o ritardi imputabili al committente.

## 4. Variazioni
Ogni lavorazione non prevista nel preventivo verrà quotata a parte e richiederà l'approvazione scritta del committente prima dell'esecuzione.

## 5. Garanzia
I lavori sono garantiti per 24 mesi dalla consegna ai sensi degli artt. 1667 e 1669 del Codice Civile; i prodotti forniti sono coperti dalla garanzia del produttore.

## 6. Validità
Il presente preventivo è valido fino al {{preventivo.scadenza}}.
$md$)
  RETURNING id INTO v_terms;

  INSERT INTO public.quote_templates (company_id, kind, name, description, is_active, is_default, body_format, body_html)
  VALUES (p_company_id, 'legali', 'Termini legali',
    'Diritto di ripensamento, privacy, foro competente. Modificabile.',
    true, false, 'markdown',
$md$# Termini legali

## Diritto di ripensamento
Per i contratti conclusi fuori dai locali commerciali con un consumatore, il committente può recedere entro 14 giorni dalla firma ai sensi degli artt. 52 e seguenti del Codice del Consumo (D.Lgs. 206/2005). Per i beni realizzati su misura o personalizzati il diritto di ripensamento non si applica (art. 59, lett. c).

## Trattamento dei dati
I dati del committente sono trattati da {{azienda.ragione_sociale}} per l'esecuzione del contratto e gli adempimenti di legge, ai sensi del Regolamento (UE) 2016/679.

## Foro competente
Per ogni controversia è competente il foro del luogo in cui ha sede {{azienda.ragione_sociale}}, salvo il foro del consumatore ove previsto per legge.
$md$)
  RETURNING id INTO v_legal;

  INSERT INTO public.quote_templates (company_id, kind, name, description, is_active, is_default, body_format,
    linked_cover_id, linked_terms_id, linked_legal_id, show_contractual_terms, show_legal_terms, layout)
  VALUES (p_company_id, 'offerta', 'Offerta standard',
    'Copertina + preventivo + condizioni contrattuali + termini legali.',
    true, true, 'markdown', v_cover, v_terms, v_legal, true, true, 'classic');
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_seed_quote_templates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.seed_quote_templates(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_quote_templates ON public.companies;
CREATE TRIGGER trg_seed_quote_templates
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.tg_seed_quote_templates();

-- Le aziende che esistono già e non hanno un'offerta.
SELECT public.seed_quote_templates(c.id)
  FROM public.companies c
 WHERE NOT EXISTS (SELECT 1 FROM public.quote_templates t WHERE t.company_id = c.id AND t.kind = 'offerta');

-- ─── 4. Versione automatica all'invio ───────────────────────────────────────
-- quote_versions aveva zero righe: la versione la salvava solo chi premeva
-- «Salva versione». Il momento che conta è l'invio: da lì in poi quel testo e
-- quei numeri sono ciò che il cliente ha visto. Snapshot nella stessa forma
-- della funzione salva-versione-preventivo, così la scheda lo mostra uguale.
CREATE OR REPLACE FUNCTION public.tg_quote_versione_all_invio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_num integer;
BEGIN
  SELECT COALESCE(MAX(version_num), 0) + 1 INTO v_num
    FROM public.quote_versions WHERE quote_id = NEW.id;

  INSERT INTO public.quote_versions (quote_id, company_id, version_num, snapshot, created_by, note)
  VALUES (
    NEW.id, NEW.company_id, v_num,
    jsonb_build_object(
      'quote', to_jsonb(NEW),
      'items', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.sort_order) FROM public.quote_items i WHERE i.quote_id = NEW.id), '[]'::jsonb),
      'saved_at', now()
    ),
    COALESCE(auth.uid(), NEW.assigned_to, NEW.created_by),
    'Versione inviata al cliente'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_versione_all_invio ON public.quotes;
CREATE TRIGGER trg_quote_versione_all_invio
  AFTER UPDATE OF status ON public.quotes
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'inviata')
  EXECUTE FUNCTION public.tg_quote_versione_all_invio();
